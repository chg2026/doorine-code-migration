// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client, type Notification } from "pg";

import { publishBillingChanged, subscribeBillingEvents } from "@/lib/billingEvents";
import { prisma } from "@/lib/prisma";

const PG_CHANNEL = "billing_changed";

const DATABASE_URL = process.env.DATABASE_URL;

function makeWaiter(opts: { match?: (payload: string) => boolean } = {}) {
  let resolve!: (payload: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  let fired = false;
  const handler = (payload: string) => {
    if (fired) return;
    if (opts.match && !opts.match(payload)) return;
    fired = true;
    resolve(payload);
  };
  return {
    promise,
    handler,
    get fired() {
      return fired;
    },
  };
}

async function makeRawSubscriber(): Promise<{
  client: Client;
  onNotify: (cb: (payload: string) => void) => void;
}> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`LISTEN ${PG_CHANNEL}`);
  const callbacks: Array<(payload: string) => void> = [];
  client.on("notification", (msg: Notification) => {
    if (msg.channel !== PG_CHANNEL) return;
    const payload = msg.payload ?? "";
    for (const cb of callbacks) cb(payload);
  });
  return {
    client,
    onNotify(cb) {
      callbacks.push(cb);
    },
  };
}

type BillingGlobals = {
  __billingPgClient?: Client | null;
  __billingPgConnecting?: Promise<void> | null;
  __billingListeners?: Map<string, Set<() => void>>;
};

async function waitForInProcessListenerReady(timeoutMs = 5000): Promise<void> {
  const g = globalThis as unknown as BillingGlobals;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (g.__billingPgConnecting) {
      try {
        await g.__billingPgConnecting;
      } catch {
        /* will retry below */
      }
    }
    if (g.__billingPgClient) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("in-process billing listener never became ready");
}

async function tearDownInProcessListener() {
  const g = globalThis as unknown as BillingGlobals;
  if (g.__billingPgConnecting) {
    try {
      await g.__billingPgConnecting;
    } catch {
      /* noop */
    }
  }
  if (g.__billingPgClient) {
    try {
      await g.__billingPgClient.end();
    } catch {
      /* already gone */
    }
    g.__billingPgClient = null;
  }
  g.__billingListeners?.clear();
}

const rawSubs: Awaited<ReturnType<typeof makeRawSubscriber>>[] = [];

describe("billingEvents cross-instance fan-out", () => {
  beforeAll(() => {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL must be set to run cross-instance billing tests");
    }
  });

  afterEach(async () => {
    while (rawSubs.length) {
      const sub = rawSubs.pop()!;
      try {
        await sub.client.end();
      } catch {
        /* noop */
      }
    }
    await tearDownInProcessListener();
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => {});
  });

  it("fans a publish out to two independent pg.Client subscribers (simulating two instances)", async () => {
    const subA = await makeRawSubscriber();
    const subB = await makeRawSubscriber();
    rawSubs.push(subA, subB);

    const companyId = `company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const waiterA = makeWaiter({ match: (p) => p === companyId });
    const waiterB = makeWaiter({ match: (p) => p === companyId });
    subA.onNotify(waiterA.handler);
    subB.onNotify(waiterB.handler);

    publishBillingChanged(companyId);

    const [payloadA, payloadB] = await Promise.all([
      Promise.race([
        waiterA.promise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("subscriber A did not receive notify")), 5000),
        ),
      ]),
      Promise.race([
        waiterB.promise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("subscriber B did not receive notify")), 5000),
        ),
      ]),
    ]);

    expect(payloadA).toBe(companyId);
    expect(payloadB).toBe(companyId);
  });

  it("only wakes subscribers for the matching companyId", async () => {
    const companyA = `companyA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const companyB = `companyB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let aCalls = 0;
    let bCalls = 0;
    const unsubA = subscribeBillingEvents(companyA, () => {
      aCalls += 1;
    });
    const unsubB = subscribeBillingEvents(companyB, () => {
      bCalls += 1;
    });
    await waitForInProcessListenerReady();

    // Use a raw subscriber as a barrier: once we see the NOTIFY for companyA
    // round-trip back from Postgres, the in-process listener has also
    // processed it (both go through the same backend mechanism).
    const barrier = await makeRawSubscriber();
    rawSubs.push(barrier);
    const seen = makeWaiter({ match: (p) => p === companyA });
    barrier.onNotify(seen.handler);

    publishBillingChanged(companyA);

    await Promise.race([
      seen.promise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("barrier did not see companyA notify")), 5000),
      ),
    ]);

    // Give the in-process listener one tick to fan out after the barrier saw
    // the same notification; both clients receive NOTIFY independently from
    // Postgres, so we may need a brief drain.
    for (let i = 0; i < 20 && aCalls === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(aCalls).toBe(1);
    expect(bCalls).toBe(0);

    unsubA();
    unsubB();
  });

  it("resumes fan-out to in-process subscribers after the pg connection drops and reconnects", async () => {
    const companyId = `reconnect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let calls = 0;
    const unsub = subscribeBillingEvents(companyId, () => {
      calls += 1;
    });
    await waitForInProcessListenerReady();

    const g = globalThis as unknown as BillingGlobals & {
      __billingPgReconnectDelayMs?: number;
      __billingPgReconnectScheduled?: boolean;
    };

    // Grab the active client before we disconnect it.
    const originalClient = g.__billingPgClient!;
    expect(originalClient).toBeTruthy();

    // Speed up the scheduled reconnect so the test doesn't take a full second.
    // Save the old value so afterEach teardown starts from a clean slate.
    const savedDelay = g.__billingPgReconnectDelayMs;
    g.__billingPgReconnectDelayMs = 50;

    // Simulate a Postgres restart by emitting `end` on the active client.
    // The billingEvents `end` handler will null out __billingPgClient and
    // call scheduleReconnect(), which should bring up a fresh client.
    originalClient.emit("end");

    // The client handle should have been cleared immediately.
    expect(g.__billingPgClient).toBeNull();

    // Truly sever the original connection so it can no longer receive NOTIFY
    // messages. This ensures any post-reconnect callback invocation can only
    // come through the newly reconnected listener, not the stale client.
    try {
      await originalClient.end();
    } catch {
      /* already torn down by emit("end") above — that's fine */
    }

    // Wait for the reconnect timer to fire and a new client to become ready.
    await waitForInProcessListenerReady(8000);

    // The new client must be a different object.
    const newClient = g.__billingPgClient!;
    expect(newClient).toBeTruthy();
    expect(newClient).not.toBe(originalClient);

    // Restore the delay so subsequent tests aren't affected by our override.
    g.__billingPgReconnectDelayMs = savedDelay;

    // Use a raw subscriber as a barrier: once Postgres echoes the NOTIFY back
    // through the raw connection we know the in-process listener has also had
    // a chance to process it (same backend broadcast).
    const barrier = await makeRawSubscriber();
    rawSubs.push(barrier);
    const seen = makeWaiter({ match: (p) => p === companyId });
    barrier.onNotify(seen.handler);

    publishBillingChanged(companyId);

    await Promise.race([
      seen.promise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("barrier did not receive notify after reconnect")), 6000),
      ),
    ]);

    // Drain any in-flight fan-out ticks from the in-process listener.
    for (let i = 0; i < 20 && calls === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(calls).toBeGreaterThanOrEqual(1);

    unsub();
  });

  it("stops invoking the callback after unsubscribe()", async () => {
    const companyId = `companyC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let calls = 0;
    const unsub = subscribeBillingEvents(companyId, () => {
      calls += 1;
    });
    await waitForInProcessListenerReady();

    // Warm-up publish: ensure the in-process LISTEN connection is fully up
    // and that the subscribe path works at all before we exercise unsubscribe.
    const barrier1 = await makeRawSubscriber();
    rawSubs.push(barrier1);
    const seen1 = makeWaiter({ match: (p) => p === companyId });
    barrier1.onNotify(seen1.handler);

    publishBillingChanged(companyId);
    await Promise.race([
      seen1.promise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("warm-up notify never arrived")), 5000),
      ),
    ]);
    for (let i = 0; i < 20 && calls === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(calls).toBe(1);

    // Now unsubscribe and publish again. The barrier still sees it, but our
    // unsubscribed callback must not.
    unsub();

    const barrier2 = await makeRawSubscriber();
    rawSubs.push(barrier2);
    const seen2 = makeWaiter({ match: (p) => p === companyId });
    barrier2.onNotify(seen2.handler);

    publishBillingChanged(companyId);
    await Promise.race([
      seen2.promise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("post-unsubscribe notify never arrived")), 5000),
      ),
    ]);
    // Drain any straggling fan-out; the assertion below is the real check.
    await new Promise((r) => setTimeout(r, 100));

    expect(calls).toBe(1);
  });
});

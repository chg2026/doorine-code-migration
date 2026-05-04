import { Client, type Notification } from "pg";
import { prisma } from "@/lib/prisma";

/**
 * Cross-instance pub/sub for "this company's billing state just changed"
 * notifications. Used by the SSE endpoint at /api/billing/stream so the
 * top-nav billing badge updates within seconds of a Stripe webhook
 * (invoice paid/failed, subscription status change), regardless of which
 * autoscale instance received the webhook.
 *
 * Transport: Postgres LISTEN/NOTIFY on a single channel (`billing_changed`),
 * with the companyId carried in the NOTIFY payload. A single dedicated
 * `pg.Client` per process holds the LISTEN connection and fans out to the
 * in-process subscribers. Publishes go through the existing Prisma
 * connection pool via `pg_notify(...)` — no extra connection per publish.
 *
 * The UI keeps a long fallback poll as a safety net (network partitions,
 * Postgres restart races, etc.), but day-to-day fan-out runs through here.
 */

const PG_CHANNEL = "billing_changed";

type Listener = () => void;

const globalForBillingEvents = globalThis as unknown as {
  __billingListeners?: Map<string, Set<Listener>>;
  __billingPgClient?: Client | null;
  __billingPgConnecting?: Promise<void> | null;
  __billingPgReconnectDelayMs?: number;
  __billingPgReconnectScheduled?: boolean;
};

function getListeners(): Map<string, Set<Listener>> {
  if (!globalForBillingEvents.__billingListeners) {
    globalForBillingEvents.__billingListeners = new Map();
  }
  return globalForBillingEvents.__billingListeners;
}

function fanout(companyId: string): void {
  const set = getListeners().get(companyId);
  if (!set || set.size === 0) return;
  // Snapshot before iterating in case a listener unsubscribes itself.
  for (const fn of Array.from(set)) {
    try {
      fn();
    } catch {
      /* never let one bad listener break the fan-out */
    }
  }
}

async function ensurePgListener(): Promise<void> {
  if (globalForBillingEvents.__billingPgClient) return;
  if (globalForBillingEvents.__billingPgConnecting) {
    return globalForBillingEvents.__billingPgConnecting;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for billing event listener");
  }

  const connecting = (async () => {
    const client = new Client({ connectionString: url });

    client.on("notification", (msg: Notification) => {
      if (msg.channel !== PG_CHANNEL) return;
      const companyId = msg.payload;
      if (!companyId) return;
      fanout(companyId);
    });

    client.on("error", (err) => {
      // Connection-level error: log and tear down so the next subscriber (or
      // the scheduled reconnect below) brings up a fresh client.
      console.error("[billingEvents] pg listener error", err);
      void resetAndReconnect();
    });

    client.on("end", () => {
      // Server closed the connection (Postgres restart, idle reaper, etc).
      // Drop our handle so callers fall through to a reconnect.
      if (globalForBillingEvents.__billingPgClient === client) {
        globalForBillingEvents.__billingPgClient = null;
        if (getListeners().size > 0) {
          scheduleReconnect();
        }
      }
    });

    await client.connect();
    await client.query(`LISTEN ${PG_CHANNEL}`);
    globalForBillingEvents.__billingPgClient = client;
    // Healthy connect — reset backoff so the next failure starts fast.
    globalForBillingEvents.__billingPgReconnectDelayMs = 1000;
  })().finally(() => {
    globalForBillingEvents.__billingPgConnecting = null;
  });

  globalForBillingEvents.__billingPgConnecting = connecting;
  return connecting;
}

function scheduleReconnect(): void {
  if (globalForBillingEvents.__billingPgReconnectScheduled) return;
  globalForBillingEvents.__billingPgReconnectScheduled = true;

  const delay = globalForBillingEvents.__billingPgReconnectDelayMs ?? 1000;
  // Exponential backoff capped at 30s so we don't hammer a flapping DB.
  globalForBillingEvents.__billingPgReconnectDelayMs = Math.min(delay * 2, 30_000);

  setTimeout(() => {
    globalForBillingEvents.__billingPgReconnectScheduled = false;
    if (getListeners().size === 0) return;
    ensurePgListener().catch((err) => {
      console.error("[billingEvents] reconnect failed", err);
      scheduleReconnect();
    });
  }, delay).unref?.();
}

async function resetAndReconnect(): Promise<void> {
  const client = globalForBillingEvents.__billingPgClient;
  globalForBillingEvents.__billingPgClient = null;
  if (client) {
    try {
      await client.end();
    } catch {
      /* already torn down */
    }
  }
  if (getListeners().size > 0) {
    scheduleReconnect();
  }
}

/**
 * Subscribe to billing-changed notifications for a single company. Returns
 * an unsubscribe function that the caller MUST invoke when the consumer
 * (e.g. an SSE stream) closes.
 *
 * The first subscriber lazily opens the dedicated Postgres LISTEN
 * connection; subsequent subscribers reuse it. Multiple subscribers for
 * the same company in the same process share a single fan-out entry.
 */
export function subscribeBillingEvents(
  companyId: string,
  listener: () => void,
): () => void {
  const map = getListeners();
  let set = map.get(companyId);
  if (!set) {
    set = new Set();
    map.set(companyId, set);
  }
  set.add(listener);

  // Lazily start the cross-instance listener once we have at least one
  // subscriber. Failures are logged but do not throw to the caller — the
  // SSE stream stays open and the client's fallback poll covers the gap.
  ensurePgListener().catch((err) => {
    console.error("[billingEvents] failed to initialize pg listener", err);
    scheduleReconnect();
  });

  return () => {
    const s = map.get(companyId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) map.delete(companyId);
  };
}

/**
 * Publish a "billing state changed" notification for a company. Safe to
 * call from anywhere on the server — fire-and-forget, never throws.
 *
 * Goes through the shared Prisma connection pool via `pg_notify(...)` so
 * every instance with an active LISTEN session receives the event,
 * including the publisher's own SSE clients.
 */
export function publishBillingChanged(companyId: string): void {
  // `pg_notify(text, text)` is the parameter-binding-safe equivalent of
  // the `NOTIFY <channel>, '<payload>'` SQL command.
  prisma
    .$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${companyId})`
    .catch((err) => {
      console.error("[billingEvents] publish failed", err);
    });
}

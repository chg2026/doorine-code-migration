import { getCurrentUser } from "@/lib/auth";
import { subscribeBillingEvents } from "@/lib/billingEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream that notifies the caller's company whenever the
 * billing state changes (Stripe webhook fired: invoice paid/failed, sub
 * status change, etc). The client refetches the read endpoint it already
 * uses (/api/billing or /api/billing/status) on every notification.
 *
 * Auth-scoped to the caller's companyId so non-admins can subscribe safely
 * — the stream itself never carries sensitive billing details, only a
 * `{type:"changed"}` invalidation ping.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const companyId = user.companyId;

  // Hoisted teardown handle so the ReadableStream's `cancel()` can also fire
  // it. Set inside `start()` once we have something to tear down.
  let teardown: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Two independent flags: `controllerDead` means we can no longer
      // enqueue, `cleanedUp` means we've already released subscriptions and
      // timers. They must not be conflated — an enqueue failure should NOT
      // skip the listener/interval cleanup.
      let controllerDead = false;
      let cleanedUp = false;

      const safeEnqueue = (chunk: string) => {
        if (controllerDead) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          controllerDead = true;
        }
      };

      const sendEvent = (payload: unknown) => {
        safeEnqueue(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // Initial frame so the client knows the stream is live.
      sendEvent({ type: "ready" });

      const unsubscribe = subscribeBillingEvents(companyId, () => {
        sendEvent({ type: "changed" });
      });

      // Comment-only heartbeat keeps proxies from closing the connection on
      // idle. Browsers ignore comment frames.
      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, 25_000);

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
        if (!controllerDead) {
          controllerDead = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };

      teardown = cleanup;

      // Browser navigated away / tab closed / network dropped. `once: true`
      // so the same signal can't double-fire teardown.
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      // Guarantees teardown when the consumer cancels the stream (e.g.
      // Next.js tearing down the response without the request signal
      // firing first).
      teardown?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx, etc) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}

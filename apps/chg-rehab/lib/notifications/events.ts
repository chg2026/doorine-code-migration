/**
 * Shared notification-event identifiers and types.
 *
 * Lives in a leaf module separate from `dispatch.ts` so client components and
 * API routes can import the type/constant set without dragging the full
 * Prisma + Node-only dispatch dependency tree (e.g. `node:crypto` from the
 * unsubscribe signer) into a client bundle.
 */

export type NotifyEvent =
  | "drawApprovals"
  | "docExpiry"
  | "allocations"
  | "missingUpdates"
  | "exceptions";

export const NOTIFY_EVENT_KEYS: NotifyEvent[] = [
  "drawApprovals",
  "docExpiry",
  "allocations",
  "missingUpdates",
  "exceptions",
];

export type EventChannels = { email: boolean; inApp: boolean };

export type EventsMeta = Partial<Record<NotifyEvent, EventChannels>>;

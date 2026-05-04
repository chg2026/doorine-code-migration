"use client";

/**
 * Client-side helpers for recognising the shared billing-block response
 * (see `lib/billing-gate.ts`) and keeping the top-nav <BillingNavBadge />
 * in sync with the inline error messages shown in modals/forms.
 */

export const BILLING_BLOCKED_CODE = "billing_blocked";
export const BILLING_BLOCKED_STATUS = 402;
export const BILLING_BLOCKED_MESSAGE =
  "Your admin needs to fix a billing problem before this action will work.";

/**
 * Browser event the badge listens for. Any client that detects a billing
 * block response should dispatch this so the badge polls its status
 * endpoint immediately instead of waiting up to 60s for the next poll.
 */
export const BILLING_REFRESH_EVENT = "billing:refresh";

/** Returns true if the given fetch response/body is a billing-block error. */
export function isBillingBlockedResponse(
  status: number,
  body: unknown
): boolean {
  if (status !== BILLING_BLOCKED_STATUS) return false;
  if (!body || typeof body !== "object") return false;
  return (body as { code?: unknown }).code === BILLING_BLOCKED_CODE;
}

/**
 * Notify the top-nav badge (and any other listeners) that billing-blocked
 * was just observed, so they can re-fetch their status immediately.
 */
export function notifyBillingBlocked(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
}

/**
 * Convenience: given a non-OK fetch response and its parsed JSON body,
 * return the user-facing error message — substituting the friendly
 * billing-block copy when applicable, and dispatching the badge refresh
 * event as a side effect so the top nav stays in sync.
 */
export function billingAwareErrorMessage(
  status: number,
  body: unknown,
  fallback: string
): string {
  if (isBillingBlockedResponse(status, body)) {
    notifyBillingBlocked();
    return BILLING_BLOCKED_MESSAGE;
  }
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

import { NextResponse } from "next/server";
import { companyHasBillingIssue } from "./stripe";

/**
 * Shared "billing must be in good standing" gate for write actions that
 * non-admin teammates can attempt (invites, creating projects, uploading
 * documents, assigning contractors, etc.).
 *
 * When billing is broken (past_due / unpaid / latest invoice failed), every
 * gated endpoint returns the same shape so the client can detect it and show
 * a consistent inline explanation:
 *
 *   { error: BILLING_BLOCKED_MESSAGE, code: "billing_blocked" }   status 402
 *
 * 402 ("Payment Required") matches the existing `seat_limit_reached` style
 * used in the admin invite endpoint.
 */
export const BILLING_BLOCKED_CODE = "billing_blocked";
export const BILLING_BLOCKED_STATUS = 402;
export const BILLING_BLOCKED_MESSAGE =
  "Your admin needs to fix a billing problem before this action will work.";

/**
 * Typed error thrown by `assertBillingOk` so server actions can distinguish
 * a billing block from other failures without parsing error messages.
 */
export class BillingBlockedError extends Error {
  readonly code = BILLING_BLOCKED_CODE;
  constructor() {
    super(BILLING_BLOCKED_MESSAGE);
    this.name = "BillingBlockedError";
  }
}

/**
 * Throws `BillingBlockedError` when the company currently has an active
 * billing problem. Use inside server actions after auth/role checks, before
 * any write operations.
 */
export async function assertBillingOk(companyId: string): Promise<void> {
  const blocked = await companyHasBillingIssue(companyId);
  if (blocked) throw new BillingBlockedError();
}

/**
 * Returns a ready-to-return `NextResponse` if the company currently has an
 * active billing problem, or `null` if the action should proceed. Callers
 * should `if (blocked) return blocked;` immediately after their auth/role
 * checks.
 */
export async function billingBlockedResponse(
  companyId: string
): Promise<NextResponse | null> {
  const blocked = await companyHasBillingIssue(companyId);
  if (!blocked) return null;
  return NextResponse.json(
    { error: BILLING_BLOCKED_MESSAGE, code: BILLING_BLOCKED_CODE },
    { status: BILLING_BLOCKED_STATUS }
  );
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { companyHasBillingIssue } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Lightweight, user-scoped endpoint. Returns ONLY a boolean indicating
 * whether the caller's company has an active billing problem. Safe for
 * non-admin teammates (PMs/GCs/Subs/Inspectors) to call so the top-nav can
 * render a read-only badge — no sensitive billing details are exposed.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paymentIssue = await companyHasBillingIssue(user.companyId);
  return NextResponse.json({ paymentIssue });
}

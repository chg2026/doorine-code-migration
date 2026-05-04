import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Per-investor notification preferences. Events are open-strings keyed by the
 * portal UI: distribution | document | update | newdeal | captable. Defaults
 * (when no row exists) are email=true, inApp=true.
 */
const VALID_EVENTS = new Set([
  "distribution",
  "document",
  "update",
  "newdeal",
  "captable",
]);

export async function GET() {
  const investor = await getCurrentInvestor();
  if (!investor)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const prefs = await prisma.investorNotificationPreference.findMany({
    where: { investorId: investor.id },
    select: { event: true, email: true, inApp: true },
  });
  return NextResponse.json({ prefs });
}

export async function PUT(req: Request) {
  const investor = await getCurrentInvestor();
  if (!investor)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { event?: string; email?: boolean; inApp?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = (body.event || "").toString();
  if (!VALID_EVENTS.has(event)) {
    return NextResponse.json({ error: "unknown_event" }, { status: 400 });
  }
  const email = typeof body.email === "boolean" ? body.email : true;
  const inApp = typeof body.inApp === "boolean" ? body.inApp : true;

  await prisma.investorNotificationPreference.upsert({
    where: { investorId_event: { investorId: investor.id, event } },
    update: { email, inApp },
    create: { investorId: investor.id, event, email, inApp },
  });

  return NextResponse.json({ ok: true });
}

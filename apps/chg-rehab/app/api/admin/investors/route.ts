import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  InvestorAccreditedStatus,
  InvestorStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

  const investors = await prisma.investor.findMany({
    where: {
      companyId: me.companyId,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: { select: { committedAmount: true, fundedAmount: true } },
    },
  });

  return NextResponse.json({
    investors: investors.map((i) => ({
      id: i.id,
      email: i.email,
      firstName: i.firstName,
      lastName: i.lastName,
      phone: i.phone,
      accreditedStatus: i.accreditedStatus,
      status: i.status,
      portalLastLoginAt: i.portalLastLoginAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      committedTotal: i.subscriptions
        .reduce((s, x) => s + Number(x.committedAmount), 0),
      fundedTotal: i.subscriptions
        .reduce((s, x) => s + Number(x.fundedAmount), 0),
      subscriptionCount: i.subscriptions.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const status =
    typeof body.status === "string" &&
    (Object.values(InvestorStatus) as string[]).includes(body.status)
      ? (body.status as InvestorStatus)
      : InvestorStatus.Lead;
  const accreditedStatus =
    typeof body.accreditedStatus === "string" &&
    (Object.values(InvestorAccreditedStatus) as string[]).includes(
      body.accreditedStatus
    )
      ? (body.accreditedStatus as InvestorAccreditedStatus)
      : InvestorAccreditedStatus.Unverified;

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });

  // Investor.id is the Supabase auth uid once they sign up. For a brand-new
  // lead with no auth user yet, we mint a synthetic id; it gets replaced
  // when they accept the invite (the signup route updates by email).
  const synthId = `lead_${crypto.randomUUID()}`;

  const existing = email
    ? await prisma.investor.findUnique({ where: { email } })
    : null;
  if (existing) {
    return NextResponse.json(
      { error: "An investor with that email already exists" },
      { status: 409 }
    );
  }

  const created = await prisma.investor.create({
    data: {
      id: synthId,
      companyId: me.companyId,
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      phone,
      accreditedStatus,
      status,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "investor_created",
      entity: "Investor",
      entityId: created.id,
      message: `Added investor ${email}`,
    },
  });

  return NextResponse.json({ ok: true, investor: { id: created.id } });
}

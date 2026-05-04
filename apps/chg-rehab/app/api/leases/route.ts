import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { Prisma } from "@prisma/client";
import { normaliseLeaseStatus } from "@/lib/normalise-lease-status";

export const dynamic = "force-dynamic";

type Body = {
  propertyId?: string;
  tenantName?: string;
  contactId?: string | null;
  rent?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  deposit?: number | string | null;
  leaseDoc?: string | null;
  leaseDocFileKey?: string | null;
  autoRenew?: string | null;
  meta?: Record<string, unknown> | null;
};

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseDecimal(
  v: number | string | null | undefined
): Prisma.Decimal | null {
  if (v == null || v === "") return null;
  try {
    return new Prisma.Decimal(v);
  } catch {
    return null;
  }
}

/**
 * List all leases for the authenticated user's company.
 *
 * Any rows whose `status` column contains a legacy / unrecognised value are
 * silently normalised in the response to one of the four canonical values
 * (Active | Expired | Terminated | Pending).  Rows that were remapped are
 * flagged with `_statusNormalised: true` so callers can decide whether to
 * surface a warning or trigger a background fix.
 *
 * Optional query params:
 *   ?propertyId=<id>  — filter by property
 *   ?status=<value>   — filter by canonical status (after normalisation)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId") ?? undefined;
  const statusFilter = searchParams.get("status") ?? undefined;

  const rows = await prisma.lease.findMany({
    where: {
      companyId: user.companyId,
      ...(propertyId ? { propertyId } : {}),
    },
    orderBy: { startDate: "desc" },
  });

  const leases = rows.map((row) => {
    const { normalised, changed } = normaliseLeaseStatus(row.status);
    return {
      ...row,
      status: normalised,
      ...(changed ? { _statusNormalised: true } : {}),
    };
  });

  const filtered = statusFilter
    ? leases.filter((l) => l.status === statusFilter)
    : leases;

  return NextResponse.json({ leases: filtered });
}

/**
 * Create a new Lease, optionally linked to a Tenant Contact via
 * `meta.contactId`. The Tenants tab uses this when adding a tenant via the
 * Contacts API in two steps, but most callers should prefer
 * `POST /api/contacts` which can create the Contact + Lease atomically.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as Body;

  const VALID_STATUSES = ["Active", "Expired", "Terminated", "Pending"];

  const propertyId = (body.propertyId || "").trim();
  const tenantName = (body.tenantName || "").trim();
  if (!propertyId) {
    return NextResponse.json(
      { error: "propertyId is required" },
      { status: 400 }
    );
  }
  if (!tenantName) {
    return NextResponse.json(
      { error: "tenantName is required" },
      { status: 400 }
    );
  }
  const statusValue = body.status?.trim() || "Active";
  if (!VALID_STATUSES.includes(statusValue)) {
    return NextResponse.json(
      { error: `Invalid status — must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, companyId: user.companyId },
    select: { id: true },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const meta: Record<string, unknown> =
    body.meta && typeof body.meta === "object"
      ? { ...(body.meta as Record<string, unknown>) }
      : {};
  if (body.contactId !== undefined) meta.contactId = body.contactId ?? null;
  if (body.deposit !== undefined) {
    const dep = parseDecimal(body.deposit);
    meta.deposit = dep ? dep.toNumber() : null;
  }
  if (body.leaseDoc !== undefined) meta.leaseDoc = body.leaseDoc ?? null;
  if (body.leaseDocFileKey !== undefined) {
    meta.leaseDocFileKey = body.leaseDocFileKey ?? null;
  }
  if (body.autoRenew !== undefined) meta.autoRenew = body.autoRenew ?? null;

  const lease = await prisma.lease.create({
    data: {
      companyId: user.companyId,
      propertyId,
      tenantName,
      rent: parseDecimal(body.rent),
      startDate: parseDate(body.startDate ?? null),
      endDate: parseDate(body.endDate ?? null),
      status: statusValue,
      meta: meta as Prisma.InputJsonValue,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "lease.create",
      entity: "Lease",
      entityId: lease.id,
      message: `Created lease for ${tenantName}`,
      meta: { leaseId: lease.id, propertyId },
    },
  });

  return NextResponse.json({ ok: true, lease });
}

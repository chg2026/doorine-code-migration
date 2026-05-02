import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { Prisma } from "@prisma/client";

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
 * Patch an existing Lease. All fields optional — fields omitted from the body
 * are left untouched. The `meta` object is shallow-merged with the existing
 * meta so callers can update one key without losing the others.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const lease = await prisma.lease.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const VALID_STATUSES = ["Active", "Expired", "Terminated", "Pending"];
  if (body.status !== undefined && body.status !== null) {
    const statusValue = body.status.trim();
    if (statusValue && !VALID_STATUSES.includes(statusValue)) {
      return NextResponse.json(
        { error: `Invalid status — must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (body.propertyId !== undefined) {
    const prop = await prisma.property.findFirst({
      where: { id: body.propertyId, companyId: user.companyId },
      select: { id: true },
    });
    if (!prop) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }
  }

  // Shallow-merge meta so updating one key (e.g. leaseDocFileKey) preserves
  // the others (deposit, autoRenew, contactId, etc).
  const prevMeta =
    lease.meta && typeof lease.meta === "object"
      ? (lease.meta as Record<string, unknown>)
      : {};
  const mergedMeta: Record<string, unknown> = { ...prevMeta };
  if (body.meta && typeof body.meta === "object") {
    Object.assign(mergedMeta, body.meta);
  }
  if (body.contactId !== undefined) mergedMeta.contactId = body.contactId ?? null;
  if (body.deposit !== undefined) {
    const dep = parseDecimal(body.deposit);
    mergedMeta.deposit = dep ? dep.toNumber() : null;
  }
  if (body.leaseDoc !== undefined) mergedMeta.leaseDoc = body.leaseDoc ?? null;
  if (body.leaseDocFileKey !== undefined) {
    mergedMeta.leaseDocFileKey = body.leaseDocFileKey ?? null;
  }
  if (body.autoRenew !== undefined) mergedMeta.autoRenew = body.autoRenew ?? null;

  const updated = await prisma.lease.update({
    where: { id: lease.id },
    data: {
      propertyId: body.propertyId ?? lease.propertyId,
      tenantName:
        body.tenantName !== undefined && body.tenantName.trim()
          ? body.tenantName.trim()
          : lease.tenantName,
      rent:
        body.rent !== undefined ? parseDecimal(body.rent) : lease.rent,
      startDate:
        body.startDate !== undefined
          ? parseDate(body.startDate)
          : lease.startDate,
      endDate:
        body.endDate !== undefined ? parseDate(body.endDate) : lease.endDate,
      status:
        body.status !== undefined && body.status?.trim()
          ? body.status.trim()
          : lease.status,
      meta: mergedMeta as Prisma.InputJsonValue,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "lease.update",
      entity: "Lease",
      entityId: updated.id,
      message: `Updated lease for ${updated.tenantName}`,
      meta: { leaseId: updated.id },
    },
  });

  return NextResponse.json({ ok: true, lease: updated });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { ContactType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type LeasePayload = {
  leaseId?: string;
  propertyId?: string;
  rent?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  deposit?: number | string | null;
  leaseDoc?: string | null;
  leaseDocFileKey?: string | null;
  autoRenew?: string | null;
};

type Body = {
  type?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  meta?: Record<string, unknown> | null;
  lease?: LeasePayload | null;
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
 * Create a new Contact. Currently only supports `type: "Tenant"` from the
 * Tenants tab — this is the only contact type that has a UI "Add" affordance
 * today. Other types are still managed via the seed script / direct DB. When
 * creating a tenant the caller may also create or link a Lease in the same
 * request via the `lease` field. The Lease's `meta.contactId` is set to the
 * new contact's id so the Tenants list can resolve the tenant ↔ lease link.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Restrict tenant creation to Admin / ProjectManager — the same roles that
  // can edit projects and properties. Other roles can still view tenants.
  if (user.role !== "Admin" && user.role !== "ProjectManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as Body;

  const ALLOWED_TYPES: ContactType[] = [
    ContactType.Tenant,
    ContactType.Contractor,
    ContactType.Subcontractor,
    ContactType.Vendor,
    ContactType.Inspector,
    ContactType.Other,
  ];

  const typeStr = (body.type || "Tenant").trim() as ContactType;
  if (!ALLOWED_TYPES.includes(typeStr)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Non-tenant types: create and return immediately (no lease logic).
  if (typeStr !== ContactType.Tenant) {
    const rawMeta = (body.meta && typeof body.meta === "object")
      ? (body.meta as Record<string, unknown>)
      : {};
    const tradeVal = (typeof rawMeta.trade === "string" ? rawMeta.trade.trim() : null) || null;
    const companyVal = (typeof rawMeta.company === "string" ? rawMeta.company.trim() : null) || null;
    const { trade: _t, company: _c, ...restMeta } = rawMeta;
    const contactMeta = Object.keys(restMeta).length > 0 ? restMeta : undefined;

    const contact = await prisma.$transaction(async (tx) => {
      const c = await tx.contact.create({
        data: {
          companyId: user.companyId,
          type: typeStr,
          name,
          company: companyVal,
          trade: tradeVal,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          address: body.address?.trim() || null,
          notes: body.notes?.trim() || null,
          meta: contactMeta as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "contact.create",
          entity: "Contact",
          entityId: c.id,
          message: `Created ${typeStr.toLowerCase()} ${c.name}`,
          meta: { contactId: c.id },
        },
      });
      return c;
    });
    return NextResponse.json({ ok: true, contact });
  }

  const lease = body.lease ?? null;

  // Resolve / validate lease attachment up-front so we can fail before
  // creating the Contact (avoids orphaned tenants on bad input).
  let existingLease: Awaited<ReturnType<typeof prisma.lease.findFirst>> = null;
  if (lease?.leaseId) {
    existingLease = await prisma.lease.findFirst({
      where: { id: lease.leaseId, companyId: user.companyId },
    });
    if (!existingLease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }
  } else if (lease && lease.propertyId) {
    const prop = await prisma.property.findFirst({
      where: { id: lease.propertyId, companyId: user.companyId },
      select: { id: true },
    });
    if (!prop) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }
  }

  const contactMeta = (body.meta && typeof body.meta === "object")
    ? (body.meta as Record<string, unknown>)
    : undefined;

  const created = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        companyId: user.companyId,
        type: ContactType.Tenant,
        name,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        notes: body.notes?.trim() || null,
        meta: contactMeta as Prisma.InputJsonValue | undefined,
      },
    });

    let leaseRow: Awaited<ReturnType<typeof tx.lease.findFirst>> = null;
    if (existingLease) {
      // Link existing lease: set tenantName + meta.contactId, optionally
      // attach a new lease doc fileKey if one was uploaded.
      const prevMeta =
        (existingLease.meta && typeof existingLease.meta === "object"
          ? (existingLease.meta as Record<string, unknown>)
          : {});
      const mergedMeta: Record<string, unknown> = { ...prevMeta };
      mergedMeta.contactId = contact.id;
      if (lease?.leaseDoc !== undefined) mergedMeta.leaseDoc = lease.leaseDoc ?? null;
      if (lease?.leaseDocFileKey !== undefined) {
        mergedMeta.leaseDocFileKey = lease.leaseDocFileKey ?? null;
      }
      if (lease?.deposit !== undefined) {
        const dep = parseDecimal(lease.deposit);
        mergedMeta.deposit = dep ? dep.toNumber() : null;
      }
      if (lease?.autoRenew !== undefined) mergedMeta.autoRenew = lease.autoRenew ?? null;

      leaseRow = await tx.lease.update({
        where: { id: existingLease.id },
        data: {
          tenantName: name,
          rent: parseDecimal(lease?.rent) ?? existingLease.rent,
          startDate: lease?.startDate !== undefined
            ? parseDate(lease.startDate)
            : existingLease.startDate,
          endDate: lease?.endDate !== undefined
            ? parseDate(lease.endDate)
            : existingLease.endDate,
          status: lease?.status?.trim() || existingLease.status,
          meta: mergedMeta as Prisma.InputJsonValue,
        },
      });
    } else if (lease && lease.propertyId) {
      const dep = parseDecimal(lease.deposit);
      const newMeta: Record<string, unknown> = { contactId: contact.id };
      if (dep) newMeta.deposit = dep.toNumber();
      if (lease.leaseDoc) newMeta.leaseDoc = lease.leaseDoc;
      if (lease.leaseDocFileKey) newMeta.leaseDocFileKey = lease.leaseDocFileKey;
      if (lease.autoRenew) newMeta.autoRenew = lease.autoRenew;

      leaseRow = await tx.lease.create({
        data: {
          companyId: user.companyId,
          propertyId: lease.propertyId,
          tenantName: name,
          rent: parseDecimal(lease.rent),
          startDate: parseDate(lease.startDate ?? null),
          endDate: parseDate(lease.endDate ?? null),
          status: lease.status?.trim() || "Active",
          meta: newMeta as Prisma.InputJsonValue,
        },
      });
    }

    await tx.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "contact.create",
        entity: "Contact",
        entityId: contact.id,
        message: `Created tenant ${contact.name}${
          leaseRow ? ` and ${existingLease ? "linked" : "created"} lease` : ""
        }`,
        meta: { contactId: contact.id, leaseId: leaseRow?.id ?? null },
      },
    });

    return { contact, lease: leaseRow };
  });

  return NextResponse.json({ ok: true, ...created });
}

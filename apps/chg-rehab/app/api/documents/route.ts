import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DocLevel, DocStatus } from "@prisma/client";
import { getCompanySettings } from "@/lib/companySettings";
import { effectiveDocStatus } from "@/lib/docStatus";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.level || !body?.category)
    return NextResponse.json({ error: "name, level, category required" }, { status: 400 });

  if (!Object.values(DocLevel).includes(body.level))
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });

  const status: DocStatus = Object.values(DocStatus).includes(body.status)
    ? body.status
    : DocStatus.Active;

  // Validate FK refs are within the company
  if (body.projectId) {
    const ok = await prisma.project.findFirst({
      where: { id: body.projectId, companyId: user.companyId },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (body.propertyId) {
    const ok = await prisma.property.findFirst({
      where: { id: body.propertyId, companyId: user.companyId },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (body.contactId) {
    const ok = await prisma.contact.findFirst({
      where: { id: body.contactId, companyId: user.companyId },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const doc = await prisma.document.create({
    data: {
      companyId: user.companyId,
      level: body.level,
      category: String(body.category),
      name: String(body.name).trim(),
      status,
      fileKey: body.fileKey ?? null,
      mimeType: body.mimeType ?? null,
      size: body.size ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      uploadedById: user.id,
      projectId: body.projectId ?? null,
      propertyId: body.propertyId ?? null,
      contactId: body.contactId ?? null,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "doc_uploaded",
      entity: "Document",
      entityId: doc.id,
      meta: { name: doc.name, level: doc.level, status: doc.status },
    },
  });

  if (doc.expiresAt) {
    const settings = await getCompanySettings(user.companyId);
    const eff = effectiveDocStatus(
      doc.status,
      doc.expiresAt,
      settings.expiryAlertThresholdDays || 60
    );
    if (eff === "expiring" || eff === "expired") {
      const project = doc.projectId
        ? await prisma.project.findUnique({
            where: { id: doc.projectId },
            select: { code: true },
          })
        : null;
      const daysOut = Math.ceil((doc.expiresAt.getTime() - Date.now()) / 86_400_000);
      const lapsed = daysOut < 0;
      await dispatchNotification({
        companyId: user.companyId,
        event: "docExpiry",
        projectId: doc.projectId,
        contactIds: doc.contactId ? [doc.contactId] : undefined,
        title: lapsed
          ? `Document expired: ${doc.name}`
          : `Document expiring in ${daysOut} day${daysOut === 1 ? "" : "s"}: ${doc.name}`,
        body: lapsed
          ? `${doc.name} expired ${Math.abs(daysOut)} day${Math.abs(daysOut) === 1 ? "" : "s"} ago.`
          : `${doc.name} enters the expiry window. Renew before ${doc.expiresAt.toISOString().slice(0, 10)}.`,
        link: project?.code ? `/rehab/${project.code}/documents` : `/docs`,
        meta: { documentId: doc.id, expiresAt: doc.expiresAt.toISOString(), lapsed, daysOut },
        urgent: lapsed,
        dedupeKey: `docExpiry:${doc.id}:${lapsed ? "lapsed" : "warning"}`,
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, id: doc.id });
}

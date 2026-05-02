import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DocLevel } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const category = String(body.category || "Other").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const fileKey = body.objectKey ? String(body.objectKey).trim() : null;

  const doc = await prisma.document.create({
    data: {
      companyId: user.companyId,
      level: DocLevel.Property,
      category,
      name,
      propertyId: property.id,
      uploadedById: user.id,
      expiresAt,
      fileKey,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "document.uploaded",
      entity: "Document",
      entityId: doc.id,
      message: `${name} uploaded to ${property.code}`,
    },
  });

  return NextResponse.json({ id: doc.id });
}

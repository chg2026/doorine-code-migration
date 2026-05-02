import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body?.category)
    return NextResponse.json({ error: "category required" }, { status: 400 });

  const doc = await prisma.document.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status !== "Staged")
    return NextResponse.json({ error: "Document is not staged" }, { status: 400 });

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      category: String(body.category),
      status: "Active",
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "doc_promoted",
      entity: "Document",
      entityId: doc.id,
      meta: { name: doc.name, fromCategory: doc.category, toCategory: body.category },
    },
  });
  return NextResponse.json({ ok: true });
}

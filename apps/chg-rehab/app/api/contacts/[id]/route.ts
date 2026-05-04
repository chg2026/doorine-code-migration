import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Body = {
  meta?: Record<string, unknown>;
};

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
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const prevMeta =
    contact.meta && typeof contact.meta === "object"
      ? (contact.meta as Record<string, unknown>)
      : {};
  const mergedMeta: Record<string, unknown> = { ...prevMeta };
  if (body.meta && typeof body.meta === "object") {
    Object.assign(mergedMeta, body.meta);
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { meta: mergedMeta as Prisma.InputJsonValue },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "contact.update",
      entity: "Contact",
      entityId: updated.id,
      message: `Updated contact ${updated.name}`,
      meta: { contactId: updated.id },
    },
  });

  return NextResponse.json({ ok: true, contact: updated });
}

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin-only toggle for `Contact.emailOptOut` — used by the contractor detail
 * panel so admins can manually opt a contractor back in (typically after the
 * contractor calls / replies asking to receive notifications again) or
 * pre-emptively opt one out.
 */

async function setOptOut(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  optOut: boolean
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, name: true, emailOptOut: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  if (contact.emailOptOut === optOut) {
    return NextResponse.json({ ok: true, emailOptOut: contact.emailOptOut });
  }

  try {
    await prisma.$transaction([
      prisma.contact.update({
        where: { id: contact.id },
        data: {
          emailOptOut: optOut,
          emailOptOutAt: optOut ? new Date() : null,
        },
      }),
      prisma.activityLogEntry.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: optOut ? "contact.email_opt_out" : "contact.email_opt_in",
          entity: "Contact",
          entityId: contact.id,
          message: optOut
            ? `Disabled notification emails for ${contact.name}`
            : `Re-enabled notification emails for ${contact.name}`,
          meta: { contactId: contact.id },
        },
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, emailOptOut: optOut });
}

export function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return setOptOut(req, ctx, true);
}

export function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return setOptOut(req, ctx, false);
}

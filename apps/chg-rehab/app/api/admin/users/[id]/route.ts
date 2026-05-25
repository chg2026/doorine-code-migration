import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { syncSeatQuantity } from "@/lib/stripe";

const ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.Admin,
  UserRole.ProjectManager,
  UserRole.GeneralContractor,
  UserRole.Subcontractor,
  UserRole.Inspector,
];

export const dynamic = "force-dynamic";

function parseRole(input: unknown): UserRole | null {
  if (typeof input !== "string") return null;
  return ASSIGNABLE_ROLES.find((r) => r === input) ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { role?: string };
  const role = parseRole(body.role);
  if (!role)
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!me.isSuperAdmin && target.companyId !== me.companyId))
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!target.active)
    return NextResponse.json(
      { error: "Cannot change the role of a deactivated user" },
      { status: 400 }
    );

  if (target.role === role)
    return NextResponse.json({ ok: true, unchanged: true });

  // Block any role transition that would leave the company with zero active
  // admins. The previous version only counted self-demotion against total
  // admins (including inactive ones), which let the last *active* admin
  // demote themselves whenever an old removed admin row was lying around.
  if (target.role === UserRole.Admin && role !== UserRole.Admin) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        companyId: me.companyId,
        role: UserRole.Admin,
        active: true,
        id: { not: target.id },
      },
    });
    if (otherActiveAdmins === 0)
      return NextResponse.json(
        {
          error:
            target.id === me.id
              ? "You're the only admin — promote someone else first"
              : "Can't demote the last admin — promote someone else first",
        },
        { status: 400 }
      );
  }

  const previousRole = target.role;
  await prisma.user.update({ where: { id }, data: { role } });

  const targetName =
    [target.firstName, target.lastName].filter(Boolean).join(" ") ||
    target.email ||
    "User";

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "user_role_changed",
      entity: "User",
      entityId: target.id,
      message: `Changed ${targetName}'s role from ${previousRole} to ${role}`,
      meta: { from: previousRole, to: role, email: target.email },
    },
  });

  return NextResponse.json({ ok: true, previousRole, role });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (id === me.id)
    return NextResponse.json(
      { error: "You can't remove yourself — ask another admin to do it" },
      { status: 400 }
    );

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!me.isSuperAdmin && target.companyId !== me.companyId))
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!target.active)
    // Already removed — treat as a no-op so the UI converges to a stable
    // state if two admins click "Remove" at once.
    return NextResponse.json({ ok: true, alreadyInactive: true });

  if (target.role === UserRole.Admin) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        companyId: me.companyId,
        role: UserRole.Admin,
        active: true,
        id: { not: target.id },
      },
    });
    if (otherActiveAdmins === 0)
      return NextResponse.json(
        {
          error:
            "Can't remove the last admin — promote someone else to Admin first",
        },
        { status: 400 }
      );
  }

  const targetName =
    [target.firstName, target.lastName].filter(Boolean).join(" ") ||
    target.email ||
    "User";

  // Soft-delete: keep the row so foreign keys on Draw, Document, ActivityLogEntry,
  // ProjectAssignment, etc. still resolve and historical attribution stays
  // intact. Clearing email frees it up for re-invite later (User.email is
  // globally unique). Project assignments are removed so the deactivated
  // teammate stops appearing in active-project views.
  await prisma.$transaction(async (tx) => {
    await tx.projectAssignment.deleteMany({ where: { userId: target.id } });
    await tx.user.update({
      where: { id: target.id },
      data: {
        active: false,
        deactivatedAt: new Date(),
        email: null,
      },
    });
    await tx.activityLogEntry.create({
      data: {
        companyId: me.companyId,
        actorId: me.id,
        action: "user_removed",
        entity: "User",
        entityId: target.id,
        message: `Removed ${targetName} from the team`,
        meta: {
          email: target.email,
          role: target.role,
          previousRole: target.role,
        },
      },
    });
  });

  // Best-effort: shrink the Stripe seat quantity so the company isn't billed
  // for the now-empty seat. Failures here don't roll back the removal.
  void syncSeatQuantity(me.companyId).catch((err) =>
    console.error("[admin/users] syncSeatQuantity after delete failed", err)
  );

  return NextResponse.json({ ok: true });
}

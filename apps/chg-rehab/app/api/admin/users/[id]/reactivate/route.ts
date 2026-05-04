import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { loadOrCreateSubscription, syncSeatQuantity } from "@/lib/stripe";
import { billingBlockedResponse } from "@/lib/billing-gate";

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

class SeatLimitError extends Error {
  constructor(public seatsInUse: number) {
    super("seat_limit_reached");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const blocked = await billingBlockedResponse(me.companyId);
  if (blocked) return blocked;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.companyId !== me.companyId)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.active)
    // Already active — converge to a stable state if two admins click at once.
    return NextResponse.json({ ok: true, alreadyActive: true });

  const body = (await req.json().catch(() => ({}))) as { role?: string };
  // Allow the admin to pick a different role on the way back in. When no role
  // is supplied we restore whatever role they had before being removed
  // (User.role is preserved on soft-delete).
  const requestedRole =
    body.role !== undefined ? parseRole(body.role) : (target.role as UserRole);
  if (!requestedRole)
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Make sure the company has a Subscription row to read the seat cap from.
  const subscription = await loadOrCreateSubscription(me.companyId);

  // Atomic seat-limit + reactivate. Mirrors the invite-create flow: a
  // per-company advisory lock prevents two parallel reactivate (or
  // reactivate+invite) requests from each squeezing past the cap.
  let updated;
  let raceWonByAnother = false;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.companyId}, 0))`;

      // Re-read inside the lock so a concurrent remove/reactivate can't
      // confuse us.
      const fresh = await tx.user.findUnique({ where: { id } });
      if (!fresh || fresh.companyId !== me.companyId) {
        throw new Error("user_not_found");
      }
      if (fresh.active) {
        // Another admin reactivated them while we were waiting on the lock.
        // Skip the seat check + write + log; we'll return a no-op response.
        raceWonByAnother = true;
        return fresh;
      }

      const [activeUsers, pendingInvites] = await Promise.all([
        tx.user.count({ where: { companyId: me.companyId, active: true } }),
        tx.invite.count({
          where: { companyId: me.companyId, status: "Pending" },
        }),
      ]);
      if (activeUsers + pendingInvites + 1 > subscription.seatLimit) {
        throw new SeatLimitError(activeUsers + pendingInvites);
      }

      return tx.user.update({
        where: { id },
        data: {
          active: true,
          deactivatedAt: null,
          role: requestedRole,
        },
      });
    });
  } catch (err) {
    if (err instanceof SeatLimitError) {
      return NextResponse.json(
        {
          error: `Seat limit reached (${subscription.seatLimit} on the ${subscription.plan} plan). Upgrade your plan to bring this teammate back.`,
          code: "seat_limit_reached",
          seatLimit: subscription.seatLimit,
          seatsInUse: err.seatsInUse,
          plan: subscription.plan,
        },
        { status: 402 }
      );
    }
    if (err instanceof Error && err.message === "user_not_found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    throw err;
  }

  if (raceWonByAnother) {
    return NextResponse.json({
      ok: true,
      alreadyActive: true,
      user: {
        id: updated.id,
        email: updated.email,
        name:
          [updated.firstName, updated.lastName].filter(Boolean).join(" ") ||
          updated.email ||
          "User",
        role: updated.role,
      },
    });
  }

  const targetName =
    [updated.firstName, updated.lastName].filter(Boolean).join(" ") ||
    updated.email ||
    "User";

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "user_reactivated",
      entity: "User",
      entityId: updated.id,
      message: `Reactivated ${targetName}`,
      meta: {
        role: updated.role,
        previousRole: target.role,
        roleChanged: target.role !== updated.role,
      },
    },
  });

  // Push the new seat count to Stripe so the customer is invoiced for the
  // restored seat. Best-effort; the webhook + manual plan change will
  // reconcile if this fails.
  void syncSeatQuantity(me.companyId).catch((err) =>
    console.error(
      "[admin/users/reactivate] syncSeatQuantity after reactivate failed",
      err
    )
  );

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: targetName,
      role: updated.role,
    },
  });
}

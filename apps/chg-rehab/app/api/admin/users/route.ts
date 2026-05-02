import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, publicOrigin } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import {
  countSeatsInUse,
  loadOrCreateSubscription,
  syncSeatQuantity,
} from "@/lib/stripe";
import { billingBlockedResponse } from "@/lib/billing-gate";

const INVITABLE_ROLES: UserRole[] = [
  UserRole.Admin,
  UserRole.ProjectManager,
  UserRole.GeneralContractor,
  UserRole.Subcontractor,
  UserRole.Inspector,
];

const INVITE_TTL_DAYS = 14;

export const dynamic = "force-dynamic";

function parseRole(input: unknown): UserRole | null {
  if (typeof input !== "string") return null;
  const match = INVITABLE_ROLES.find((r) => r === input);
  return match ?? null;
}

class SeatLimitError extends Error {
  constructor(public seatsInUse: number) {
    super("seat_limit_reached");
  }
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(me.companyId);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
  };
  const email = (body.email || "").trim().toLowerCase();
  const role = parseRole(body.role);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  if (!role)
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Make sure there's a Subscription row to read the seat cap from.
  const subscription = await loadOrCreateSubscription(me.companyId);

  // Quick pre-check before opening a transaction (cheap path for the
  // overwhelmingly common case of plenty of seats left).
  const preSeats = await countSeatsInUse(me.companyId);
  if (preSeats + 1 > subscription.seatLimit) {
    return NextResponse.json(
      {
        error: `Seat limit reached (${subscription.seatLimit} on the ${subscription.plan} plan). Upgrade your plan to add more teammates.`,
        code: "seat_limit_reached",
        seatLimit: subscription.seatLimit,
        seatsInUse: preSeats,
        plan: subscription.plan,
      },
      { status: 402 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    if (existingUser.companyId === me.companyId)
      return NextResponse.json(
        { error: "That user is already a teammate" },
        { status: 409 }
      );
    return NextResponse.json(
      { error: "That email already belongs to another account" },
      { status: 409 }
    );
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Atomic seat-limit + invite create. We hold a per-company Postgres
  // advisory lock for the duration of the transaction so that two parallel
  // invite requests can't each pass the seat-count check and then each
  // create a row, busting the cap.
  let invite;
  try {
    invite = await prisma.$transaction(async (tx) => {
      // bigint advisory lock keyed off the companyId hash.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.companyId}, 0))`;

      const [users, invites] = await Promise.all([
        tx.user.count({ where: { companyId: me.companyId, active: true } }),
        tx.invite.count({ where: { companyId: me.companyId, status: "Pending" } }),
      ]);
      if (users + invites + 1 > subscription.seatLimit) {
        throw new SeatLimitError(users + invites);
      }
      // Revoke any prior pending invite for this email (same company).
      await tx.invite.updateMany({
        where: { companyId: me.companyId, email, status: "Pending" },
        data: { status: "Revoked" },
      });
      return tx.invite.create({
        data: {
          companyId: me.companyId,
          email,
          role,
          token,
          invitedById: me.id,
          expiresAt,
        },
      });
    });
  } catch (err) {
    if (err instanceof SeatLimitError) {
      return NextResponse.json(
        {
          error: `Seat limit reached (${subscription.seatLimit} on the ${subscription.plan} plan). Upgrade your plan to add more teammates.`,
          code: "seat_limit_reached",
          seatLimit: subscription.seatLimit,
          seatsInUse: err.seatsInUse,
          plan: subscription.plan,
        },
        { status: 402 }
      );
    }
    throw err;
  }

  // Push the new seat count to Stripe so the customer is invoiced for it.
  // Best-effort: if Stripe is misconfigured or the call fails we still keep
  // the local invite (the webhook + manual plan-change flow will reconcile).
  void syncSeatQuantity(me.companyId).catch((err) =>
    console.error("[admin/users] syncSeatQuantity failed", err)
  );

  const joinUrl = `${publicOrigin(req)}/api/invites/accept?token=${encodeURIComponent(
    token
  )}`;

  const inviterName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || "An admin";
  const company = await prisma.company.findUnique({
    where: { id: me.companyId },
    select: { name: true },
  });

  const send = await sendInviteEmail({
    to: email,
    inviterName,
    companyName: company?.name ?? "your company",
    role,
    joinUrl,
    expiresAt,
  }).catch((err) => {
    console.error("[admin/users] sendInviteEmail threw", err);
    return { delivered: false, reason: "transport_error" } as const;
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "user_invited",
      entity: "Invite",
      entityId: invite.id,
      message: `Invited ${email} as ${role}`,
      meta: {
        email,
        role,
        emailDelivered: send.delivered,
        emailDeliveryReason: send.reason ?? null,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    },
    joinUrl,
    emailDelivered: send.delivered,
  });
}

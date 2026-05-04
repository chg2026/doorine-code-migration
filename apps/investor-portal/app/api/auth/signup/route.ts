import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Consume an InvestorInvite token: create (or upgrade) the Supabase auth
 * user, set the user_profiles.is_investor flag, attach the auth uid to the
 * Prisma Investor row, and immediately sign the new user in. The token
 * itself enforces the invite-only policy — no token, no account.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }
  const { token, password } = parsed.data;

  const invite = await prisma.investorInvite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.consumedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  const adminUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!adminUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Auth service unavailable" },
      { status: 503 }
    );
  }
  const admin = getSupabaseAdminClient();

  // Find or create the Supabase auth user. listUsers paginates so we walk
  // up to a few pages before falling back to createUser.
  let authUserId: string | null = null;
  for (let page = 1; page <= 5 && !authUserId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) break;
    const found = data.users.find(
      (u) => (u.email || "").toLowerCase() === invite.email.toLowerCase()
    );
    if (found) authUserId = found.id;
    if (data.users.length < 200) break;
  }

  if (authUserId) {
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name:
          [invite.firstName, invite.lastName].filter(Boolean).join(" ") ||
          undefined,
      },
    });
    if (updErr) {
      return NextResponse.json(
        { error: `Failed to set password: ${updErr.message}` },
        { status: 500 }
      );
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name:
          [invite.firstName, invite.lastName].filter(Boolean).join(" ") ||
          undefined,
      },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message || "Failed to create account" },
        { status: 500 }
      );
    }
    authUserId = data.user.id;
  }

  // Mark this profile as an investor.
  const { error: upsertErr } = await admin.from("user_profiles").upsert(
    {
      id: authUserId,
      email: invite.email,
      full_name:
        [invite.firstName, invite.lastName].filter(Boolean).join(" ") ||
        invite.email,
      is_investor: true,
      status: "active",
    },
    { onConflict: "id" }
  );
  if (upsertErr) {
    return NextResponse.json(
      { error: `Profile upsert failed: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  // Attach the Supabase uid to the Investor row, replacing any synthetic
  // lead id we minted at "Add investor" time.
  const existingByEmail = await prisma.investor.findUnique({
    where: { email: invite.email },
  });
  if (existingByEmail && existingByEmail.id !== authUserId) {
    await prisma.$transaction(async (tx) => {
      // Re-point all relations from old id to authUserId, then delete the
      // old placeholder row.
      await tx.investorSubscription.updateMany({
        where: { investorId: existingByEmail.id },
        data: { investorId: authUserId! },
      });
      await tx.investorActivity.updateMany({
        where: { investorId: existingByEmail.id },
        data: { investorId: authUserId! },
      });
      await tx.investorCommunication.updateMany({
        where: { investorId: existingByEmail.id },
        data: { investorId: authUserId! },
      });
      await tx.investorNote.updateMany({
        where: { investorId: existingByEmail.id },
        data: { investorId: authUserId! },
      });
      // The InvestorDocument.investorId is optional but still scoped — repoint.
      await tx.investorDocument.updateMany({
        where: { investorId: existingByEmail.id },
        data: { investorId: authUserId! },
      });
      await tx.investor.upsert({
        where: { id: authUserId! },
        create: {
          id: authUserId!,
          companyId: existingByEmail.companyId,
          email: invite.email,
          firstName: existingByEmail.firstName,
          lastName: existingByEmail.lastName,
          phone: existingByEmail.phone,
          accreditedStatus: existingByEmail.accreditedStatus,
          status: "Active",
          portalLastLoginAt: new Date(),
        },
        update: {
          status: "Active",
          portalLastLoginAt: new Date(),
        },
      });
      await tx.investor.delete({ where: { id: existingByEmail.id } });
    });
  } else {
    await prisma.investor.upsert({
      where: { id: authUserId },
      create: {
        id: authUserId,
        companyId: invite.companyId,
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        accreditedStatus: "Unverified",
        status: "Active",
        portalLastLoginAt: new Date(),
      },
      update: {
        status: "Active",
        portalLastLoginAt: new Date(),
      },
    });
  }

  await prisma.investorInvite.update({
    where: { id: invite.id },
    data: { consumedAt: new Date(), consumedById: authUserId },
  });

  // Sign them in by establishing the cookie session.
  const supabase = await getSupabaseServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) {
    // Account exists but auto-login failed; let the user log in manually.
    return NextResponse.json({
      ok: true,
      autoLogin: false,
      reason: signInErr.message,
    });
  }

  return NextResponse.json({ ok: true, autoLogin: true });
}

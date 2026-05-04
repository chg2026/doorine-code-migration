import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(8),
  password: z.string().min(8, "Password must be at least 8 characters"),
  contactName: z.string().min(2).optional(),
  companyName: z.string().min(2).optional(),
  trade: z.string().optional(),
  phone: z.string().optional(),
});

/**
 * Consume a CpOnboardingInvite token: create the Supabase auth user, mark
 * `user_profiles.is_contractor = true`, mint the CpAccount, attach an
 * OperatorEdge to the inviter (L1 company OR L2 contractor account), then
 * sign the user in.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const { token, password, contactName, companyName, trade, phone } = parsed.data;

  const invite = await prisma.cpOnboardingInvite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.consumedAt) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  if (invite.expiresAt.getTime() < Date.now()) return NextResponse.json({ error: "Invite has expired" }, { status: 410 });

  const admin = getSupabaseAdminClient();
  let authUserId: string | null = null;
  for (let page = 1; page <= 5 && !authUserId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const found = data.users.find((u) => (u.email || "").toLowerCase() === invite.email.toLowerCase());
    if (found) authUserId = found.id;
    if (data.users.length < 200) break;
  }

  if (authUserId) {
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: contactName || invite.contactName || undefined },
    });
    if (updErr) return NextResponse.json({ error: `Failed to set password: ${updErr.message}` }, { status: 500 });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: contactName || invite.contactName || undefined },
    });
    if (error || !data.user) return NextResponse.json({ error: error?.message || "Failed to create account" }, { status: 500 });
    authUserId = data.user.id;
  }

  const { error: upErr } = await admin.from("user_profiles").upsert(
    { id: authUserId, email: invite.email, full_name: contactName || invite.contactName || invite.email, is_contractor: true, status: "active" },
    { onConflict: "id" }
  );
  if (upErr) return NextResponse.json({ error: `Profile upsert failed: ${upErr.message}` }, { status: 500 });

  const finalContact = contactName || invite.contactName || invite.email;
  const finalCompany = companyName || invite.companyName || finalContact;
  const finalTrade = trade || invite.trade || null;

  await prisma.cpAccount.upsert({
    where: { id: authUserId },
    create: {
      id: authUserId,
      email: invite.email,
      contactName: finalContact,
      companyName: finalCompany,
      trade: finalTrade,
      phone: phone || null,
      lastLoginAt: new Date(),
    },
    update: {
      contactName: finalContact,
      companyName: finalCompany,
      trade: finalTrade ?? undefined,
      phone: phone || undefined,
      lastLoginAt: new Date(),
    },
  });

  // Wire the OperatorEdge so the inviter can see this contractor. The
  // composite unique key includes nullable columns, which Postgres treats as
  // distinct under standard NULL semantics — that makes `upsert` unreliable
  // here. We use the explicit findFirst + create pattern instead.
  await wireOperatorEdge(authUserId, invite.inviterCompanyId, invite.inviterAccountId);

  await prisma.cpOnboardingInvite.update({
    where: { id: invite.id },
    data: { consumedAt: new Date(), consumedById: authUserId },
  });

  const supabase = await getSupabaseServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email: invite.email, password });
  if (signInErr) return NextResponse.json({ ok: true, autoLogin: false, reason: signInErr.message });
  return NextResponse.json({ ok: true, autoLogin: true });
}

async function wireOperatorEdge(
  contractorId: string,
  inviterCompanyId: string | null,
  inviterAccountId: string | null,
): Promise<void> {
  if (inviterCompanyId) {
    const existing = await prisma.cpOperatorEdge.findFirst({
      where: { contractorId, layer1CompanyId: inviterCompanyId, inviterAccountId: null },
    });
    if (!existing) {
      await prisma.cpOperatorEdge.create({
        data: { contractorId, layer1CompanyId: inviterCompanyId, source: "invite" },
      });
    }
    return;
  }
  if (inviterAccountId) {
    const existing = await prisma.cpOperatorEdge.findFirst({
      where: { contractorId, inviterAccountId, layer1CompanyId: null },
    });
    if (!existing) {
      await prisma.cpOperatorEdge.create({
        data: { contractorId, inviterAccountId, source: "invite" },
      });
    }
  }
}

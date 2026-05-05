import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/contractors
 *
 * Admin-only endpoint to provision contractor portal credentials directly
 * from the admin panel, without requiring the invite/magic-link flow.
 *
 * Body: { email: string, fullName: string, password: string }
 *
 * Returns: { ok: true, userId: string, state: "created" | "upgraded" | "already_contractor" }
 *
 * State meanings:
 *  - "created"            — new Supabase auth user created; profile + cpAccount bootstrapped.
 *  - "upgraded"           — existing auth user found but was not yet a contractor;
 *                           password updated + is_contractor set + cpAccount upserted.
 *  - "already_contractor" — user already has is_contractor=true; no changes made.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { email?: unknown; fullName?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: "Full name must be at least 2 characters." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Step 1: find or create the Supabase auth user.
  let authUserId: string | null = null;
  let state: "created" | "upgraded" | "already_contractor" = "created";

  // Page through all auth users to find one with this email.
  for (let page = 1; !authUserId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) {
      authUserId = found.id;
      break;
    }
    if (data.users.length < 200) break;
  }

  if (authUserId) {
    // User exists — check if they're already a contractor.
    type ProfileRow = { id: string; is_contractor: boolean | null };
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, is_contractor")
      .eq("id", authUserId)
      .maybeSingle<ProfileRow>();

    if (profile?.is_contractor) {
      // Already a contractor — self-heal: ensure profile is active and cpAccount exists,
      // then return the already_contractor state (no password change, no visible mutation).
      state = "already_contractor";
      await admin.from("user_profiles").upsert(
        { id: authUserId, email, full_name: fullName, is_contractor: true, status: "active" },
        { onConflict: "id" }
      );
      await prisma.cpAccount.upsert({
        where: { id: authUserId },
        create: { id: authUserId, email, contactName: fullName, companyName: fullName, lastLoginAt: null },
        update: { email, contactName: fullName },
      }).catch((e: unknown) => {
        console.warn(
          `[admin/contractors] cpAccount self-heal upsert failed for ${authUserId}:`,
          e instanceof Error ? e.message : String(e)
        );
      });
      return NextResponse.json({ ok: true, userId: authUserId, state });
    }

    // Existing auth user who is not yet a contractor — upgrade them.
    state = "upgraded";
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (updErr) {
      return NextResponse.json(
        { error: `Failed to update auth user: ${updErr.message}` },
        { status: 500 }
      );
    }
  } else {
    // Create new Supabase auth user.
    state = "created";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message || "Failed to create auth user." },
        { status: 500 }
      );
    }
    authUserId = data.user.id;
  }

  // Step 2: upsert user_profiles with is_contractor=true and status='active'.
  const { error: profileErr } = await admin.from("user_profiles").upsert(
    {
      id: authUserId,
      email,
      full_name: fullName,
      is_contractor: true,
      status: "active",
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    return NextResponse.json(
      { error: `Profile upsert failed: ${profileErr.message}` },
      { status: 500 }
    );
  }

  // Step 3: upsert Prisma cpAccount.
  try {
    await prisma.cpAccount.upsert({
      where: { id: authUserId },
      create: {
        id: authUserId,
        email,
        contactName: fullName,
        companyName: fullName,
        lastLoginAt: null,
      },
      update: {
        email,
        contactName: fullName,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Account record failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: authUserId, state });
}

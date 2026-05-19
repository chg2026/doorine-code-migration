import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/superAdmin";
import SuperAdminClient from "./Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Super Admin · CHG Platform" };

export default async function SuperAdminPage() {
  // Bounce logged-out users to /login first so they get the standard
  // sign-in experience instead of a JSON 401.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/super-admin");

  // Re-check super-admin against Supabase (not just the cached session
  // flag) so a freshly-revoked super admin can't keep loading the shell.
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) redirect("/");

  return <SuperAdminClient currentUserId={user.id} />;
}

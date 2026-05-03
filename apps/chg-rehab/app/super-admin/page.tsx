import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SuperAdminClient from "./Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Super Admin · CHG Rehab" };

export default async function SuperAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/super-admin");
  if (!user.isSuperAdmin) redirect("/");

  return <SuperAdminClient currentUserId={user.id} />;
}

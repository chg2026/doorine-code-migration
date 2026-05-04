import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function OperatorLensLayout({ children }: { children: React.ReactNode }) {
  const c = await getCurrentContractor();
  if (!c) redirect("/login");
  const invitees = await getInvitees(c.id);
  if (invitees.length === 0) redirect("/dashboard");
  return <>{children}</>;
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import BillingClient from "./Client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "Your account";

  return (
    <BillingClient
      userName={userName}
      userEmail={user.email ?? null}
      role={user.role}
    />
  );
}

import { redirect } from "next/navigation";
import { getCurrentInvestor } from "@/lib/auth";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const investor = await getCurrentInvestor();
  if (investor) {
    const dest =
      sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
    redirect(dest);
  }

  return (
    <LoginClient
      next={sp.next || "/dashboard"}
      initialError={sp.error || ""}
    />
  );
}

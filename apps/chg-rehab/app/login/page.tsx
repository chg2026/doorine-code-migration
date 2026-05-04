import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (user) {
    const dest = sp.next && sp.next.startsWith("/") ? sp.next : "/";
    redirect(dest);
  }

  return <LoginClient next={sp.next || "/"} initialError={sp.error || ""} />;
}

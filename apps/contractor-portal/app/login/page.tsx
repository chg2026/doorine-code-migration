import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return <LoginClient next={sp.next || "/dashboard"} initialError={sp.error || ""} />;
}

import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return <SignupClient token={sp.token || ""} />;
}

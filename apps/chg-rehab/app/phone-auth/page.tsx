import PhoneAuthClient from "./PhoneAuthClient";

export const dynamic = "force-dynamic";

export default async function PhoneAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return <PhoneAuthClient next={sp.next || "/"} />;
}

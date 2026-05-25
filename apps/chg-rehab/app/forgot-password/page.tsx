import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ForgotPasswordClient from "./ForgotPasswordClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password · CHG Rehab" };

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return <ForgotPasswordClient />;
}

import { redirect } from "next/navigation";

export default function Home() {
  console.log("[auth:diag] root/page | action=redirect_pipeline");
  redirect("/pipeline");
}

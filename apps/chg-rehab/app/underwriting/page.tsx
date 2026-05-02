import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UnderwritingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      <iframe
        src="/underwriting-calc.html"
        style={{
          flex: 1,
          border: "none",
          width: "100%",
          height: "100%",
          display: "block",
        }}
        title="Underwriting Calculator"
      />
    </div>
  );
}

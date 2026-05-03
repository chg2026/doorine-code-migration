import { redirect } from "next/navigation";
import { getCurrentInvestor } from "@/lib/auth";
import PortalSidebar from "@/components/PortalSidebar";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const investor = await getCurrentInvestor();
  if (!investor) {
    redirect("/login");
  }

  const initials =
    [(investor.firstName || "")[0], (investor.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (investor.email || "I")[0].toUpperCase();
  const displayName =
    [investor.firstName, investor.lastName].filter(Boolean).join(" ") ||
    investor.email ||
    "Investor";

  return (
    <div className="portal">
      <PortalSidebar initials={initials} displayName={displayName} />
      <div className="main">{children}</div>
    </div>
  );
}

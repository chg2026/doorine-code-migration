import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";
import BillingStatusBanner from "@/components/BillingStatusBanner";
import BillingNoticeForTeammates from "@/components/BillingNoticeForTeammates";
import ProfileCompletionBanner from "@/components/ProfileCompletionBanner";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "CHG Rehab",
  description: "Property rehab operations platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    // Login screen owns the full viewport (no top bar).
    return (
      <html lang="en">
        <body style={{ display: "block", overflow: "auto" }}>{children}</body>
      </html>
    );
  }

  const isAdmin = user.role === "Admin";

  return (
    <html lang="en">
      <body>
        <div className="top-stack">
          <ProfileCompletionBanner score={user.profileScore} />
          <TopNav user={user} />
          {isAdmin ? <BillingStatusBanner /> : <BillingNoticeForTeammates />}
        </div>
        <div className="main-wrap">
          <section className="module active">{children}</section>
        </div>
      </body>
    </html>
  );
}

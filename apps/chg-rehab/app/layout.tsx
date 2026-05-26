import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import TopNav from "@/components/TopNav";
import AvatarDropdown from "@/components/AvatarDropdown";
import BillingStatusBanner from "@/components/BillingStatusBanner";
import BillingNoticeForTeammates from "@/components/BillingNoticeForTeammates";
import BillingNavIndicator from "@/components/BillingNavIndicator";
import BillingNavBadge from "@/components/BillingNavBadge";
import NotificationBell from "@/components/NotificationBell";
import AppSwitcher from "@/components/AppSwitcher";
import ProfileCompletionBanner from "@/components/ProfileCompletionBanner";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "CHG Platform",
  description: "Property rehab operations platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    // Login screen owns the full viewport (no top bar).
    return (
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
          <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body style={{ display: "block", overflow: "auto" }}>{children}</body>
      </html>
    );
  }

  const isAdmin = user.role === "Admin";

  const initials =
    [(user.firstName || "")[0], (user.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (user.email || "U")[0].toUpperCase();

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "User";

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app-shell">
          <TopNav user={user} />
          <div className="main-col">
            <div className="topbar">
              <div className="spacer" />
              {isAdmin ? <BillingNavIndicator /> : <BillingNavBadge />}
              <NotificationBell />
              <AppSwitcher
                currentProduct="chg"
                isInvestor={user.isInvestor ?? false}
                isContractor={user.isContractor ?? false}
                enabledProducts={user.isSuperAdmin ? ['chg', 'deallink', 'investor-portal', 'contractor-portal'] : (user.accountProducts ?? [])}
              />
              <AvatarDropdown initials={initials} fullName={fullName} />
            </div>
            <div className="top-stack">
              <ProfileCompletionBanner score={user.profileScore} />
              {isAdmin ? <BillingStatusBanner /> : <BillingNoticeForTeammates />}
            </div>
            <div className="main-wrap">
              <section className="module active">{children}</section>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

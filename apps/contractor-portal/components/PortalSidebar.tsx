"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

interface NavItem { href: string; label: string; dot: string; badge?: string }

const NAV_MY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", dot: "#D85A30" },
  { href: "/jobs", label: "My jobs & CRM", dot: "#378ADD" },
  { href: "/bids", label: "Bid board", dot: "#7F77DD" },
];
const NAV_QUOTES: NavItem[] = [
  { href: "/quotes/new", label: "Quote builder", dot: "#D85A30", badge: "FREE" },
  { href: "/quotes", label: "My quotes", dot: "#534AB7" },
];
const NAV_WORK: NavItem[] = [
  { href: "/photos", label: "Photo uploads", dot: "#1D9E75" },
  { href: "/invoices", label: "Invoices", dot: "#0F6E56" },
  { href: "/docs", label: "Documents", dot: "#BA7517" },
  { href: "/messages", label: "Messages", dot: "#185FA5" },
];

const NAV_OPERATOR: NavItem[] = [
  { href: "/operator/dashboard", label: "Operator dashboard", dot: "#D85A30" },
  { href: "/operator/quotes", label: "Quotes received", dot: "#534AB7" },
  { href: "/operator/contractors", label: "Contractors CRM", dot: "#378ADD" },
  { href: "/operator/jobs", label: "Job pipeline", dot: "#0F6E56" },
  { href: "/operator/bids", label: "Bid management", dot: "#7F77DD" },
  { href: "/operator/compliance", label: "Compliance", dot: "#BA7517" },
  { href: "/operator/invoices", label: "Invoices to pay", dot: "#185FA5" },
  { href: "/operator/onboarding", label: "Onboarding", dot: "#1D9E75" },
  { href: "/operator/messages", label: "Messages", dot: "#185FA5" },
  { href: "/operator/reporting", label: "Reporting", dot: "#0F6E56" },
  { href: "/operator/settings", label: "Settings", dot: "#7F77DD" },
];

export default function PortalSidebar({
  initials,
  displayName,
  companyName,
  planTier,
  quotaUsed,
  quotaMax,
  showOperatorLens,
}: {
  initials: string;
  displayName: string;
  companyName: string;
  planTier: string;
  quotaUsed: number;
  quotaMax: number | null;
  showOperatorLens: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {}
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    router.push("/login");
  }

  const renderItem = (item: NavItem) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link key={item.href} href={item.href} className={`ni${active ? " on" : ""}`}>
        <span className="ni-dot" style={{ background: item.dot }} />
        {item.label}
        {item.badge ? (
          <span className="ni-badge" style={{ background: "var(--coral-l)", color: "var(--coral-d)" }}>{item.badge}</span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="sidebar">
      <div className="sb-top">
        <div className="sb-logo"><div className="sb-logo-inner" /></div>
        <div>
          <div className="sb-brand">CHG Portal</div>
          <div className="sb-sub">{companyName}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="nav-sec">My portal</div>
        {NAV_MY.map(renderItem)}
        <div className="nav-sec">Quotes</div>
        {NAV_QUOTES.map(renderItem)}
        <div className="nav-sec">Work</div>
        {NAV_WORK.map(renderItem)}
        {showOperatorLens ? (
          <>
            <div className="nav-sec">Operator lens</div>
            {NAV_OPERATOR.map(renderItem)}
          </>
        ) : null}
      </div>
      <div className="sb-foot">
        {planTier === "free" && quotaMax ? (
          <div className="sb-quota">
            <span className="sb-quota-label">External quotes</span>
            <span style={{ fontWeight: 600 }}>{quotaUsed} / {quotaMax}</span>
          </div>
        ) : null}
        <div className="sb-plan">
          <div className="sb-plan-name">{planTier === "free" ? "Free plan" : "Pro plan"}</div>
          <div className="sb-plan-sub">{planTier === "free" ? "Upgrade for unlimited quotes" : "All features unlocked"}</div>
        </div>
        <div className="sb-user">
          <div className="av av-s a-coral">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayName}
            </div>
            <button type="button" className="signout-link" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

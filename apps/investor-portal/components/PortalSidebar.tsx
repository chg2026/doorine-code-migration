"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const NAV: { href: string; label: string; dot: string }[] = [
  { href: "/dashboard", label: "Dashboard", dot: "#1D9E75" },
  { href: "/marketplace", label: "Marketplace", dot: "#7F77DD" },
  { href: "/investments", label: "My investments", dot: "#378ADD" },
  { href: "/distributions", label: "Distributions", dot: "#1D9E75" },
  { href: "/documents", label: "Documents", dot: "#7F77DD" },
  { href: "/documents/tax", label: "K-1 Tax Center", dot: "#BA7517" },
  { href: "/updates", label: "Reports & updates", dot: "#BA7517" },
  { href: "/activity", label: "Activity feed", dot: "#D85A30" },
  { href: "/analytics", label: "Analytics", dot: "#639922" },
];

export default function PortalSidebar({
  initials,
  displayName,
}: {
  initials: string;
  displayName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // ignore — server cookies still get cleared on redirect.
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    router.push("/login");
  }

  return (
    <div className="sb">
      <div className="sb-top">
        <div className="sb-mark" />
        <span className="sb-brand">Vestry Capital</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="nav-sec">Investor</div>
        {NAV.map((item) => {
          const active =
            pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
          return (
            <Link key={item.href} href={item.href} className={`ni${active ? " on" : ""}`}>
              <span className="ni-dot" style={{ background: item.dot }} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="sb-foot">
        <div className="av av-sm g-blue">{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </div>
          <button type="button" className="signout-link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

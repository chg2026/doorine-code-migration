"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import NotificationBell from "./NotificationBell";
import BillingNavIndicator from "./BillingNavIndicator";
import BillingNavBadge from "./BillingNavBadge";

const MODULES: { href: string; label: string }[] = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/underwriting", label: "Underwriting" },
  { href: "/rehab", label: "Rehab Manager" },
  { href: "/warehouse", label: "Warehouse" },
  { href: "/property", label: "Property Record" },
  { href: "/contacts", label: "Contacts" },
  { href: "/docs", label: "Documents Hub" },
  { href: "/admin", label: "Admin Settings" },
];

export default function TopNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const initials =
    [(user.firstName || "")[0], (user.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (user.email || "U")[0].toUpperCase();

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";

  return (
    <header className="topbar">
      <div className="brand">
        CHG <span>Rehab</span>
      </div>
      <nav className="module-nav">
        {MODULES.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + "/");
          return (
            <Link
              key={m.href}
              href={m.href}
              className={active ? "mnav-btn active" : "mnav-btn"}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>
      <div className="topbar-right">
        {user.role === "Admin" ? <BillingNavIndicator /> : <BillingNavBadge />}
        <NotificationBell />
        <Link
          href="/account"
          className="user-pill"
          title={user.email ? `${user.email} — Account settings` : "Account settings"}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="user-av">{initials}</div>
          <div>
            <div className="user-name">{fullName}</div>
            <div className="user-role">{user.role}</div>
          </div>
        </Link>
        <a
          href="/api/logout"
          className="mnav-btn"
          style={{ padding: "0 10px", height: 32, lineHeight: "32px", borderRadius: 4 }}
          title="Sign out"
        >
          Sign out
        </a>
      </div>
    </header>
  );
}

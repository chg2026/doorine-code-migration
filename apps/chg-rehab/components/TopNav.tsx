"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import WorkspaceNewPill from "@/components/WorkspaceNewPill";

type NavItem = { href: string; label: string };
type NavSection = { label?: string; items: NavItem[] };

const DASHBOARD: NavItem = { href: "/pipeline", label: "Dashboard" };

const BASE_SECTIONS: NavSection[] = [
  { items: [DASHBOARD] },
  {
    label: "Deals",
    items: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/underwriting", label: "Underwriting" },
      { href: "/property", label: "Property Record" },
      { href: "/docs", label: "Documents Hub" },
    ],
  },
  {
    label: "Rehab",
    items: [
      { href: "/rehab", label: "Rehab Manager" },
      { href: "/warehouse", label: "Warehouse" },
      { href: "/contractor-portal", label: "Contractor Portal" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/contacts", label: "Contacts" },
      { href: "/investor-portal", label: "Investor Portal" },
      { href: "/settings/team", label: "Team" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/command-center", label: "Command center" },
      { href: "/messages", label: "Messages" },
    ],
  },
];

const DashboardIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export default function TopNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  // Admin section is built per-render so the Super Admin tab can be
  // appended only for users with the platform-wide flag.
  const adminItems: NavItem[] = [
    { href: "/billing", label: "Billing" },
    { href: "/admin", label: "Admin Settings" },
  ];
  if (user.isSuperAdmin) {
    adminItems.push({ href: "/super-admin", label: "Super Admin" });
  }
  const sections: NavSection[] = [
    ...BASE_SECTIONS,
    { label: "Admin", items: adminItems },
    { label: "Account", items: [{ href: "/account", label: "Profile Settings" }] },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">CHG</span>
          <span className="brand-sub">Rehab</span>
        </Link>

        {sections.map((section, idx) => (
          <div className="nav-section" key={section.label ?? `section-${idx}`}>
            {section.label ? (
              <div className="nav-label">
                {section.label}
                {section.label === "Workspace" ? <WorkspaceNewPill /> : null}
              </div>
            ) : null}
            {section.items.map((item) => {
              const active = isActive(item.href);
              const isDashboard = item.href === DASHBOARD.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item active" : "nav-item"}
                >
                  {isDashboard ? <DashboardIcon /> : null}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>
    </>
  );
}

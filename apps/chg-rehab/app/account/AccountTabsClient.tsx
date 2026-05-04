"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type AccountTab = "profile" | "notifications";

export default function AccountTabsClient({
  active,
  userName,
  userEmail,
  role,
  children,
}: {
  active: AccountTab;
  userName: string;
  userEmail: string | null;
  role: string;
  children: ReactNode;
}) {
  const tabBtn = (key: AccountTab, label: string) => {
    const isActive = active === key;
    return (
      <Link
        key={key}
        href={`/account?tab=${key}`}
        style={{
          padding: "6px 14px",
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 6,
          textDecoration: "none",
          color: isActive ? "#fff" : "var(--text-primary, #111)",
          background: isActive ? "#111827" : "transparent",
          border: isActive ? "1px solid #111827" : "1px solid var(--border-mid, #e5e7eb)",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Account</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
        {userName}
        {userEmail ? ` · ${userEmail}` : ""} · {role}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {tabBtn("profile", "Profile")}
        {tabBtn("notifications", "Notifications")}
      </div>
      {children}
    </div>
  );
}

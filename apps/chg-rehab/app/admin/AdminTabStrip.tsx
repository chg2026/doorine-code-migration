"use client";

import Link from "next/link";

const TABS: { value: string; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "investors", label: "Investors" },
  { value: "deals", label: "Deals" },
  { value: "fundraising", label: "Fundraising" },
  { value: "finance", label: "Finance" },
];

export default function AdminTabStrip({
  current,
}: {
  current: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "0.5px solid var(--border-lo)",
        background: "#fff",
        padding: "0 16px",
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => {
        const active = (t.value === "account" && (!current || current === "account")) ||
          current === t.value;
        return (
          <Link
            key={t.value}
            href={t.value === "account" ? "/admin" : `/admin?tab=${t.value}`}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: active ? 500 : 400,
              borderBottom: active
                ? "2px solid var(--marine, #1F4D5C)"
                : "2px solid transparent",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Scope switcher for multi-role accounts (L2 contractors with L3 invitees,
 * or sole accounts that have both an inviter and invitees). Renders a pair
 * of pills in the topbar; clicking one navigates to the canonical landing
 * page for that scope. The active pill is derived from the current
 * pathname (`/operator/*` => "Operator" else "My portal").
 */
export default function ScopeSwitcher({
  showOperator,
  myCount,
  operatorCount,
}: {
  showOperator: boolean;
  myCount: { jobs: number; quotes: number };
  operatorCount: { jobs: number; quotes: number };
}) {
  const pathname = usePathname();
  const onOperator = pathname.startsWith("/operator");
  if (!showOperator) return null;

  const Pill = ({
    href, label, active, count,
  }: { href: string; label: string; active: boolean; count: string }) => (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        textDecoration: "none",
        background: active ? "var(--coral)" : "transparent",
        color: active ? "#fff" : "var(--t2)",
        border: active ? "1px solid var(--coral)" : "1px solid rgba(0,0,0,.12)",
        transition: "all .1s",
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: "1px 6px",
          borderRadius: 8,
          background: active ? "rgba(255,255,255,.22)" : "var(--bg2)",
          color: active ? "#fff" : "var(--t2)",
        }}
      >
        {count}
      </span>
    </Link>
  );

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 6,
        padding: 3,
        background: "var(--bg2)",
        borderRadius: 999,
      }}
      title="Switch between your own portal and the operator lens for the contractors you've invited."
    >
      <Pill
        href="/dashboard"
        label="My portal"
        active={!onOperator}
        count={`${myCount.jobs} jobs · ${myCount.quotes} quotes`}
      />
      <Pill
        href="/operator/dashboard"
        label="Operator lens"
        active={onOperator}
        count={`${operatorCount.jobs} jobs · ${operatorCount.quotes} quotes`}
      />
    </div>
  );
}

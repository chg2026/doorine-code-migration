"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "chg_profile_banner_dismissed";

function nextAction(score: number): { label: string; href: string | null } | null {
  if (score < 40) return { label: "Add your name to personalize your account →", href: "/account?tab=profile" };
  if (score < 65) return { label: "Add your email to unlock reports →", href: "/account?tab=profile" };
  if (score < 85) return { label: "Add your company name →", href: "/account?tab=profile" };
  if (score < 100) return { label: "Add a profile photo →", href: "/account?tab=profile" };
  return null;
}

export default function ProfileCompletionBanner({ score }: { score: number | null | undefined }) {
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (typeof window !== "undefined") {
      setDismissed(window.sessionStorage.getItem(DISMISSED_KEY) === "1");
    }
  }, []);

  if (!hydrated) return null;
  if (score == null || score >= 100) return null;
  if (dismissed) return null;
  const action = nextAction(score);
  if (!action) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // sessionStorage unavailable (private mode / SSR mismatch) — fine.
    }
    setDismissed(true);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        margin: "0 16px 8px",
        padding: "8px 14px",
        borderRadius: 8,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          style={{
            flexShrink: 0,
            width: 96,
            height: 6,
            background: "#fde68a",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${score}%`,
              background: "#f59e0b",
              borderRadius: 999,
              transition: "width 200ms",
            }}
          />
        </div>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Profile {score}% complete —{" "}
          {action.href ? (
            <Link
              href={action.href}
              style={{ fontWeight: 500, color: "#78350f", textDecoration: "underline" }}
            >
              {action.label}
            </Link>
          ) : (
            <span style={{ fontWeight: 500 }}>{action.label}</span>
          )}
        </span>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          background: "transparent",
          border: 0,
          color: "#b45309",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

export type PortalBanner = {
  key: string;
  kind: "captable" | "k1" | "subscription" | "funding";
  title: string;
  body: string;
  cta: { label: string; href: string };
};

export default function PortalBanners({ banners: initial }: { banners: PortalBanner[] }) {
  const [banners, setBanners] = useState(initial);
  if (!banners.length) return null;

  async function dismiss(key: string) {
    setBanners((b) => b.filter((x) => x.key !== key));
    await fetch("/api/banner/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }).catch(() => undefined);
  }

  return (
    <div style={{ display: "grid", gap: 8, padding: "10px 16px 0" }}>
      {banners.map((b) => {
        const palette =
          b.kind === "captable"
            ? { bg: "var(--amber-light)", fg: "var(--amber)" }
            : b.kind === "k1"
            ? { bg: "var(--blue-light)", fg: "var(--blue)" }
            : b.kind === "funding"
            ? { bg: "var(--amber-light)", fg: "var(--amber)" }
            : { bg: "var(--teal-light)", fg: "var(--teal-dark)" };
        return (
          <div
            key={b.key}
            style={{
              background: palette.bg,
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: `0.5px solid ${palette.fg}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: palette.fg }}>
                {b.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-primary)", marginTop: 2 }}>
                {b.body}
              </div>
            </div>
            <Link href={b.cta.href} className="btn btn-sm btn-p">
              {b.cta.label}
            </Link>
            <button
              type="button"
              onClick={() => dismiss(b.key)}
              aria-label="Dismiss"
              style={{
                background: "none",
                border: 0,
                color: palette.fg,
                fontSize: 16,
                cursor: "pointer",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

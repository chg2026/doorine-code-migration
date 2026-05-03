"use client";

import { useState, useRef, useEffect } from "react";

type Product = {
  code: string;
  name: string;
  tagline: string;
  color: string;
  initial: string;
  // External Replit port for cross-port dev URLs (`https://<host>:<port>`).
  // Use this for products whose .replit `externalPort` is the same as their
  // `localPort` (e.g. CHG Rehab — 3000:3000).
  devPort?: number;
  // For products served at the Replit bare host (externalPort 80/443 — e.g.
  // the CHG CRM at localPort 5000 → externalPort 80). Cross-port URLs do
  // NOT work for these; the dev edge proxy serves them on the root domain.
  devBareHost?: boolean;
  brandDomain?: string;
};

// Phase 5 cutover: the "CHG Platform" tile (code: 'chg') points at the
// chg-rehab Next.js app, which is now the sole home for CHG operations.
// The legacy CRM (apps/crm) has been retired and archived.
const PRODUCTS: Product[] = [
  {
    code: "chg",
    name: "CHG Platform",
    tagline: "Operations platform",
    color: "#0C447C",
    initial: "C",
    devPort: 3000,
  },
  {
    code: "deallink",
    name: "Deal Link",
    tagline: "Wholesaler deal links",
    color: "#16A34A",
    initial: "D",
  },
];

function devUrlFor(product: Product): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!/\.replit\.dev$/.test(host)) return null;
  // CHG Rehab is currently the host on this domain — strip the dev suffix
  // so we resolve to the same Replit project, just at a different port.
  // window.location.hostname here is the chg-rehab dev domain.
  if (product.devBareHost) {
    return `https://${host}`;
  }
  if (product.devPort) {
    return `https://${host}:${product.devPort}`;
  }
  return null;
}

export default function AppSwitcher({
  currentProduct = "chg",
}: {
  currentProduct?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="App switcher"
        aria-expanded={open}
        title="Switch apps"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.65)",
          cursor: "pointer",
          padding: 6,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)";
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="1.75" />
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="19" cy="5" r="1.75" />
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
          <circle cx="5" cy="19" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
          <circle cx="19" cy="19" r="1.75" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 288,
            background: "#fff",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            padding: "8px 0",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 11,
              fontWeight: 600,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Gold Bridge apps
          </div>

          <div style={{ padding: "4px 0" }}>
            {PRODUCTS.map((product) => {
              const isCurrent = product.code === currentProduct;
              const devUrl = devUrlFor(product);
              const href = product.brandDomain
                ? `https://${product.brandDomain}`
                : devUrl || undefined;
              const clickable = !isCurrent && !!href;
              const showComingSoon = !isCurrent && !href;

              const Inner = (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: product.color,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {product.initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
                        {product.name}
                      </div>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                            color: "#0C447C",
                            background: "#E8F0FA",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          Current
                        </span>
                      )}
                      {showComingSoon && (
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                            color: "#6b7280",
                            background: "#f3f4f6",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {product.tagline}
                    </div>
                  </div>
                </div>
              );

              if (clickable) {
                return (
                  <a
                    key={product.code}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    style={{
                      display: "block",
                      margin: "0 4px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                    }}
                  >
                    {Inner}
                  </a>
                );
              }

              return (
                <div
                  key={product.code}
                  style={{
                    margin: "0 4px",
                    borderRadius: 8,
                    background: isCurrent ? "rgba(232,240,250,0.4)" : "transparent",
                    opacity: isCurrent ? 1 : 0.75,
                    cursor: "default",
                  }}
                >
                  {Inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

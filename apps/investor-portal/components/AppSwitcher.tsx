"use client";

import { useState, useRef, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type RoleFlag = "isInvestor" | "isContractor";

type Product = {
  code: string;
  name: string;
  tagline: string;
  color: string;
  initial: string;
  devPort?: number;
  devBareHost?: boolean;
  brandDomain?: string;
  // Production URL baked in at Next.js build time via NEXT_PUBLIC_<PRODUCT>_URL.
  // Takes precedence over the dev Replit port heuristic when set.
  productionUrl?: string;
  // When true: on click, the current Supabase session is forwarded as a URL
  // hash fragment so the target app can hydrate without a separate login.
  ssoEnabled?: boolean;
  // When set, this tile is only shown to users who have the matching boolean
  // flag on their session (isInvestor or isContractor).
  requiredFlag?: RoleFlag;
};

const PRODUCTS: Product[] = [
  {
    code: "chg",
    name: "CHG Platform",
    tagline: "Operations platform",
    color: "#0C447C",
    initial: "C",
    devBareHost: true,
    productionUrl: (process.env.NEXT_PUBLIC_CHG_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "deallink",
    name: "Deal Link",
    tagline: "Wholesaler deal links",
    color: "#16A34A",
    initial: "D",
    devPort: 3001,
    ssoEnabled: true,
    productionUrl: (process.env.NEXT_PUBLIC_DEALLINK_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "investor",
    name: "Investor Portal",
    tagline: "Dashboard & returns",
    color: "#7C3AED",
    initial: "I",
    devPort: 3002,
    ssoEnabled: true,
    requiredFlag: "isInvestor",
    productionUrl: (process.env.NEXT_PUBLIC_INVESTOR_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "contractor",
    name: "Contractor Portal",
    tagline: "Job tracking & invoices",
    color: "#D97706",
    initial: "C",
    devPort: 3003,
    ssoEnabled: true,
    requiredFlag: "isContractor",
    productionUrl: (process.env.NEXT_PUBLIC_CONTRACTOR_URL || "").replace(/\/$/, "") || undefined,
  },
];

/**
 * Resolves the navigation URL for a product:
 * 1. If productionUrl is set (baked in at build time from NEXT_PUBLIC_*), use it.
 * 2. Otherwise fall back to the Replit dev-preview URL heuristic.
 */
function resolveUrl(product: Product): string | null {
  if (product.productionUrl) return product.productionUrl;
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!/\.replit\.dev$/.test(host)) return null;
  if (product.devBareHost) return `https://${host}`;
  if (product.devPort) return `https://${host}:${product.devPort}`;
  return null;
}

/**
 * Builds the navigation URL for an SSO-enabled product. Opens a blank window
 * synchronously (within the user-gesture handler) so popup blockers don't
 * interfere, then sets the location to the target after fetching the session.
 */
async function openWithSso(baseHref: string): Promise<void> {
  // Open WITHOUT noopener/noreferrer so the browser returns a live window
  // reference. We need to set win.location.href after the async session fetch —
  // noopener makes window.open() return null, which causes a fallback that
  // navigates the current page instead of opening a new tab.
  const win = window.open("about:blank", "_blank");
  if (!win) {
    // Popup was blocked — last resort: navigate current tab.
    window.location.href = `${baseHref}/login`;
    return;
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token && session?.refresh_token) {
      const params = new URLSearchParams([
        ["access_token", session.access_token],
        ["refresh_token", session.refresh_token],
        ["token_type", "bearer"],
        ["expires_in", String(session.expires_in ?? 3600)],
      ]);
      win.location.href = `${baseHref}/login#${params.toString()}`;
    } else {
      win.location.href = `${baseHref}/login`;
    }
  } catch {
    win.location.href = `${baseHref}/login`;
  }
}

export default function AppSwitcher({
  currentProduct = "chg",
  isInvestor = false,
  isContractor = false,
}: {
  currentProduct?: string;
  isInvestor?: boolean;
  isContractor?: boolean;
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

  const roleFlags: Record<RoleFlag, boolean> = { isInvestor, isContractor };

  // Only show products that have no requiredFlag (visible to all) or whose
  // requiredFlag matches the current user's session flags.
  const visibleProducts = PRODUCTS.filter(
    (p) => !p.requiredFlag || roleFlags[p.requiredFlag],
  );

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
            CHG apps
          </div>

          <div style={{ padding: "4px 0" }}>
            {visibleProducts.map((product) => {
              const isCurrent = product.code === currentProduct;
              const resolvedHref = resolveUrl(product);
              const href = product.brandDomain
                ? `https://${product.brandDomain}`
                : resolvedHref || undefined;
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
                    onClick={(e) => {
                      setOpen(false);
                      if (product.ssoEnabled) {
                        e.preventDefault();
                        openWithSso(href!);
                      }
                    }}
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

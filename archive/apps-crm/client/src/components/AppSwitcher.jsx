import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Static presentation catalog for the Gold Bridge products. Keeps icon +
// color + tagline + URL fallback out of the DB since those are pure UI
// concerns. Business metadata (plan, status, brand_domain) comes from
// /auth/me entitlements when an account has a real entitlement granted.
//
// `devPort` lets the switcher work in the Replit dev environment by
// computing the cross-port URL (https://<port>-<host>) without needing a
// brand_domain to be set. Once a product gets a real domain, set it via
// the entitlement's brand_domain (super-admin → Entitlements panel).
//
// Adding a fourth product later: add a row here AND give the user an
// entitlement server-side. The switcher will light it up automatically.
// Phase 4 cutover: the "CHG Platform" tile (code: 'chg') now points at the
// chg-rehab Next.js app on port 3000. This legacy CRM SPA is still reachable
// via direct URL during the fallback window but is no longer a switcher
// destination — clicking the CHG Platform tile from here jumps to chg-rehab.
const PRODUCTS = [
  {
    code: 'chg',
    name: 'CHG Platform',
    tagline: 'Operations platform',
    color: 'bg-primary-500',
    initial: 'C',
    devPort: 3000,
  },
  {
    code: 'deallink',
    name: 'Deal Link',
    tagline: 'Wholesaler deal links',
    color: 'bg-success-500',
    initial: 'D',
    devPort: 3001,
  },
];

// In Replit dev, ports declared in .replit are reachable at the same
// hostname with the externalPort as a port suffix (e.g. https://<host>:3000).
// The "<port>-<host>" subdomain form is NOT served by the dev edge proxy.
//
// In production we want the entitlement's brand_domain (or, eventually,
// a deployed REACT_APP_CHG_REHAB_URL). This helper computes a safe URL
// for the dev environment and returns null otherwise.
function devCrossPortUrl(port) {
  if (typeof window === 'undefined' || !port) return null;
  const host = window.location.hostname;
  // Match the standard Replit dev domain shape: <id>.<region>.replit.dev
  if (/\.replit\.dev$/.test(host)) {
    return `https://${host}:${port}`;
  }
  return null;
}

/**
 * 9-dot app switcher. Lives in the top bar, shows a dropdown card of the
 * Gold Bridge product lineup.
 *
 * Props:
 *   currentProduct — the product code this client is running ('chg' here).
 *                    That tile gets the "Current" badge and isn't a link.
 */
export default function AppSwitcher({ currentProduct = 'chg' }) {
  const { entitlements, hasProductAccess } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Look up the active entitlement for a product code (or undefined).
  const entitlementFor = (code) =>
    (entitlements || []).find((e) => e.code === code && e.status === 'active');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
        aria-label="App switcher"
        aria-expanded={open}
      >
        {/* 9-dot grid icon, Atlassian-style */}
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
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
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gold Bridge apps</div>
          </div>

          <div className="py-1">
            {PRODUCTS.map((product) => {
              const entitlement = entitlementFor(product.code);
              const isCurrent = product.code === currentProduct;
              const hasAccess = isCurrent || hasProductAccess(product.code);
              const brandDomain = entitlement?.brand_domain;
              const devUrl = devCrossPortUrl(product.devPort);

              // Decide what this tile does:
              //   - current product           → no link, just "Current" badge
              //   - no active entitlement     → "Coming soon" (no link, even
              //                                  in dev — entitlements are the
              //                                  source of truth, not devPort)
              //   - has brand_domain          → link to that production domain
              //   - in Replit dev + devPort   → link via cross-port URL
              //   - entitled but no domain    → "Coming soon"
              const href = hasAccess
                ? (brandDomain ? `https://${brandDomain}` : devUrl || undefined)
                : undefined;
              const clickable = !isCurrent && !!href;
              const showComingSoon = !isCurrent && !href;

              const Inner = (
                <div className="flex items-start gap-3 px-4 py-3 rounded-lg">
                  <div className={`w-10 h-10 rounded-lg ${product.color} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                    {product.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {showComingSoon && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{product.tagline}</div>
                  </div>
                </div>
              );

              if (clickable) {
                return (
                  <a
                    key={product.code}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block mx-1 hover:bg-gray-50 transition-colors rounded-lg"
                    onClick={() => setOpen(false)}
                  >
                    {Inner}
                  </a>
                );
              }

              return (
                <div
                  key={product.code}
                  className={`mx-1 rounded-lg ${isCurrent ? 'bg-primary-50/40' : 'opacity-75 cursor-default'}`}
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

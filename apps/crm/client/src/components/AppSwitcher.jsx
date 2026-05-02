import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Static presentation catalog for the two Gold Bridge products. Keeps icon +
// color + tagline out of the DB since those are pure UI concerns. Business
// metadata (plan, status, brand_domain) comes from /auth/me entitlements.
//
// Adding a third product later: add a row here AND give the user an entitlement
// server-side. The switcher will light it up automatically.
const PRODUCTS = [
  {
    code: 'chg',
    name: 'CHG',
    tagline: 'Real Estate CRM',
    color: 'bg-primary-500',
    initial: 'C',
  },
  {
    code: 'deallink',
    name: 'Deal Link',
    tagline: 'Wholesaler deal links',
    color: 'bg-success-500',
    initial: 'D',
  },
];

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
              const entitled = hasProductAccess(product.code);
              const isCurrent = product.code === currentProduct;
              const brandDomain = entitlement?.brand_domain;

              // Decide what this tile does:
              //   - current product  → no link, just "Current" badge
              //   - entitled + has brand_domain  → link to that product
              //   - entitled, no brand_domain yet  → "Open" but no URL (dev/pre-launch)
              //   - not entitled  → "Coming soon" upsell placeholder (Phase 5 will wire
              //     this to a real signup CTA)
              const clickable = !isCurrent && entitled && !!brandDomain;
              const href = brandDomain ? `https://${brandDomain}` : undefined;

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
                      {!isCurrent && !entitled && (
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

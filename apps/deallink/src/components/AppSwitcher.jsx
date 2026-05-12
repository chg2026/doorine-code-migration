import React, { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Check } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

const PRODUCTS = [
  { code: 'chg', name: 'CHG Platform', tagline: 'Operations platform', color: '#0C447C', envKey: 'VITE_CHG_URL' },
  { code: 'deallink', name: 'Deal Link', tagline: 'Wholesaler deal links', color: '#16A34A', envKey: 'VITE_DEALLINK_URL' },
  { code: 'investor-portal', name: 'Investor Portal', tagline: 'Dashboard & returns', color: '#7C3AED', envKey: 'VITE_INVESTOR_URL', gated: true },
  { code: 'contractor-portal', name: 'Contractor Portal', tagline: 'Job tracking & invoices', color: '#D97706', envKey: 'VITE_CONTRACTOR_URL', gated: true },
];

export default function AppSwitcher({ currentProduct = 'deallink', enabledProducts = [], iconColor = '#374151' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = PRODUCTS
    .map((p) => ({ ...p, url: import.meta.env[p.envKey] }))
    .filter((p) => {
      if (p.code === currentProduct) return true;
      if (!p.gated) return true;
      return enabledProducts.includes(p.code);
    });

  async function handleClick(p) {
    if (p.code === currentProduct || !p.url) return;
    setOpen(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const at = session?.access_token;
      const rt = session?.refresh_token;
      if (at && rt) {
        window.location.href = `${p.url}/login#access_token=${encodeURIComponent(at)}&refresh_token=${encodeURIComponent(rt)}`;
        return;
      }
    } catch {
      // fall through
    }
    window.location.href = `${p.url}/login`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Switch app"
        aria-label="Switch app"
        aria-expanded={open}
        className="p-1.5 rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center"
      >
        <LayoutGrid className="w-5 h-5" style={{ color: iconColor }} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-2xl border border-slate-200 z-50 overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Switch app</p>
          </div>
          <div className="py-1.5">
            {visible.map((p) => {
              const isCurrent = p.code === currentProduct;
              const disabled = !p.url && !isCurrent;
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => handleClick(p)}
                  disabled={disabled}
                  role="menuitem"
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{p.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

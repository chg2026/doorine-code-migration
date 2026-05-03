import { useAuth } from '../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppSwitcher from './AppSwitcher';

export default function TopBar({ title }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </button>

        <AppSwitcher currentProduct="chg-legacy" />

        <div className="relative" ref={ref}>
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-semibold">
              {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-sm font-medium text-gray-900">{profile?.full_name || 'User'}</div>
                <div className="text-xs text-gray-500">{profile?.email}</div>
              </div>
              <button onClick={() => { navigate('/settings/profile'); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Profile & Settings
              </button>
              <div className="border-t border-gray-100">
                <button onClick={() => { signOut(); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-danger-500 hover:bg-danger-50 transition-colors">
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

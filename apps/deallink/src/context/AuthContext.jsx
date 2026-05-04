import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';

// Mirrors the AuthProvider used by apps/crm/client. Hydrates the Supabase
// session, calls /auth/me to fetch profile + product entitlements, and
// exposes hasProductAccess('deallink') for the admin/onboarding pages and
// the AccessDenied gate.

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Captured synchronously during the render phase — BEFORE any child effects
  // run (React runs child effects before parent effects, so we cannot safely
  // read window.location.hash inside useEffect: Login.jsx's effect strips the
  // hash first). useState initializer runs at first render, before any effects.
  const [ssoIncoming] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.includes('access_token='),
  );

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setProfile(data.profile || null);
      setEntitlements(data.entitlements || []);
      return data;
    } catch {
      setProfile(null);
      setEntitlements([]);
      return null;
    }
  }, []);

  useEffect(() => {
    // Safety valve: if auth doesn't resolve within 8 s, unblock the UI.
    const safety = setTimeout(() => setLoading(false), 8000);

    // Track whether the initial auth state has been resolved. Only after this
    // do we respond to subsequent events (SIGNED_IN, SIGNED_OUT, etc.).
    let initialResolved = false;

    function resolveInitial(sessionUser) {
      if (initialResolved) return;
      initialResolved = true;
      clearTimeout(safety);
      if (sessionUser) {
        fetchMe().finally(() => setLoading(false));
      } else {
        setProfile(null);
        setEntitlements([]);
        setLoading(false);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      setUser(s?.user || null);

      if (evt === 'INITIAL_SESSION') {
        if (s?.user) {
          resolveInitial(s.user);
        } else if (!ssoIncoming) {
          // No user and no hash tokens → definitively logged out.
          resolveInitial(null);
        }
        // ssoIncoming + no session: keep loading=true; SIGNED_IN arrives next.
        return;
      }

      if (!initialResolved) {
        // SIGNED_IN arrived before (or instead of) INITIAL_SESSION resolving —
        // this is the normal SSO hash path when INITIAL_SESSION had no session.
        if (s?.user) resolveInitial(s.user);
        else resolveInitial(null);
        return;
      }

      // ── Post-initial events ────────────────────────────────────────────
      if (s?.user) {
        // TOKEN_REFRESHED only rotates the access token — profile and
        // entitlements don't change, skip the /auth/me round-trip to avoid
        // the loading flash that would otherwise occur every ~hour.
        if (evt === 'TOKEN_REFRESHED') return;
        setLoading(true);
        fetchMe().finally(() => setLoading(false));
      } else {
        setProfile(null);
        setEntitlements([]);
        setLoading(false);
      }
    });

    return () => { clearTimeout(safety); subscription.unsubscribe(); };
  }, [fetchMe, ssoIncoming]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setEntitlements([]);
  };

  const isSuperAdmin = profile?.is_super_admin === true;

  const hasProductAccess = (code) => {
    if (isSuperAdmin) return true;
    return (entitlements || []).some((e) => e.code === code && e.status === 'active');
  };

  const value = {
    session,
    user,
    profile,
    entitlements,
    loading,
    isSuperAdmin,
    hasProductAccess,
    signIn,
    signOut,
    refresh: fetchMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

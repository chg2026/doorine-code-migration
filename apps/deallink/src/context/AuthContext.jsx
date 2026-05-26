import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  // Captured synchronously during the render phase — BEFORE any child effects
  // run (React runs child effects before parent effects, so we cannot safely
  // read window.location.hash inside useEffect: Login.jsx's effect strips the
  // hash first). useState initializer runs at first render, before any effects.
  const [ssoIncoming] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.includes('access_token='),
  );

  // Tracks which user ID was last fully resolved (profile + entitlements loaded).
  // Used to skip setLoading(true) when Supabase re-fires SIGNED_IN for the same
  // user (e.g. React StrictMode double-effect, detectSessionInUrl re-emission).
  const resolvedUserIdRef = useRef(undefined);

  // Tracks whether the initial auth state has been resolved. A ref (not a local
  // let) so it survives React StrictMode's unmount→remount cycle — without this
  // the local variable resets to false on every re-mount and resolveInitial fires
  // again, toggling loading=true→false repeatedly (the 3-second blank blink).
  const initialResolvedRef = useRef(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setProfile(data.profile || null);
      setEntitlements(data.entitlements || []);
      setBilling(data.billing || null);
      return data;
    } catch {
      setProfile(null);
      setEntitlements([]);
      setBilling(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // Safety valve: if auth doesn't resolve within 8 s, unblock the UI.
    const safety = setTimeout(() => setLoading(false), 8000);

    function resolveInitial(sessionUser) {
      if (initialResolvedRef.current) return;
      initialResolvedRef.current = true;
      clearTimeout(safety);
      if (sessionUser) {
        resolvedUserIdRef.current = sessionUser.id;
        fetchMe().finally(() => setLoading(false));
      } else {
        resolvedUserIdRef.current = null;
        setProfile(null);
        setEntitlements([]);
        setBilling(null);
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

      if (!initialResolvedRef.current) {
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
        // Same user re-firing SIGNED_IN (StrictMode double-effect, or
        // detectSessionInUrl re-emission) — refresh silently, no loading flash.
        if (s.user.id === resolvedUserIdRef.current) {
          fetchMe();
          return;
        }
        resolvedUserIdRef.current = s.user.id;
        setLoading(true);
        fetchMe().finally(() => setLoading(false));
      } else {
        setProfile(null);
        setEntitlements([]);
        setBilling(null);
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
    setBilling(null);
  };

  const isSuperAdmin = profile?.is_super_admin === true;

  const hasProductAccess = (code) => {
    if (isSuperAdmin) return true;
    return (entitlements || []).some((e) => e.code === code && e.status === 'active');
  };

  const enabledProducts = isSuperAdmin
    ? ['chg', 'deallink', 'investor-portal', 'contractor-portal']
    : (entitlements || [])
        .filter((e) => e && e.status === 'active' && e.code)
        .map((e) => e.code);

  const deallinkEnt = (entitlements || []).find((e) => e?.code === 'deallink' && e?.status === 'active') || null;
  const planFromEnt = deallinkEnt?.plan || deallinkEnt?.tier || deallinkEnt?.plan_code || null;
  const plan = billing?.plan || planFromEnt || 'free';
  const seatLimit = typeof billing?.seat_limit === 'number' ? billing.seat_limit : null;
  const guestLimit = typeof billing?.guest_limit === 'number' ? billing.guest_limit : null;
  const seatsUsed = typeof billing?.seats_used === 'number' ? billing.seats_used : null;
  const guestsUsed = typeof billing?.guests_used === 'number' ? billing.guests_used : null;
  const isFreePlan = plan === 'free';
  const isPaidPlan = plan === 'personal' || plan === 'team';

  const value = {
    session,
    user,
    profile,
    entitlements,
    enabledProducts,
    billing,
    plan,
    seatLimit,
    guestLimit,
    seatsUsed,
    guestsUsed,
    isFreePlan,
    isPaidPlan,
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

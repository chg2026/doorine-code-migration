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
    let settled = false;
    const safety = setTimeout(() => { if (!settled) setLoading(false); }, 8000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user || null);
      if (s?.user) {
        fetchMe().finally(() => { settled = true; clearTimeout(safety); setLoading(false); });
      } else {
        settled = true; clearTimeout(safety); setLoading(false);
      }
    }).catch(() => { settled = true; clearTimeout(safety); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user || null);
      if (s?.user) {
        setLoading(true);
        // Don't await — see CRM AuthContext for the deadlock note.
        fetchMe().finally(() => { setLoading(false); });
      } else {
        setProfile(null);
        setEntitlements([]);
        setLoading(false);
      }
    });
    return () => { clearTimeout(safety); subscription.unsubscribe(); };
  }, [fetchMe]);

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

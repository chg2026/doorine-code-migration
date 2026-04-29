import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data } = await api.get(`/auth/me`);
      setProfile(data.profile);
      setPermissions(data.permissions || {});
      setEntitlements(data.entitlements || []);
      return data;
    } catch {
      setProfile(null);
      setPermissions({});
      setEntitlements([]);
      return null;
    }
  }, []);

  useEffect(() => {
    let settled = false;
    const settle = () => { settled = true; };

    // Safety net: if getSession() or the subsequent /auth/me both hang
    // (e.g. Supabase token-refresh stalls), stop the spinner after 8 s
    // so ProtectedRoute can redirect to /login rather than spinning forever.
    const safetyTimer = setTimeout(() => {
      if (!settled) setLoading(false);
    }, 8000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => { settle(); clearTimeout(safetyTimer); setLoading(false); });
      } else {
        settle(); clearTimeout(safetyTimer); setLoading(false);
      }
    }).catch(() => { settle(); clearTimeout(safetyTimer); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) await fetchProfile(s.user.id);
        else { setProfile(null); setPermissions({}); setEntitlements([]); }
      }
    );

    return () => { clearTimeout(safetyTimer); subscription.unsubscribe(); };
  }, [fetchProfile]);

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
    setPermissions({});
    setEntitlements([]);
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const isSuperAdmin = profile?.is_super_admin === true;
  const isAccountAdmin = profile?.is_account_admin === true;

  const hasDepartmentAccess = (dept) => {
    if (isSuperAdmin) return true;
    return permissions[dept] === 'view' || permissions[dept] === 'edit';
  };

  const canEditDepartment = (dept) => {
    if (isSuperAdmin) return true;
    return permissions[dept] === 'edit';
  };

  const hasProductAccess = (code) => {
    if (isSuperAdmin) return true;
    return entitlements.some((e) => e.code === code && e.status === 'active');
  };

  const value = {
    session,
    user,
    profile,
    permissions,
    entitlements,
    loading,
    isSuperAdmin,
    isAccountAdmin,
    hasDepartmentAccess,
    canEditDepartment,
    hasProductAccess,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile: () => fetchProfile(user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

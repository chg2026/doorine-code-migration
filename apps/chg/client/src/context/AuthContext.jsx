import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data } = await api.get(`/auth/me`);
      setProfile(data.profile);
      setPermissions(data.permissions || {});
      return data;
    } catch {
      setProfile(null);
      setPermissions({});
      return null;
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) await fetchProfile(s.user.id);
        else { setProfile(null); setPermissions({}); }
      }
    );

    return () => subscription.unsubscribe();
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

  const value = {
    session,
    user,
    profile,
    permissions,
    loading,
    isSuperAdmin,
    isAccountAdmin,
    hasDepartmentAccess,
    canEditDepartment,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile: () => fetchProfile(user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

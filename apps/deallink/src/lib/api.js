import axios from 'axios';
import { supabase } from './supabase.js';

// All authenticated calls go through this client. In dev, Vite proxies
// /api → http://localhost:5000 (see vite.config.js). In the Deal Link
// production deployment, set VITE_API_BASE_URL to the Gold Bridge
// deployment's origin (e.g. https://app.goldbridge.dev) — Express's
// permissive CORS + Bearer-token auth means cross-origin works without
// cookie/sessions plumbing.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') + '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;

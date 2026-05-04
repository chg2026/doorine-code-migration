import axios from 'axios';
import { supabase } from './supabase.js';

// All authenticated calls go through this client. In dev, Vite proxies
// /api → http://localhost:8080 (see vite.config.js). In the Deal Link
// production deployment, set VITE_API_BASE_URL to the deployed Gold Bridge
// Express server URL (e.g. https://server-xxx.replit.app) — Express's
// permissive CORS + Bearer-token auth means cross-origin works without
// cookie/session plumbing.
//
// IMPORTANT: VITE_API_BASE_URL is baked in at build time by Vite. It must be
// set as a Secret in the Deal Link deployment BEFORE the build runs.
// Changing it afterwards has no effect on an already-built app.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') + '/api';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    '[deallink] VITE_API_BASE_URL is not set in this production build. ' +
    'All API calls (/auth/me, /deals, etc.) will fail — the Vite dev proxy ' +
    'is not available in production. Set this Secret to the deployed Gold ' +
    'Bridge Express server URL and rebuild before deploying.'
  );
}

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

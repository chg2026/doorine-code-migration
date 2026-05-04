import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_PORT = process.env.DEALLINK_API_PORT || '8080';

// Derive the API base URL from available environment signals:
//   1. VITE_API_BASE_URL — explicitly set (required for production deploys).
//   2. REPLIT_DEV_DOMAIN — auto-provided by Replit. When present we call the
//      Express server directly cross-origin (CORS allows all origins, Bearer-
//      token auth — no cookies needed). This resolves the API on every Replit
//      dev session without hardcoding a per-instance hostname in .env.
//   3. Blank — Vite proxy falls back to proxying /api → localhost:${SERVER_PORT}.
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN || '';
const effectiveApiBaseUrl =
  process.env.VITE_API_BASE_URL ||
  (REPLIT_DEV_DOMAIN ? `https://${REPLIT_DEV_DOMAIN}:${SERVER_PORT}` : '');

export default defineConfig({
  plugins: [react()],
  // Inject the resolved API base URL so import.meta.env.VITE_API_BASE_URL is
  // always concrete at build/serve time — even when the .env file leaves it blank.
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(effectiveApiBaseUrl),
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    // Fallback proxy: used only when effectiveApiBaseUrl is blank (no REPLIT_DEV_DOMAIN
    // and no explicit VITE_API_BASE_URL — e.g. a plain local clone without Replit).
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3001,
    allowedHosts: true,
  },
});

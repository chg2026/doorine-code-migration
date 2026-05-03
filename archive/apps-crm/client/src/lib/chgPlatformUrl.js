import api from './api';

// Phase 4 cutover: post-auth flows in the legacy CRM (Login, Signup,
// PhoneAuth) should land users in the chg-rehab app — the new home of the
// CHG Platform. The target is resolved from the 'chg' product entitlement's
// brand_domain (set via super-admin → Products in production), with a Replit
// dev fallback that hits chg-rehab on port 3000 of the same dev host. If
// neither is available the caller should keep the legacy '/' fallback so the
// user still lands somewhere usable.
export async function resolveChgPlatformUrl() {
  try {
    const { data } = await api.get('/auth/me');
    const chg = (data?.entitlements || []).find(
      (e) => e.code === 'chg' && e.status === 'active'
    );
    if (chg?.brand_domain) return `https://${chg.brand_domain}`;
  } catch {
    // fall through to dev / null
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (/\.replit\.dev$/.test(host)) return `https://${host}:3000`;
  }
  return null;
}

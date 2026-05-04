// Typed-ish wrappers around the /api/deallink/* endpoints. The server
// stores fields in snake_case (Postgres convention); the React UI uses
// camelCase. This file is the single boundary where translation happens
// — keep all API → UI shape conversion here so pages and the reducer
// only ever see the camelCase shape.

import api, { API_BASE } from './api.js';

// ─── deals ────────────────────────────────────────────────────────────────
export function dealFromApi(d) {
  if (!d) return null;
  return {
    id: d.id,
    addr: d.addr || '',
    city: d.city || '',
    zip: d.zip || '',
    type: d.type || 'SFR',
    units: d.units ?? 1,
    beds: d.beds ?? 0,
    baths: Number(d.baths ?? 0),
    sqft: d.sqft ?? 0,
    ask: d.ask ?? 0,
    arv: d.arv ?? 0,
    occ: d.occ || 'Vacant',
    access: d.access || 'Lockbox',
    status: d.status || 'active',
    notes: d.notes || '',
    hideStreet: !!d.hide_street,
    new: !!d.is_new,
    createdAt: d.created_at,
  };
}

export function dealToApi(d) {
  if (!d) return {};
  const out = {};
  const map = {
    addr: 'addr', city: 'city', zip: 'zip', type: 'type', units: 'units',
    beds: 'beds', baths: 'baths', sqft: 'sqft', ask: 'ask', arv: 'arv',
    occ: 'occ', access: 'access', status: 'status', notes: 'notes',
    hideStreet: 'hide_street', new: 'is_new',
  };
  for (const [from, to] of Object.entries(map)) {
    if (from in d) out[to] = d[from];
  }
  return out;
}

// ─── profile ──────────────────────────────────────────────────────────────
export function profileFromApi(p) {
  if (!p) return null;
  return {
    handle: p.handle || '',
    name: p.name || '',
    initials: p.initials || '',
    bio: p.bio || '',
    city: p.city || '',
    email: p.email || '',
    featuredId: p.featured_id || null,
    onboarding: p.onboarding || {},
  };
}

export function profileToApi(p) {
  const out = {};
  if ('handle' in p) out.handle = p.handle;
  if ('name' in p) out.name = p.name;
  if ('initials' in p) out.initials = p.initials;
  if ('bio' in p) out.bio = p.bio;
  if ('city' in p) out.city = p.city;
  if ('email' in p) out.email = p.email;
  if ('featuredId' in p) out.featured_id = p.featuredId;
  if ('onboarding' in p) out.onboarding = p.onboarding;
  return out;
}

// ─── leads ────────────────────────────────────────────────────────────────
export function leadFromApi(l) {
  if (!l) return null;
  return {
    id: l.id,
    dealId: l.deal_id || null,
    kind: l.kind || 'deal-interest',
    first: l.first_name || '',
    last: l.last_name || '',
    email: l.email || '',
    phone: l.phone || '',
    buyerType: l.buyer_type || '',
    createdAt: l.created_at ? new Date(l.created_at).getTime() : null,
  };
}

export function leadToApi(l) {
  return {
    deal_id: l.dealId || null,
    kind: l.kind || 'deal-interest',
    first_name: l.first || '',
    last_name: l.last || '',
    email: l.email || '',
    phone: l.phone || '',
    buyer_type: l.buyerType || '',
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────
export const DealLinkAPI = {
  async getProfile() {
    const { data } = await api.get('/deallink/profile');
    return profileFromApi(data.profile);
  },
  async putProfile(patch) {
    const { data } = await api.put('/deallink/profile', profileToApi(patch));
    return profileFromApi(data.profile);
  },
  async listDeals() {
    const { data } = await api.get('/deallink/deals');
    return (data.deals || []).map(dealFromApi);
  },
  async createDeal(deal) {
    const { data } = await api.post('/deallink/deals', dealToApi(deal));
    return dealFromApi(data.deal);
  },
  async createDeals(deals) {
    const payload = { deals: deals.map(dealToApi) };
    const { data } = await api.post('/deallink/deals/bulk', payload);
    return (data.deals || []).map(dealFromApi);
  },
  async updateDeal(id, patch) {
    const { data } = await api.patch(`/deallink/deals/${id}`, dealToApi(patch));
    return dealFromApi(data.deal);
  },
  async deleteDeal(id) {
    await api.delete(`/deallink/deals/${id}`);
  },
  async listLeads() {
    const { data } = await api.get('/deallink/leads');
    return (data.leads || []).map(leadFromApi);
  },
};

// ─── public (unauthenticated) ─────────────────────────────────────────────
// These hit /api/deallink/public/* and use plain fetch so Supabase auth
// headers are never attached (avoids leaking a session token to the
// public read surface). Honors the same VITE_API_BASE_URL as axios so
// cross-origin production deployments work.
const PUBLIC_BASE = `${API_BASE}/deallink/public`;

export const PublicAPI = {
  async getProfile(handle) {
    const res = await fetch(`${PUBLIC_BASE}/${encodeURIComponent(handle)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
    const data = await res.json();
    return {
      profile: data.profile ? { ...profileFromApi(data.profile), email: '' } : null,
      deals: (data.deals || []).map(dealFromApi),
    };
  },
  async getDeal(handle, dealId) {
    const res = await fetch(`${PUBLIC_BASE}/${encodeURIComponent(handle)}/${encodeURIComponent(dealId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load deal (${res.status})`);
    const data = await res.json();
    return {
      profile: data.profile ? { ...profileFromApi(data.profile), email: '' } : null,
      deal: dealFromApi(data.deal),
    };
  },
  async submitLead(handle, lead) {
    const res = await fetch(`${PUBLIC_BASE}/${encodeURIComponent(handle)}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadToApi(lead)),
    });
    if (!res.ok) throw new Error(`Failed to submit lead (${res.status})`);
    return res.json();
  },
};

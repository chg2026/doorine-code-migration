// Typed-ish wrappers around the /api/deallink/* endpoints. The server
// stores fields in snake_case (Postgres convention); the React UI uses
// camelCase. This file is the single boundary where translation happens.

import api, { API_BASE } from './api.js';

// Status helpers (new vocabulary: New | Marketed | Under Contract | Closed | Dead).
export const DEAL_STATUSES = ['New', 'Marketed', 'Under Contract', 'Closed', 'Dead'];
export const PUBLIC_STATUSES = new Set(['New', 'Marketed', 'Under Contract']);

const LEGACY_STATUS = { active: 'Marketed', pending: 'Under Contract', sold: 'Closed' };
function normalizeStatus(s) {
  if (!s) return 'New';
  if (DEAL_STATUSES.includes(s)) return s;
  return LEGACY_STATUS[s] || 'New';
}

// ─── deals ────────────────────────────────────────────────────────────────
export function dealFromApi(d) {
  if (!d) return null;
  return {
    id: d.id,
    addr: d.addr || '',
    city: d.city || '',
    state: d.state || '',
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
    status: normalizeStatus(d.status),
    notes: d.notes || '',
    description: d.description || '',
    photoUrl: d.photo_url || '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    hideStreet: !!d.hide_street,
    new: !!d.is_new,
    createdAt: d.created_at,
    // ─── IM (Investment Memorandum) — Module 1 ──────────────────────────
    imSlug: d.im_slug || null,
    imShowArv:          d.im_show_arv          == null ? true  : !!d.im_show_arv,
    imShowAsking:       d.im_show_asking       == null ? true  : !!d.im_show_asking,
    imShowRepair:       d.im_show_repair       == null ? true  : !!d.im_show_repair,
    imShowMao:          d.im_show_mao          == null ? false : !!d.im_show_mao,
    imShowContact:      d.im_show_contact      == null ? true  : !!d.im_show_contact,
    imShowStreetNumber: d.im_show_street_number == null ? true : !!d.im_show_street_number,
  };
}

export function dealToApi(d) {
  if (!d) return {};
  const out = {};
  const map = {
    addr: 'addr', city: 'city', state: 'state', zip: 'zip', type: 'type', units: 'units',
    beds: 'beds', baths: 'baths', sqft: 'sqft', ask: 'ask', arv: 'arv',
    occ: 'occ', access: 'access', status: 'status', notes: 'notes',
    description: 'description', photoUrl: 'photo_url', tags: 'tags',
    hideStreet: 'hide_street', new: 'is_new',
  };
  for (const [from, to] of Object.entries(map)) {
    if (from in d) out[to] = d[from];
  }
  if ('status' in out) out.status = normalizeStatus(out.status);
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
    marketplaceOptIn: !!p.marketplace_opt_in,
    avatarUrl: p.avatar_url || '',
    backgroundType: p.background_type || 'solid',
    backgroundValue: p.background_value || '#161b2e',
    socialLinks: p.social_links && typeof p.social_links === 'object' ? p.social_links : {},
    tone: p.tone || '',
    accentColor: p.accent_color || '',
    radius: p.radius ?? null,
    gradientEnabled: !!p.gradient_enabled,
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
  if ('marketplaceOptIn' in p) out.marketplace_opt_in = !!p.marketplaceOptIn;
  if ('avatarUrl' in p) out.avatar_url = p.avatarUrl;
  if ('backgroundType' in p) out.background_type = p.backgroundType;
  if ('backgroundValue' in p) out.background_value = p.backgroundValue;
  if ('socialLinks' in p) out.social_links = p.socialLinks || {};
  if ('tone' in p) out.tone = p.tone;
  if ('accentColor' in p) out.accent_color = p.accentColor;
  if ('radius' in p) out.radius = p.radius;
  if ('gradientEnabled' in p) out.gradient_enabled = !!p.gradientEnabled;
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

// ─── buyers ───────────────────────────────────────────────────────────────
export function buyerFromApi(b) {
  if (!b) return null;
  return {
    id: b.id,
    name: b.name || '',
    email: b.email || '',
    phone: b.phone || '',
    buyerType: b.buyer_type || 'Cash Buyer',
    status: b.status || 'Active',
    markets: Array.isArray(b.markets) ? b.markets : [],
    propertyTypes: Array.isArray(b.property_types) ? b.property_types : [],
    minPrice: b.min_price ?? 0,
    maxPrice: b.max_price ?? 0,
    notes: b.notes || '',
    source: b.source || 'manual',
    createdAt: b.created_at ? new Date(b.created_at).getTime() : null,
  };
}

export function buyerToApi(b) {
  const out = {};
  const map = {
    name: 'name', email: 'email', phone: 'phone', buyerType: 'buyer_type',
    status: 'status', markets: 'markets', propertyTypes: 'property_types',
    minPrice: 'min_price', maxPrice: 'max_price', notes: 'notes', source: 'source',
  };
  for (const [from, to] of Object.entries(map)) if (from in b) out[to] = b[from];
  return out;
}

// ─── offers ───────────────────────────────────────────────────────────────
export function offerFromApi(o) {
  if (!o) return null;
  return {
    id: o.id,
    dealId: o.deal_id || null,
    buyerId: o.buyer_id || null,
    buyerName: o.buyer_name || '',
    amount: o.amount ?? 0,
    status: o.status || 'Pending',
    notes: o.notes || '',
    createdAt: o.created_at ? new Date(o.created_at).getTime() : null,
  };
}

export function offerToApi(o) {
  const out = {};
  const map = {
    dealId: 'deal_id', buyerId: 'buyer_id', buyerName: 'buyer_name',
    amount: 'amount', status: 'status', notes: 'notes',
  };
  for (const [from, to] of Object.entries(map)) if (from in o) out[to] = o[from];
  return out;
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
  async patchProfile(patch) {
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
    const { data } = await api.post('/deallink/deals/bulk', { deals: deals.map(dealToApi) });
    return (data.deals || []).map(dealFromApi);
  },
  async updateDeal(id, patch) {
    const { data } = await api.patch(`/deallink/deals/${id}`, dealToApi(patch));
    return dealFromApi(data.deal);
  },
  async deleteDeal(id) { await api.delete(`/deallink/deals/${id}`); },
  async shareIM(id) {
    const { data } = await api.post(`/deallink/deals/${id}/im/share`);
    return data.slug;
  },
  async updateIMToggles(id, toggles) {
    // toggles: { imShowArv?, imShowAsking?, imShowRepair?, imShowMao?, imShowContact?, imShowStreetNumber? }
    const map = {
      imShowArv: 'im_show_arv', imShowAsking: 'im_show_asking',
      imShowRepair: 'im_show_repair', imShowMao: 'im_show_mao',
      imShowContact: 'im_show_contact', imShowStreetNumber: 'im_show_street_number',
    };
    const body = {};
    for (const [k, v] of Object.entries(toggles)) if (k in map) body[map[k]] = !!v;
    const { data } = await api.patch(`/deallink/deals/${id}/im/toggles`, body);
    return data.deal;
  },
  async listLeads() {
    const { data } = await api.get('/deallink/leads');
    return (data.leads || []).map(leadFromApi);
  },
  async listBuyers() {
    const { data } = await api.get('/deallink/buyers');
    return (data.buyers || []).map(buyerFromApi);
  },
  async createBuyer(b) {
    const { data } = await api.post('/deallink/buyers', buyerToApi(b));
    return buyerFromApi(data.buyer);
  },
  async updateBuyer(id, patch) {
    const { data } = await api.patch(`/deallink/buyers/${id}`, buyerToApi(patch));
    return buyerFromApi(data.buyer);
  },
  async deleteBuyer(id) { await api.delete(`/deallink/buyers/${id}`); },
  async listOffers() {
    const { data } = await api.get('/deallink/offers');
    return (data.offers || []).map(offerFromApi);
  },
  async createOffer(o) {
    const { data } = await api.post('/deallink/offers', offerToApi(o));
    return offerFromApi(data.offer);
  },
  async updateOffer(id, patch) {
    const { data } = await api.patch(`/deallink/offers/${id}`, offerToApi(patch));
    return offerFromApi(data.offer);
  },
  async deleteOffer(id) { await api.delete(`/deallink/offers/${id}`); },
  async listMarketplace() {
    const { data } = await api.get('/deallink/marketplace');
    return (data.deals || []).map((d) => ({
      ...dealFromApi(d),
      seller: d.seller || null,
    }));
  },
};

// ─── public (unauthenticated) ─────────────────────────────────────────────
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

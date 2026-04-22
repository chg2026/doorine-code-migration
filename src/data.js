const STORAGE_KEY = 'deallink:state:v1';

const SEED_DEALS = [
  { id: 'd1', addr: '2418 Wentworth Ave', city: 'Dallas, TX', zip: '75215', ask: 142, arv: 225, beds: 3, baths: 2, sqft: 1340, units: 1, type: 'SFR', status: 'active', occ: 'Vacant', access: 'Lockbox', new: true, hideStreet: false, notes: 'Cosmetic rehab. New roof 2023. Seller motivated, contract ready.' },
  { id: 'd2', addr: '1903 N Prairie St', city: 'Dallas, TX', zip: '75204', ask: 89, arv: 168, beds: 2, baths: 1, sqft: 980, units: 1, type: 'SFR', status: 'active', occ: 'Tenant', access: 'Tenant', new: false, hideStreet: false, notes: 'Tenant on month-to-month, paying $1,100. Light cosmetic.' },
  { id: 'd3', addr: '7412 Beckley Ave', city: 'Dallas, TX', zip: '75232', ask: 310, arv: 480, beds: 8, baths: 4, sqft: 3200, units: 4, type: 'MF', status: 'active', occ: 'Mixed', access: 'Call', new: false, hideStreet: false, notes: '4-unit, 3 occupied. Solid cash-flow play. Roof 2021.' },
  { id: 'd4', addr: '4221 Maple Grove Rd', city: 'Fort Worth, TX', zip: '76114', ask: 168, arv: 245, beds: 3, baths: 2, sqft: 1520, units: 1, type: 'SFR', status: 'pending', occ: 'Vacant', access: 'Lockbox', new: false, hideStreet: false, notes: 'Under contract — backup offers welcome.' },
  { id: 'd5', addr: '508 E Jefferson Blvd', city: 'Dallas, TX', zip: '75203', ask: 74, arv: 140, beds: 2, baths: 1, sqft: 820, units: 1, type: 'SFR', status: 'active', occ: 'Vacant', access: 'Lockbox', new: true, hideStreet: true, notes: 'Cash only — minor foundation work needed.' },
  { id: 'd6', addr: '1201 Ferris Ave', city: 'Waxahachie, TX', zip: '75165', ask: 215, arv: 340, beds: 4, baths: 2, sqft: 2100, units: 2, type: 'DUP', status: 'active', occ: 'Tenant', access: 'Tenant', new: false, hideStreet: false, notes: 'Duplex with both units leased. $2,800/mo gross.' },
  { id: 'd7', addr: '6810 Ridgecrest Dr', city: 'Arlington, TX', zip: '76016', ask: 195, arv: 310, beds: 3, baths: 2, sqft: 1680, units: 1, type: 'SFR', status: 'sold', occ: 'Vacant', access: 'Lockbox', new: false, hideStreet: false, notes: 'Closed March 2026.' },
];

const SEED_PROFILE = {
  handle: 'jrodriguez.deals',
  initials: 'JR',
  name: 'J Rodriguez',
  bio: 'DFW wholesaler · Off-market inventory posted Mondays',
  city: 'Dallas / Fort Worth',
  email: 'j@rodriguez.deals',
  featuredId: 'd3',
};

const SEED_LEADS = [];

const SEED_ONBOARDING = {
  claimed: true,
  addedDeal: false,
  uploadedPhotos: false,
  shared: false,
};

function defaultState() {
  return {
    profile: { ...SEED_PROFILE },
    deals: SEED_DEALS.map(d => ({ ...d })),
    leads: SEED_LEADS.slice(),
    onboarding: { ...SEED_ONBOARDING },
    auth: { signedIn: false },
  };
}

export function loadState() {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function resetState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function newId() {
  return 'd' + Math.random().toString(36).slice(2, 8);
}

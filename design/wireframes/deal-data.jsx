// Shared sample deals so every screen reads the same inventory.
const DEALS = [
  { id: 'd1', addr: '2418 Wentworth Ave', city: 'Dallas, TX',   zip: '75215', ask: 142, arv: 225, beds: 3, baths: 2, sqft: 1340, units: 1, type: 'SFR',   status: 'active',  occ: 'Vacant',   access: 'Lockbox',   new: true  },
  { id: 'd2', addr: '1903 N Prairie St',   city: 'Dallas, TX',   zip: '75204', ask: 89,  arv: 168, beds: 2, baths: 1, sqft: 980,  units: 1, type: 'SFR',   status: 'active',  occ: 'Tenant',   access: 'Tenant',    new: false },
  { id: 'd3', addr: '7412 Beckley Ave',    city: 'Dallas, TX',   zip: '75232', ask: 310, arv: 480, beds: 8, baths: 4, sqft: 3200, units: 4, type: 'MF',    status: 'active',  occ: 'Mixed',    access: 'Call',      new: false },
  { id: 'd4', addr: '4221 Maple Grove Rd', city: 'Fort Worth',   zip: '76114', ask: 168, arv: 245, beds: 3, baths: 2, sqft: 1520, units: 1, type: 'SFR',   status: 'pending', occ: 'Vacant',   access: 'Lockbox',   new: false },
  { id: 'd5', addr: '508 E Jefferson Blvd', city: 'Dallas, TX',  zip: '75203', ask: 74,  arv: 140, beds: 2, baths: 1, sqft: 820,  units: 1, type: 'SFR',   status: 'active',  occ: 'Vacant',   access: 'Lockbox',   new: true  },
  { id: 'd6', addr: '1201 Ferris Ave',     city: 'Waxahachie',   zip: '75165', ask: 215, arv: 340, beds: 4, baths: 2, sqft: 2100, units: 2, type: 'DUP',   status: 'active',  occ: 'Tenant',   access: 'Tenant',    new: false },
  { id: 'd7', addr: '6810 Ridgecrest Dr',  city: 'Arlington',    zip: '76016', ask: 195, arv: 310, beds: 3, baths: 2, sqft: 1680, units: 1, type: 'SFR',   status: 'sold',    occ: 'Vacant',   access: 'Lockbox',   new: false },
];

window.DEALS = DEALS;

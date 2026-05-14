// Deal Link product routes. Mounted at /api/deallink in server/index.js
// behind requireAuth + requireProduct('deallink') + scopeToAccount.
//
// All handlers operate on the caller's account_id (req.account_filter is
// set by scopeToAccount; super admins get null and may pass ?account_id).
// Public unauthenticated routes for the wholesaler-facing /p/:handle page
// live in routes/deallink-public.js.

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')

const router = express.Router()

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

function accountIdFor(req) {
  if (req.user?.is_super_admin && req.query?.account_id) return req.query.account_id
  return req.account_filter || req.user?.account_id || null
}

// ─── PROFILE ──────────────────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_profiles')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ profile: data })
})

router.put('/profile', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const allowed = ['handle', 'name', 'initials', 'bio', 'city', 'email', 'featured_id', 'onboarding', 'marketplace_opt_in', 'avatar_url', 'background_type', 'background_value', 'social_links']
  const patch = { account_id: accountId }
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]

  if (patch.handle) patch.handle = String(patch.handle).toLowerCase().trim()
  if (!patch.handle) return res.status(400).json({ error: 'handle is required.' })

  const { data, error } = await db
    .from('deallink_profiles')
    .upsert(patch, { onConflict: 'account_id' })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That handle is already taken.' })
    return res.status(500).json({ error: error.message })
  }
  res.json({ profile: data })
})

// ─── DEALS ────────────────────────────────────────────────────────────────

const DEAL_FIELDS = [
  'addr', 'city', 'state', 'zip', 'type', 'units', 'beds', 'baths', 'sqft',
  'ask', 'arv', 'occ', 'access', 'status', 'notes', 'description', 'photo_url',
  'tags', 'hide_street', 'is_new',
]

const VALID_STATUSES = new Set(['New', 'Marketed', 'Under Contract', 'Closed', 'Dead'])

function pickDeal(body) {
  const out = {}
  for (const k of DEAL_FIELDS) if (k in body) out[k] = body[k]
  if ('status' in out && !VALID_STATUSES.has(out.status)) {
    // Translate legacy values from older clients.
    const legacy = { active: 'Marketed', pending: 'Under Contract', sold: 'Closed' }
    out.status = legacy[out.status] || 'New'
  }
  return out
}

router.get('/deals', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_deals')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ deals: data || [] })
})

router.post('/deals', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const row = { ...pickDeal(req.body), account_id: accountId }
  if (!row.status) row.status = 'New'

  const { data, error } = await db.from('deallink_deals').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ deal: data })
})

router.post('/deals/bulk', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const incoming = Array.isArray(req.body?.deals) ? req.body.deals : []
  if (!incoming.length) return res.json({ deals: [] })

  const rows = incoming.map((d) => ({ ...pickDeal(d), account_id: accountId }))
  const { data, error } = await db.from('deallink_deals').insert(rows).select()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ deals: data || [] })
})

router.patch('/deals/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_deals')
    .update(pickDeal(req.body))
    .eq('id', req.params.id)
    .eq('account_id', accountId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Deal not found.' })
  res.json({ deal: data })
})

router.delete('/deals/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  // Null any offers' deal_id first — the composite FK
  // (deal_id, account_id) → deallink_deals is ON DELETE NO ACTION to
  // preserve cross-tenant integrity (see 20260514000000 migration), so
  // we must clear the ref ourselves. Offers carry denormalized
  // buyer_name and survive parent removal by design.
  const { error: nErr } = await db
    .from('deallink_offers')
    .update({ deal_id: null })
    .eq('deal_id', req.params.id)
    .eq('account_id', accountId)
  if (nErr) return res.status(500).json({ error: nErr.message })

  const { error } = await db
    .from('deallink_deals')
    .delete()
    .eq('id', req.params.id)
    .eq('account_id', accountId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── INVESTMENT MEMORANDUM (IM) — Module 1 (wholesaler-side) ─────────────
// Generates a public slug for a deal and lets the wholesaler toggle which
// fields appear on the buyer-facing IM page. Buyer auth, SMS gate, and the
// buyer-safe IM read endpoint are separate modules.

const IM_TOGGLE_FIELDS = new Set([
  'im_show_arv', 'im_show_asking', 'im_show_repair',
  'im_show_mao', 'im_show_contact', 'im_show_street_number',
])

function slugifyDeal(deal) {
  const parts = [deal.addr || '', deal.city || '']
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return parts || 'deal'
}

// POST /api/deallink/deals/:id/im/share
// Generates and persists im_slug if not yet set; returns the slug.
// Idempotent — calling twice returns the same slug.
router.post('/deals/:id/im/share', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data: deal, error: dErr } = await db
    .from('deallink_deals')
    .select('id, addr, city, im_slug')
    .eq('id', req.params.id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (dErr) return res.status(500).json({ error: dErr.message })
  if (!deal) return res.status(404).json({ error: 'Deal not found.' })

  if (deal.im_slug) return res.json({ slug: deal.im_slug })

  // Resolve uniqueness by appending -2, -3, … on collision. Cap retries.
  const base = slugifyDeal(deal)
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data: clash, error: cErr } = await db
      .from('deallink_deals')
      .select('id')
      .eq('im_slug', candidate)
      .maybeSingle()
    if (cErr) return res.status(500).json({ error: cErr.message })
    if (clash) continue

    const { data: updated, error: uErr } = await db
      .from('deallink_deals')
      .update({ im_slug: candidate })
      .eq('id', deal.id)
      .eq('account_id', accountId)
      .is('im_slug', null)            // race-safe: only set if still null
      .select('im_slug')
      .maybeSingle()
    if (uErr) {
      // Unique-violation race — another concurrent share won; refetch.
      if (uErr.code === '23505') continue
      return res.status(500).json({ error: uErr.message })
    }
    if (!updated) {
      // Another request claimed a slug for this deal between our SELECT
      // and UPDATE — refetch and return whatever's there.
      const { data: fresh } = await db
        .from('deallink_deals')
        .select('im_slug')
        .eq('id', deal.id)
        .eq('account_id', accountId)
        .maybeSingle()
      if (fresh?.im_slug) return res.json({ slug: fresh.im_slug })
      continue
    }
    return res.json({ slug: updated.im_slug })
  }
  return res.status(500).json({ error: 'Failed to generate a unique slug.' })
})

// PATCH /api/deallink/deals/:id/im/toggles
// Body: any subset of im_show_arv|asking|repair|mao|contact|street_number.
router.patch('/deals/:id/im/toggles', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const patch = {}
  for (const k of Object.keys(req.body || {})) {
    if (IM_TOGGLE_FIELDS.has(k)) patch[k] = !!req.body[k]
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid IM toggle fields supplied.' })
  }

  const { data, error } = await db
    .from('deallink_deals')
    .update(patch)
    .eq('id', req.params.id)
    .eq('account_id', accountId)
    .select('id, im_slug, im_show_arv, im_show_asking, im_show_repair, im_show_mao, im_show_contact, im_show_street_number')
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Deal not found.' })
  res.json({ deal: data })
})

// ─── LEADS ────────────────────────────────────────────────────────────────

router.get('/leads', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_leads')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ leads: data || [] })
})

// ─── BUYERS ───────────────────────────────────────────────────────────────

const BUYER_FIELDS = ['name', 'email', 'phone', 'buyer_type', 'status', 'markets',
  'property_types', 'min_price', 'max_price', 'notes', 'source']

function pickBuyer(body) {
  const out = {}
  for (const k of BUYER_FIELDS) if (k in body) out[k] = body[k]
  return out
}

router.get('/buyers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const { data, error } = await db.from('deallink_buyers').select('*')
    .eq('account_id', accountId).order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ buyers: data || [] })
})

router.post('/buyers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const row = { ...pickBuyer(req.body), account_id: accountId }
  if (!row.name) return res.status(400).json({ error: 'name is required.' })
  const { data, error } = await db.from('deallink_buyers').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ buyer: data })
})

router.patch('/buyers/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const { data, error } = await db.from('deallink_buyers').update(pickBuyer(req.body))
    .eq('id', req.params.id).eq('account_id', accountId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Buyer not found.' })
  res.json({ buyer: data })
})

router.delete('/buyers/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  // Null any offers' buyer_id first — see /deals/:id DELETE for rationale
  // (composite FK is NO ACTION; offers preserve buyer_name denormalized).
  const { error: nErr } = await db
    .from('deallink_offers')
    .update({ buyer_id: null })
    .eq('buyer_id', req.params.id)
    .eq('account_id', accountId)
  if (nErr) return res.status(500).json({ error: nErr.message })

  const { error } = await db.from('deallink_buyers').delete()
    .eq('id', req.params.id).eq('account_id', accountId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── OFFERS ───────────────────────────────────────────────────────────────

const OFFER_FIELDS = ['deal_id', 'buyer_id', 'buyer_name', 'amount', 'status', 'notes']
const VALID_OFFER_STATUSES = new Set(['Pending', 'Accepted', 'Rejected', 'Countered'])

function pickOffer(body) {
  const out = {}
  for (const k of OFFER_FIELDS) if (k in body) out[k] = body[k]
  if ('status' in out && !VALID_OFFER_STATUSES.has(out.status)) out.status = 'Pending'
  return out
}

router.get('/offers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const { data, error } = await db.from('deallink_offers').select('*')
    .eq('account_id', accountId).order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ offers: data || [] })
})

router.post('/offers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const row = { ...pickOffer(req.body), account_id: accountId }
  if (row.deal_id) {
    const { data: deal } = await db.from('deallink_deals').select('id, account_id')
      .eq('id', row.deal_id).maybeSingle()
    if (!deal || deal.account_id !== accountId) return res.status(400).json({ error: 'Invalid deal_id.' })
  }
  if (row.buyer_id) {
    const { data: buyer } = await db.from('deallink_buyers').select('id, account_id, name')
      .eq('id', row.buyer_id).maybeSingle()
    if (!buyer || buyer.account_id !== accountId) return res.status(400).json({ error: 'Invalid buyer_id.' })
    if (!row.buyer_name) row.buyer_name = buyer.name
  }
  const { data, error } = await db.from('deallink_offers').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ offer: data })
})

router.patch('/offers/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const patch = pickOffer(req.body)
  if (patch.deal_id) {
    const { data: deal } = await db.from('deallink_deals').select('id, account_id')
      .eq('id', patch.deal_id).maybeSingle()
    if (!deal || deal.account_id !== accountId) return res.status(400).json({ error: 'Invalid deal_id.' })
  }
  if (patch.buyer_id) {
    const { data: buyer } = await db.from('deallink_buyers').select('id, account_id, name')
      .eq('id', patch.buyer_id).maybeSingle()
    if (!buyer || buyer.account_id !== accountId) return res.status(400).json({ error: 'Invalid buyer_id.' })
    if (!patch.buyer_name) patch.buyer_name = buyer.name
  }
  const { data, error } = await db.from('deallink_offers').update(patch)
    .eq('id', req.params.id).eq('account_id', accountId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Offer not found.' })
  res.json({ offer: data })
})

router.delete('/offers/:id', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const { error } = await db.from('deallink_offers').delete()
    .eq('id', req.params.id).eq('account_id', accountId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── MARKETPLACE ─────────────────────────────────────────────────────────
// Cross-wholesaler deal feed. Auth required + product entitlement, but
// returns deals from ANY account whose profile has marketplace_opt_in=true.
// We never expose account_id; profile handle/name only.

function maskAddr(addr) {
  return String(addr || '').replace(/^\d+\s+/, '— ')
}

router.get('/marketplace', async (req, res) => {
  const db = dbOrFail(res); if (!db) return

  const { data: profiles, error: pErr } = await db
    .from('deallink_profiles')
    .select('account_id, handle, name, initials, city')
    .eq('marketplace_opt_in', true)
  if (pErr) return res.status(500).json({ error: pErr.message })

  const byAccount = new Map((profiles || []).map((p) => [p.account_id, p]))
  if (byAccount.size === 0) return res.json({ deals: [] })

  const { data: deals, error: dErr } = await db
    .from('deallink_deals')
    .select('*')
    .in('account_id', Array.from(byAccount.keys()))
    .in('status', ['New', 'Marketed', 'Under Contract'])
    .order('created_at', { ascending: false })
    .limit(200)
  if (dErr) return res.status(500).json({ error: dErr.message })

  res.json({
    deals: (deals || []).map((d) => {
      const seller = byAccount.get(d.account_id) || {}
      return {
        id: d.id,
        addr: d.hide_street ? maskAddr(d.addr) : d.addr,
        city: d.city, state: d.state, zip: d.zip, type: d.type,
        units: d.units, beds: d.beds, baths: d.baths, sqft: d.sqft,
        ask: d.ask, arv: d.arv, status: d.status, tags: d.tags || [],
        photo_url: d.photo_url || '', description: d.description || '',
        created_at: d.created_at,
        seller: {
          handle: seller.handle, name: seller.name,
          initials: seller.initials, city: seller.city,
        },
      }
    }),
  })
})

module.exports = router

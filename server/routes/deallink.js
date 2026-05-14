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

  const allowed = ['handle', 'name', 'initials', 'bio', 'city', 'email', 'featured_id', 'onboarding', 'marketplace_opt_in']
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

  const { error } = await db
    .from('deallink_deals')
    .delete()
    .eq('id', req.params.id)
    .eq('account_id', accountId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
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

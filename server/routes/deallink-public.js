// Public, unauthenticated read path for Deal Link wholesaler profiles.
// Mounted at /api/deallink/public — NO auth, NO requireProduct gate.
//
//   GET  /api/deallink/public/:handle           → { profile, deals }
//   GET  /api/deallink/public/:handle/:dealId   → { profile, deal }
//   POST /api/deallink/public/:handle/leads     → { lead }
//
// Tenant isolation here lives entirely in this code (we never expose
// account_id) plus the RLS policies in phase-5-deallink-tables.sql which
// only let anon read non-sold deals and only insert leads.

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

function maskAddr(addr) {
  return String(addr || '').replace(/^\d+\s+/, '— ')
}

// Strip server-only fields and apply hide_street masking before returning.
function publicDeal(d) {
  if (!d) return null
  return {
    id: d.id,
    addr: d.hide_street ? maskAddr(d.addr) : d.addr,
    city: d.city,
    zip: d.zip,
    type: d.type,
    units: d.units,
    beds: d.beds,
    baths: d.baths,
    sqft: d.sqft,
    ask: d.ask,
    arv: d.arv,
    occ: d.occ,
    access: d.access,
    status: d.status,
    notes: d.notes,
    hide_street: d.hide_street,
    is_new: d.is_new,
    created_at: d.created_at,
  }
}

function publicProfile(p) {
  if (!p) return null
  return {
    handle: p.handle,
    name: p.name,
    initials: p.initials,
    bio: p.bio,
    city: p.city,
    featured_id: p.featured_id,
  }
}

router.get('/:handle', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const handle = String(req.params.handle || '').toLowerCase()

  const { data: profile, error: pErr } = await db
    .from('deallink_profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle()

  if (pErr) return res.status(500).json({ error: pErr.message })
  if (!profile) return res.status(404).json({ error: 'Profile not found.' })

  const { data: deals, error: dErr } = await db
    .from('deallink_deals')
    .select('*')
    .eq('account_id', profile.account_id)
    .in('status', ['New', 'Marketed', 'Under Contract'])
    .order('created_at', { ascending: false })

  if (dErr) return res.status(500).json({ error: dErr.message })

  res.json({
    profile: publicProfile(profile),
    deals: (deals || []).map(publicDeal),
  })
})

router.get('/:handle/:dealId', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const handle = String(req.params.handle || '').toLowerCase()

  const { data: profile, error: pErr } = await db
    .from('deallink_profiles')
    .select('account_id, handle, name, initials, bio, city, featured_id')
    .eq('handle', handle)
    .maybeSingle()

  if (pErr) return res.status(500).json({ error: pErr.message })
  if (!profile) return res.status(404).json({ error: 'Profile not found.' })

  const { data: deal, error: dErr } = await db
    .from('deallink_deals')
    .select('*')
    .eq('account_id', profile.account_id)
    .eq('id', req.params.dealId)
    .in('status', ['New', 'Marketed', 'Under Contract'])
    .maybeSingle()

  if (dErr) return res.status(500).json({ error: dErr.message })
  if (!deal) return res.status(404).json({ error: 'Deal not found.' })

  res.json({
    profile: publicProfile(profile),
    deal: publicDeal(deal),
  })
})

router.post('/:handle/leads', express.json(), async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const handle = String(req.params.handle || '').toLowerCase()

  const { data: profile, error: pErr } = await db
    .from('deallink_profiles')
    .select('account_id')
    .eq('handle', handle)
    .maybeSingle()

  if (pErr) return res.status(500).json({ error: pErr.message })
  if (!profile) return res.status(404).json({ error: 'Profile not found.' })

  const body = req.body || {}
  const kind = body.kind === 'buyer-list' ? 'buyer-list' : 'deal-interest'

  // Validate deal_id (if supplied) belongs to this profile's account and
  // is publicly visible. We use the service-role client which bypasses
  // RLS, so without this check anonymous callers could attach a lead to
  // any deal in any other account — IDOR.
  let dealId = body.deal_id || null
  if (dealId) {
    const { data: deal, error: dErr } = await db
      .from('deallink_deals')
      .select('id, account_id, status')
      .eq('id', dealId)
      .maybeSingle()
    if (dErr) return res.status(500).json({ error: dErr.message })
    const PUBLIC_STATUSES = new Set(['New', 'Marketed', 'Under Contract'])
    if (!deal || deal.account_id !== profile.account_id || !PUBLIC_STATUSES.has(deal.status)) {
      return res.status(400).json({ error: 'Invalid deal_id for this profile.' })
    }
    dealId = deal.id
  }

  const row = {
    account_id: profile.account_id,
    deal_id: dealId,
    kind,
    first_name: String(body.first_name || body.first || '').slice(0, 80),
    last_name: String(body.last_name || body.last || '').slice(0, 80),
    email: String(body.email || '').slice(0, 200),
    phone: String(body.phone || '').slice(0, 40),
    buyer_type: String(body.buyer_type || body.buyerType || '').slice(0, 40),
  }

  if (!row.email) return res.status(400).json({ error: 'email is required.' })

  const { data, error } = await db.from('deallink_leads').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ lead: { id: data.id, created_at: data.created_at } })
})

module.exports = router

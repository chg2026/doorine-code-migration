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
  // Super admins acting on behalf of another account may pass ?account_id.
  if (req.user?.is_super_admin && req.query?.account_id) return req.query.account_id
  return req.account_filter || req.user?.account_id || null
}

function maskAddr(addr) {
  return String(addr || '').replace(/^\d+\s+/, '— ')
}

// ─── PROFILE ──────────────────────────────────────────────────────────────
// Single row per account. GET returns null if the user hasn't claimed a
// handle yet — front-end then routes to /onboarding.

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

  const allowed = ['handle', 'name', 'initials', 'bio', 'city', 'email', 'featured_id', 'onboarding', 'marketplace_opt_in', 'avatar_url', 'background_type', 'background_value', 'social_links', 'radius', 'gradient_enabled', 'tone', 'accent_color']
  const patch = { account_id: accountId }
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]

  if (patch.handle) patch.handle = String(patch.handle).toLowerCase().trim()
  if (!patch.handle) return res.status(400).json({ error: 'handle is required.' })

  // upsert by account_id; UNIQUE(handle) guards against handle collisions.
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
  'addr', 'city', 'zip', 'type', 'units', 'beds', 'baths', 'sqft',
  'ask', 'arv', 'occ', 'access', 'status', 'notes', 'hide_street', 'is_new',
  'analyzer_state', 'analyzer_state_updated_at', 'im_config',
  'photos',
]

function pickDeal(body) {
  const out = {}
  for (const k of DEAL_FIELDS) if (k in body) out[k] = body[k]
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

// ─── MARKETPLACE ─────────────────────────────────────────────────────────
// Cross-wholesaler deal feed. Auth required + product entitlement, but
// returns deals from ANY account whose profile has marketplace_opt_in=true.
// We never expose account_id; profile handle/name only.

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
        ...d,
        addr: d.hide_street ? maskAddr(d.addr) : d.addr,
        seller: { handle: seller.handle, name: seller.name, initials: seller.initials, city: seller.city },
      }
    }),
  })
})

module.exports = router
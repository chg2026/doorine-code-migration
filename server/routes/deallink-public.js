// Public, unauthenticated read path for Deal Link wholesaler profiles.
// Mounted at /api/deallink/public — NO auth, NO requireProduct gate.
//
//   GET  /api/deallink/public/:handle           → { profile, deals }
//   GET  /api/deallink/public/:handle/:dealId   → { profile, deal }
//   POST /api/deallink/public/:handle/leads     → { lead }

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const { createNotification, sendEmailNotification } = require('../services/notifications')

const router = express.Router()

// Resolve account_id → owner user_id, then log a profile_viewed notification.
// Fire-and-forget: never throws, never delays the API response.
async function logProfileView(db, profile) {
  try {
    const { data: owner } = await db
      .from('user_profiles')
      .select('id')
      .eq('account_id', profile.account_id)
      .eq('is_account_admin', true)
      .maybeSingle()
    if (!owner?.id) return
    await db.from('deallink_notifications').insert({
      user_id: owner.id,
      type:    'profile_viewed',
      title:   'Someone viewed your profile',
      body:    'A visitor opened your public REI Flywheel profile.',
      read:    false,
    })
  } catch (_) { /* non-critical — never throw */ }
}

const PUBLIC_STATUSES = ['New', 'Marketed', 'Under Contract']

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
    photos: d.photos || [],
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
    tone: p.tone,
    accent_color: p.accent_color,
    radius: p.radius,
    gradient_enabled: p.gradient_enabled,
    avatar_url: p.avatar_url || null,
    social_links: p.social_links || {},
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
    .in('status', PUBLIC_STATUSES)
    .order('created_at', { ascending: false })

  if (dErr) return res.status(500).json({ error: dErr.message })

  logProfileView(db, profile) // fire-and-forget

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
    .in('status', PUBLIC_STATUSES)
    .maybeSingle()

  if (dErr) return res.status(500).json({ error: dErr.message })
  if (!deal) return res.status(404).json({ error: 'Deal not found.' })

  res.json({
    profile: publicProfile(profile),
    deal: publicDeal(deal),
  })

  // Fire-and-forget: notify the deal owner that a buyer viewed this deal.
  // Does not await — buyer page load is unaffected.
  ;(async () => {
    try {
      if (!supabaseAdmin) return

      // Resolve the deal owner's user_id and email from their account.
      const { data: owner } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email')
        .eq('account_id', profile.account_id)
        .eq('is_account_admin', true)
        .maybeSingle()

      if (!owner?.id || !owner?.email) return

      // Deduplicate: skip if we already notified this owner about this deal
      // within the last 24 hours.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recent } = await supabaseAdmin
        .from('deallink_notifications')
        .select('id')
        .eq('user_id', owner.id)
        .eq('type', 'buyer_viewed')
        .filter('metadata->>deal_id', 'eq', req.params.dealId)
        .gte('created_at', since)
        .maybeSingle()

      if (recent) return

      const dealAddr = deal.addr || 'Your deal'

      await createNotification(
        owner.id,
        'buyer_viewed',
        'Someone viewed your deal',
        `${dealAddr} was just viewed`,
        { deal_id: req.params.dealId }
      )

      await sendEmailNotification(
        owner.email,
        'Your deal was just viewed — REI Flywheel',
        `<p>Hi,</p>
<p>Someone just viewed your deal at <strong>${dealAddr}</strong>.</p>
<p><a href="https://reiflywheel.doorine.com">Open REI Flywheel</a> to see your deal activity.</p>
<p>— The REI Flywheel team</p>`
      )
    } catch (notifyErr) {
      console.error('[deallink-public/buyer_viewed] Notification error:', notifyErr.message)
    }
  })()
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
  // is publicly visible — service-role client bypasses RLS, so without this
  // check anonymous callers could attach a lead to any deal in any account.
  let dealId = body.deal_id || null
  if (dealId) {
    const { data: deal, error: dErr } = await db
      .from('deallink_deals')
      .select('id, account_id, status')
      .eq('id', dealId)
      .maybeSingle()
    if (dErr) return res.status(500).json({ error: dErr.message })
    const allowed = new Set(PUBLIC_STATUSES)
    if (!deal || deal.account_id !== profile.account_id || !allowed.has(deal.status)) {
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

  // Fire-and-forget: notify the deal owner that a new buyer joined.
  ;(async () => {
    try {
      if (!supabaseAdmin) return

      const { data: owner } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email')
        .eq('account_id', profile.account_id)
        .eq('is_account_admin', true)
        .maybeSingle()

      if (!owner?.id || !owner?.email) return

      const buyerFirst = row.first_name || 'Someone'
      const buyerEmail = row.email
      const buyerType = row.buyer_type || 'Buyer'

      await createNotification(
        owner.id,
        'buyer_joined',
        'New buyer joined your list',
        `${buyerFirst} (${buyerEmail}) joined your buyer list`,
        { deal_id: dealId, buyer_email: buyerEmail }
      )

      await sendEmailNotification(
        owner.email,
        'New buyer on your list — REI Flywheel',
        `<p>Hi,</p>
<p>A new buyer just joined your list.</p>
<ul>
  <li><strong>Name:</strong> ${buyerFirst}${row.last_name ? ' ' + row.last_name : ''}</li>
  <li><strong>Email:</strong> ${buyerEmail}</li>
  <li><strong>Buyer type:</strong> ${buyerType}</li>
</ul>
<p><a href="https://reiflywheel.doorine.com">Open REI Flywheel</a> to view your buyer list.</p>
<p>— The REI Flywheel team</p>`
      )
    } catch (notifyErr) {
      console.error('[deallink-public/buyer_joined] Notification error:', notifyErr.message)
    }
  })()
})

module.exports = router

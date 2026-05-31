// Deal Link product routes. Mounted at /api/deallink in server/index.js
// behind requireAuth + requireProduct('deallink') + scopeToAccount.
//
// All handlers operate on the caller's account_id (req.account_filter is
// set by scopeToAccount; super admins get null and may pass ?account_id).
// Public unauthenticated routes for the wholesaler-facing /p/:handle page
// live in routes/deallink-public.js.

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const { createNotification, sendEmailNotification } = require('../services/notifications')

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
  'photos', 'marketplace_visible', 'contract_date',
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
  ;(async () => {
    try {
      if (!supabaseAdmin || !req.user?.id) return
      await supabaseAdmin.from('deallink_user_stats').upsert(
        { user_id: req.user.id, last_deal_action_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    } catch (e) {
      console.error('[deallink/stats] last_deal_action_at update error (POST /deals):', e.message)
    }
    // Referral activation — runs only when this is the user's first deal.
    try {
      if (!supabaseAdmin || !req.user?.id || !accountId) return

      const { count: totalDeals } = await supabaseAdmin
        .from('deallink_deals')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)

      if (totalDeals !== 1) return

      // Find a pending referral for this user.
      const { data: referral } = await supabaseAdmin
        .from('deallink_referrals')
        .select('id, referrer_id')
        .eq('referred_user_id', req.user.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (!referral) return

      // Activate the referral.
      await supabaseAdmin
        .from('deallink_referrals')
        .update({ status: 'activated', activated_at: new Date().toISOString() })
        .eq('id', referral.id)

      // Count referrer's total activated referrals (including this one).
      const { count: activatedCount } = await supabaseAdmin
        .from('deallink_referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', referral.referrer_id)
        .eq('status', 'activated')

      // Award tier badges if threshold is hit and badge not yet awarded.
      const BADGE_TIERS = [
        { threshold: 3, badge_type: 'founding_member' },
        { threshold: 5, badge_type: 'verified' },
        { threshold: 10, badge_type: 'ambassador' },
      ]

      for (const tier of BADGE_TIERS) {
        if (activatedCount === tier.threshold) {
          const { data: existing } = await supabaseAdmin
            .from('deallink_badges')
            .select('id')
            .eq('user_id', referral.referrer_id)
            .eq('badge_type', tier.badge_type)
            .maybeSingle()

          if (!existing) {
            await supabaseAdmin.from('deallink_badges').insert({
              user_id: referral.referrer_id,
              badge_type: tier.badge_type,
            })
          }
        }
      }

      // Notify the referrer.
      await createNotification(referral.referrer_id, {
        type: 'referral_activated',
        title: 'Your referral is now active!',
        body: 'Someone you referred just posted their first deal.',
      })
    } catch (refErr) {
      console.error('[deallink/referral-activation] Error:', refErr.message)
    }
  })()
  // Alert matching engine — fire-and-forget, never blocks the response.
  ;(async () => {
    if (!supabaseAdmin || !data) return
    try {
      const deal = data
      const marketplaceUrl = `${process.env.VITE_DEALLINK_URL || 'https://reiflywheel.doorine.com'}/marketplace`

      const { data: alerts, error: alertsErr } = await supabaseAdmin
        .from('deallink_market_alerts')
        .select('*')
        .eq('active', true)

      if (alertsErr || !alerts?.length) return

      for (const alert of alerts) {
        try {
          // --- Geography match ---
          const geo = alert.geography || {}
          const geoCity = (geo.city || '').trim().toLowerCase()
          const geoZip = (geo.zip || '').trim()
          const dealCity = (deal.city || '').trim().toLowerCase()
          const dealZip = (deal.zip || '').trim()

          const geoMatch =
            (geoCity && dealCity && dealCity === geoCity) ||
            (geoZip && dealZip && dealZip === geoZip)

          if (!geoMatch) continue

          // --- Type-specific match rules ---
          if (alert.alert_type === 'buyer') {
            // Property type filter
            if (Array.isArray(alert.property_types) && alert.property_types.length) {
              if (!alert.property_types.includes(deal.type)) continue
            }
            // Price range filter
            const ask = parseFloat(deal.ask) || 0
            if (alert.price_min != null && ask < parseFloat(alert.price_min)) continue
            if (alert.price_max != null && ask > parseFloat(alert.price_max)) continue
            // strategy — no field on deals yet, skip
          } else if (alert.alert_type === 'wholesaler_jv') {
            if (!deal.marketplace_visible) continue
          } else {
            // Unknown alert type — skip
            continue
          }

          // --- Fetch recipient email ---
          const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('email')
            .eq('id', alert.user_id)
            .maybeSingle()

          if (!profile?.email) continue

          const addrDisplay = deal.hide_street ? maskAddr(deal.addr) : (deal.addr || 'Address on file')
          const askDisplay = deal.ask ? `$${Number(deal.ask).toLocaleString()}` : 'N/A'
          const typeDisplay = deal.type || 'Property'
          const notifBody = `${addrDisplay} — ${typeDisplay} asking ${askDisplay}`

          // In-app notification
          await createNotification(alert.user_id, {
            type: 'market_alert',
            title: 'New deal in your market',
            body: notifBody,
            metadata: { deal_id: deal.id },
          })

          // Email notification
          await sendEmailNotification(
            profile.email,
            'New deal in your market — REI Flywheel',
            `<p>A new deal matching your alert was just posted.</p>
<p><strong>${addrDisplay}</strong><br>
${typeDisplay} &mdash; Asking ${askDisplay}</p>
<p><a href="${marketplaceUrl}">Browse deals on REI Flywheel →</a></p>
<p style="color:#999;font-size:12px">— The REI Flywheel team</p>`
          )
        } catch (alertErr) {
          console.error(`[deallink/alert-match] Error processing alert ${alert.id}:`, alertErr.message)
        }
      }
    } catch (err) {
      console.error('[deallink/alert-match] Fatal error:', err.message)
    }
  })()
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
  ;(async () => {
    try {
      if (!supabaseAdmin || !req.user?.id) return
      await supabaseAdmin.from('deallink_user_stats').upsert(
        { user_id: req.user.id, last_deal_action_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    } catch (e) {
      console.error('[deallink/stats] last_deal_action_at update error (POST /deals/bulk):', e.message)
    }
  })()
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
  ;(async () => {
    try {
      if (!supabaseAdmin || !req.user?.id) return
      await supabaseAdmin.from('deallink_user_stats').upsert(
        { user_id: req.user.id, last_deal_action_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    } catch (e) {
      console.error('[deallink/stats] last_deal_action_at update error (PATCH /deals/:id):', e.message)
    }
  })()
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

// ─── DEAL DOCUMENTS ───────────────────────────────────────────────────────
// Metadata stored in deallink_documents; files in Supabase Storage bucket
// 'deal-photos' under deals/{dealId}/docs/.
//
// Required table (apply via Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS public.deallink_documents (
//     id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     deal_id    UUID        NOT NULL,
//     account_id UUID        NOT NULL,
//     filename   TEXT        NOT NULL,
//     path       TEXT        NOT NULL,
//     size       BIGINT,
//     mime_type  TEXT,
//     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );

const DOC_BUCKET = 'deal-photos'

// Verify the deal belongs to the caller's account.
async function assertDealOwner(db, dealId, accountId) {
  const { data, error } = await db
    .from('deallink_deals')
    .select('id')
    .eq('id', dealId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// GET /api/deallink/deals/:dealId/documents
router.get('/deals/:dealId/documents', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  try {
    const { data, error } = await db
      .from('deallink_documents')
      .select('*')
      .eq('deal_id', req.params.dealId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    res.json({ documents: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/deallink/deals/:dealId/documents/signed-upload
router.post('/deals/:dealId/documents/signed-upload', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { filename } = req.body
  if (!filename) return res.status(400).json({ error: 'filename is required.' })

  try {
    const owned = await assertDealOwner(db, req.params.dealId, accountId)
    if (!owned) return res.status(404).json({ error: 'Deal not found.' })

    const storagePath = `deals/${req.params.dealId}/docs/${Date.now()}-${filename}`
    const { data, error } = await db.storage
      .from(DOC_BUCKET)
      .createSignedUploadUrl(storagePath)
    if (error) return res.status(500).json({ error: error.message })

    res.json({ signedUrl: data.signedUrl, path: storagePath, token: data.token })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/deallink/deals/:dealId/documents
router.post('/deals/:dealId/documents', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { filename, path: storagePath, size, mime_type } = req.body
  if (!filename || !storagePath) return res.status(400).json({ error: 'filename and path are required.' })

  try {
    const owned = await assertDealOwner(db, req.params.dealId, accountId)
    if (!owned) return res.status(404).json({ error: 'Deal not found.' })

    const validPrefixes = [`${accountId}/${req.params.dealId}/`, `deals/${req.params.dealId}/`]
    if (!validPrefixes.some(p => storagePath.startsWith(p))) {
      return res.status(400).json({ error: 'storage_path does not match this deal.' })
    }

    const { data, error } = await db
      .from('deallink_documents')
      .insert({
        deal_id:   req.params.dealId,
        account_id: accountId,
        filename,
        path:      storagePath,
        size:      size      || null,
        mime_type: mime_type || null,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json({ document: data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/deallink/deals/:dealId/documents/:docId/download
router.get('/deals/:dealId/documents/:docId/download', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  try {
    const { data: doc, error: docErr } = await db
      .from('deallink_documents')
      .select('path')
      .eq('id', req.params.docId)
      .eq('deal_id', req.params.dealId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (docErr) return res.status(500).json({ error: docErr.message })
    if (!doc)   return res.status(404).json({ error: 'Document not found.' })

    const { data, error } = await db.storage
      .from(DOC_BUCKET)
      .createSignedUrl(doc.path, 300)   // 5-minute signed URL
    if (error) return res.status(500).json({ error: error.message })
    res.json({ url: data.signedUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/deallink/deals/:dealId/documents/:docId
router.delete('/deals/:dealId/documents/:docId', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  try {
    const { data: doc, error: docErr } = await db
      .from('deallink_documents')
      .select('path')
      .eq('id', req.params.docId)
      .eq('deal_id', req.params.dealId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (docErr) return res.status(500).json({ error: docErr.message })
    if (!doc)   return res.status(404).json({ error: 'Document not found.' })

    // Remove storage object first (non-fatal if missing).
    await db.storage.from(DOC_BUCKET).remove([doc.path])

    const { error: delErr } = await db
      .from('deallink_documents')
      .delete()
      .eq('id', req.params.docId)
      .eq('account_id', accountId)
    if (delErr) return res.status(500).json({ error: delErr.message })

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

router.get('/buyers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_buyers')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ buyers: data || [] })
})

// ─── OFFERS ───────────────────────────────────────────────────────────────

router.get('/offers', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })

  const { data, error } = await db
    .from('deallink_offers')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ offers: data || [] })
})

// ─── IM SHARE LINK ────────────────────────────────────────────────────────

router.post('/deals/:id/im/share', (req, res) => {
  res.json({ slug: `https://doorine.com/im/${req.params.id}` })
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
    .eq('marketplace_visible', true)
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

// ─── CONTENT SHARES ───────────────────────────────────────────────────────

router.post('/content-shares', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized.' })

  const { content_type, deal_id = null, platform } = req.body || {}

  const { error } = await db.from('deallink_content_shares').insert({
    user_id: req.user.id,
    content_type,
    deal_id: deal_id || null,
    platform,
  })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/content-shares', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized.' })

  const { data, error } = await db
    .from('deallink_content_shares')
    .select('*')
    .eq('user_id', req.user.id)
    .order('shared_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

module.exports = router
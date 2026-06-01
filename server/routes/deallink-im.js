// Investment Memorandum (IM) sharing flow for Deal Link.
// Mounted at /api/deallink/im in server/index.js — ALL endpoints are PUBLIC.
//
// Required Supabase tables (apply via Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS public.deallink_im_sessions (
//     id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     deal_id    UUID        NOT NULL,
//     phone      TEXT        NOT NULL,
//     name       TEXT,
//     otp_code   TEXT,
//     otp_sent_at TIMESTAMPTZ,
//     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//     UNIQUE (deal_id, phone)
//   );
//
//   CREATE TABLE IF NOT EXISTS public.deallink_buyers (
//     id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     account_id       UUID        NOT NULL,
//     name             TEXT,
//     phone            TEXT,
//     source_deal_id   UUID,
//     source           TEXT,
//     im_registered_at TIMESTAMPTZ,
//     expires_at       TIMESTAMPTZ,
//     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//     UNIQUE (account_id, phone)
//   );
//
//   CREATE TABLE IF NOT EXISTS public.deallink_offers (
//     id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     deal_id    UUID        NOT NULL,
//     buyer_id   UUID        NOT NULL,
//     account_id UUID        NOT NULL,
//     amount     NUMERIC,
//     notes      TEXT,
//     buyer_type TEXT,
//     status     TEXT        NOT NULL DEFAULT 'Pending',
//     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );

const express = require('express')
const router  = express.Router()
const { supabaseAdmin, supabaseAnon } = require('../middleware/auth')
const { createNotification, sendEmailNotification } = require('../services/notifications')

const PHONE_RE = /^\+1[2-9]\d{9}$/
const FREE_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

// ─── helpers ─────────────────────────────────────────────────────────────────

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// Fetch the account_products plan for a given account_id.
async function getAccountPlan(db, accountId) {
  const { data } = await db
    .from('account_products')
    .select('plan')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.plan || null
}

// ─── GET /api/deallink/im/:dealId ─────────────────────────────────────────────
// Returns a gated preview — address + key numbers only.
// Buyer must register via send-otp / verify-otp to see the full IM.

router.get('/:dealId', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { dealId } = req.params

  try {
    const { data: deal, error: dealErr } = await db
      .from('deallink_deals')
      .select('id, account_id, addr, city, zip, type, ask, arv, beds, baths, sqft, status, hide_street, photos')
      .eq('id', dealId)
      .maybeSingle()

    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

    const { data: profile } = await db
      .from('deallink_profiles')
      .select('handle, name, display_name, avatar_url')
      .eq('account_id', deal.account_id)
      .maybeSingle()

    const addr = deal.hide_street
      ? String(deal.addr || '').replace(/^\d+\s+/, '— ')
      : deal.addr

    res.json({
      gated: true,
      preview: {
        addr,
        city:   deal.city,
        zip:    deal.zip,
        type:   deal.type,
        ask:    deal.ask,
        arv:    deal.arv,
        beds:   deal.beds,
        baths:  deal.baths,
        sqft:   deal.sqft,
        status: deal.status,
        photos: deal.photos?.[0] ? [deal.photos[0]] : [],
        wholesaler: {
          handle:     profile?.handle     || null,
          name:       profile?.name || profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
        },
      },
    })
    // Fire-and-forget: notify the deal owner that a buyer viewed their deal.
    ;(async () => {
      try {
        if (!supabaseAdmin) return

        // Resolve owner id and email.
        const { data: owner } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .eq('account_id', deal.account_id)
          .eq('is_account_admin', true)
          .maybeSingle()

        if (!owner?.id) return

        // Rate-limit: skip if a buyer_viewed notification was sent in the last 24h.
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: recent } = await supabaseAdmin
          .from('deallink_notifications')
          .select('id')
          .eq('user_id', owner.id)
          .eq('type', 'buyer_viewed')
          .eq('metadata->>deal_id', dealId)
          .gte('created_at', oneDayAgo)
          .maybeSingle()

        if (recent) return

        const dealAddr = addr || 'Your deal'

        await createNotification(owner.id, {
          type: 'buyer_viewed',
          title: 'Someone viewed your deal',
          body: `${dealAddr} was just viewed`,
          metadata: { deal_id: dealId },
        })

        if (owner.email) {
          await sendEmailNotification(
            owner.email,
            'Your deal was just viewed — REI Flywheel',
            `<p>Good news — someone just viewed your deal.</p>
<p><strong>${dealAddr}</strong> was just viewed by a buyer on REI Flywheel.</p>
<p style="color:#999;font-size:12px">— The REI Flywheel team</p>`
          )
        }
      } catch (notifyErr) {
        console.error('[deallink-im/get] Notification error:', notifyErr.message)
      }
    })()
  } catch (e) {
    console.error('[deallink-im/get] Error:', e.message)
    res.status(500).json({ error: 'Failed to load deal.' })
  }
})

// ─── POST /api/deallink/im/:dealId/send-otp ───────────────────────────────────

router.post('/:dealId/send-otp', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  if (!supabaseAnon) return res.status(503).json({ error: 'Supabase anon client not configured.' })
  const { dealId } = req.params
  const { first_name, last_name, phone: rawPhone } = req.body
  const digits = (rawPhone || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? '+1' + digits
    : digits.length === 11 && digits.startsWith('1') ? '+' + digits
    : (rawPhone || '')
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Valid US phone number required (+1XXXXXXXXXX).' })
  }
  if (!first_name || !String(first_name).trim()) {
    return res.status(400).json({ error: 'first_name is required.' })
  }

  try {
    // Confirm the deal exists.
    const { data: deal, error: dealErr } = await db
      .from('deallink_deals')
      .select('id')
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

    const fullName = [(first_name || '').trim(), (last_name || '').trim()].filter(Boolean).join(' ')

    // Store name + phone so verify-otp can use it for buyer creation.
    const { error: upsertErr } = await db
      .from('deallink_im_sessions')
      .upsert(
        { deal_id: dealId, phone, name: fullName, first_name: (first_name || '').trim(), last_name: (last_name || '').trim() },
        { onConflict: 'deal_id,phone' }
      )
    if (upsertErr) {
      console.error('[deallink-im/send-otp] Session upsert error:', upsertErr.message)
      return res.status(500).json({ error: 'Failed to create session.' })
    }

    // Delegate OTP delivery to Supabase phone auth.
    const { error } = await supabaseAnon.auth.signInWithOtp({ phone })
    if (error) return res.status(400).json({ error: error.message })

    res.json({ ok: true })
  } catch (e) {
    console.error('[deallink-im/send-otp] Error:', e.message)
    res.status(500).json({ error: 'Failed to send verification code.' })
  }
})

// ─── POST /api/deallink/im/:dealId/verify-otp ────────────────────────────────

router.post('/:dealId/verify-otp', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  if (!supabaseAnon) return res.status(503).json({ error: 'Supabase anon client not configured.' })
  const { dealId } = req.params
  const { phone, code } = req.body

  if (!phone || !code) {
    return res.status(400).json({ error: 'phone and code are required.' })
  }

  try {
    // Verify OTP via Supabase phone auth — returns a real session on success.
    const { data, error: otpErr } = await supabaseAnon.auth.verifyOtp({ phone, token: code, type: 'sms' })
    if (otpErr) return res.status(401).json({ error: 'Invalid or expired code.' })
    const supabaseSession = data.session
    const supabaseUser    = data.user

    // Retrieve stored name from the im_sessions record created at send-otp.
    const { data: imSession, error: sessErr } = await db
      .from('deallink_im_sessions')
      .select('name, first_name, last_name')
      .eq('deal_id', dealId)
      .eq('phone', phone)
      .maybeSingle()
    if (sessErr) return res.status(500).json({ error: sessErr.message })
    const buyerFirstName = (imSession?.first_name || '').trim()
    const buyerLastName  = (imSession?.last_name  || '').trim()
    const buyerName      = [buyerFirstName, buyerLastName].filter(Boolean).join(' ').trim() || imSession?.name || null

    // Fetch full deal including im_config.
    const { data: deal, error: dealErr } = await db
      .from('deallink_deals')
      .select('*')
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

    // Fetch wholesaler profile.
    const { data: profile } = await db
      .from('deallink_profiles')
      .select('name, handle, phone')
      .eq('account_id', deal.account_id)
      .maybeSingle()

    // Get wholesaler plan.
    const plan = await getAccountPlan(db, deal.account_id)
    const isFree = plan === 'free'
    const expiresAt = isFree ? new Date(Date.now() + FREE_TTL_MS).toISOString() : null
    const now = new Date().toISOString()

    // Check for an existing buyer with this phone number (any account) before
    // creating a new record — prevents cross-wholesaler duplicates.
    const { data: existingBuyer } = await db
      .from('deallink_buyers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    let buyer = existingBuyer

    if (!existingBuyer) {
      // No existing buyer — upsert within this wholesaler's account.
      const { data: upsertedBuyer, error: buyerErr } = await db
        .from('deallink_buyers')
        .upsert(
          {
            account_id:       deal.account_id,
            phone,
            first_name:       buyerFirstName,
            last_name:        buyerLastName,
            name:             buyerName,
            source_deal_id:   dealId,
            source:           'im-link',
            im_registered_at: now,
            expires_at:       expiresAt,
          },
          { onConflict: 'account_id,phone' }
        )
        .select('id')
        .maybeSingle()

      if (buyerErr) {
        console.error('[deallink-im/verify-otp] Buyer upsert error:', buyerErr.message)
        return res.status(500).json({ error: 'Failed to register buyer.' })
      }

      buyer = upsertedBuyer
    }

    // ── Provision a Deal Link free account for the buyer (if not already set up) ──
    if (supabaseUser?.id) {
      const { data: existingProfile } = await db
        .from('user_profiles')
        .select('id')
        .eq('id', supabaseUser.id)
        .maybeSingle()

      if (!existingProfile) {
        const newAccountId = crypto.randomUUID()

        // 1. Account row.
        const { error: acctErr } = await db
          .from('accounts')
          .insert({ id: newAccountId, name: buyerName || phone, status: 'active' })
        if (acctErr) throw acctErr

        // 2. Resolve the deallink product id.
        const { data: product, error: productErr } = await db
          .from('products')
          .select('id')
          .eq('code', 'deallink')
          .single()
        if (productErr) throw productErr

        // 3. Entitlement row.
        const { error: apErr } = await db
          .from('account_products')
          .insert({ account_id: newAccountId, product_id: product.id, plan: 'free', status: 'active' })
        if (apErr) throw apErr

        // 4. User profile row.
        const { error: profileErr } = await db
          .from('user_profiles')
          .insert({ id: supabaseUser.id, phone, full_name: buyerName, first_name: buyerFirstName, last_name: buyerLastName, account_id: newAccountId, status: 'active', is_account_admin: true })
        if (profileErr) throw profileErr

        // 5. Update the buyer's account_id to their own new account.
        if (buyer?.id) {
          await db.from('deallink_buyers').update({ account_id: newAccountId }).eq('id', buyer.id)
        }

        console.log(`[deallink-im/verify-otp] Buyer account provisioned: user=${supabaseUser.id} account=${newAccountId}`)
      } else {
        console.log(`[deallink-im/verify-otp] Existing profile found for user=${supabaseUser.id} — skipping provisioning`)
      }
    }

    // Build the deal response filtered by im_config.
    const imConfig = deal.im_config || {}
    const dealOut = {
      id:          deal.id,
      addr:        deal.addr,
      city:        deal.city,
      zip:         deal.zip,
      type:        deal.type,
      units:       deal.units,
      beds:        deal.beds,
      baths:       deal.baths,
      sqft:        deal.sqft,
      ask:         deal.ask,
      arv:         deal.arv,
      occ:         deal.occ,
      access:      deal.access,
      status:      deal.status,
      notes:       deal.notes,
      is_new:      deal.is_new,
      created_at:  deal.created_at,
    }

    dealOut.photos = deal.photos || []
    if (imConfig.show_analyzer) dealOut.analyzerState = deal.analyzer_state || null
    if (imConfig.show_rehab)    dealOut.rehabItems    = deal.rehab_items    || []

    res.json({
      session: supabaseSession
        ? { access_token: supabaseSession.access_token, refresh_token: supabaseSession.refresh_token }
        : null,
      buyer_id:   buyer?.id || null,
      deal:       dealOut,
      wholesaler: {
        name:   profile?.name   || null,
        handle: profile?.handle || null,
        phone:  profile?.phone  || null,
      },
    })
  } catch (e) {
    console.error('[deallink-im/verify-otp] Error:', e.message)
    res.status(500).json({ error: 'Failed to verify code.' })
  }
})

// ─── POST /api/deallink/im/:dealId/offer ─────────────────────────────────────

router.post('/:dealId/offer', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { dealId } = req.params
  const { buyer_id, amount, notes, buyer_type } = req.body

  try {
    // Fetch deal to get account_id and address.
    const { data: deal, error: dealErr } = await db
      .from('deallink_deals')
      .select('id, account_id, addr')
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

    // Insert offer.
    const { data: offer, error: offerErr } = await db
      .from('deallink_offers')
      .insert({
        deal_id:    dealId,
        buyer_id:   buyer_id || null,
        account_id: deal.account_id,
        amount:     amount || null,
        notes:      notes  || null,
        buyer_type: buyer_type || null,
        status:     'Pending',
      })
      .select('id')
      .single()

    if (offerErr) {
      console.error('[deallink-im/offer] Insert error:', offerErr.message)
      return res.status(500).json({ error: 'Failed to submit offer.' })
    }

    // Update buyer expires_at based on wholesaler plan.
    const plan   = await getAccountPlan(db, deal.account_id)
    const isFree = plan === 'free'
    const expiresAt = isFree ? new Date(Date.now() + FREE_TTL_MS).toISOString() : null

    await db
      .from('deallink_buyers')
      .update({ expires_at: expiresAt })
      .eq('id', buyer_id)

    res.json({ ok: true, offer_id: offer.id })

    // Fire-and-forget: notify the deal owner that an offer was received.
    ;(async () => {
      try {
        if (!supabaseAdmin) return

        const { data: owner } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .eq('account_id', deal.account_id)
          .eq('is_account_admin', true)
          .maybeSingle()

        if (!owner?.id || !owner?.email) return

        const dealAddr = deal.addr || 'your deal'
        const offerAmount = amount ? `$${Number(amount).toLocaleString()}` : 'an undisclosed amount'
        const adminUrl = `${process.env.VITE_DEALLINK_URL || 'https://reiflywheel.doorine.com'}/admin`

        await createNotification(
          owner.id,
          'offer_received',
          'New offer received',
          `You received a ${offerAmount} offer on ${dealAddr}`,
          { deal_id: dealId, offer_amount: amount || null, offer_id: offer.id }
        )

        await sendEmailNotification(
          owner.email,
          'New offer on your deal — REI Flywheel',
          `<p>Hi,</p>
<p>You received a new offer on <strong>${dealAddr}</strong>.</p>
<ul>
  <li><strong>Offer amount:</strong> ${offerAmount}</li>
  <li><strong>Deal:</strong> ${dealAddr}</li>
</ul>
<p><a href="${adminUrl}">View the offer in REI Flywheel</a></p>
<p>— The REI Flywheel team</p>`
        )
      } catch (notifyErr) {
        console.error('[deallink-im/offer_received] Notification error:', notifyErr.message)
      }
    })()
  } catch (e) {
    console.error('[deallink-im/offer] Error:', e.message)
    res.status(500).json({ error: 'Failed to submit offer.' })
  }
})

module.exports = router

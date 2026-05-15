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
const { supabaseAdmin } = require('../middleware/auth')

const PHONE_RE = /^\+1[2-9]\d{9}$/
const OTP_TTL_MS = 10 * 60 * 1000   // 10 minutes
const FREE_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

// ─── Twilio ───────────────────────────────────────────────────────────────────
// Lazy-init so the server still boots when TWILIO_* vars are absent.

let twilioClient = null
function getTwilio() {
  if (twilioClient) return twilioClient
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (sid && token) {
    twilioClient = require('twilio')(sid, token)
  }
  return twilioClient
}

async function sendOtpSms(phone, code) {
  const client = getTwilio()
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (client && messagingServiceSid) {
    await client.messages.create({
      body:              `Your DealLink verification code is: ${code}`,
      messagingServiceSid,
      to:                phone,
    })
  } else {
    // Fallback for dev/unconfigured environments — log instead of send.
    console.log(`[deallink-im/otp] SMS not sent (Twilio unconfigured). Code for ${phone}: ${code}`)
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
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
      .select('id, account_id, addr, city, zip, type, ask, arv, beds, baths, sqft, status, hide_street')
      .eq('id', dealId)
      .maybeSingle()

    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

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
      },
    })
  } catch (e) {
    console.error('[deallink-im/get] Error:', e.message)
    res.status(500).json({ error: 'Failed to load deal.' })
  }
})

// ─── POST /api/deallink/im/:dealId/send-otp ───────────────────────────────────

router.post('/:dealId/send-otp', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { dealId } = req.params
  const { name, phone: rawPhone } = req.body
  const digits = (rawPhone || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? '+1' + digits
    : digits.length === 11 && digits.startsWith('1') ? '+' + digits
    : (rawPhone || '')
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Valid US phone number required (+1XXXXXXXXXX).' })
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required.' })
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

    const code = randomOtp()
    const now  = new Date().toISOString()

    const { error: upsertErr } = await db
      .from('deallink_im_sessions')
      .upsert(
        { deal_id: dealId, phone, name: String(name).trim(), otp_code: code, otp_sent_at: now },
        { onConflict: 'deal_id,phone' }
      )
    if (upsertErr) {
      console.error('[deallink-im/send-otp] Session upsert error:', upsertErr.message)
      return res.status(500).json({ error: 'Failed to create session.' })
    }

    await sendOtpSms(phone, code)

    res.json({ ok: true })
  } catch (e) {
    console.error('[deallink-im/send-otp] Error:', e.message)
    res.status(500).json({ error: 'Failed to send verification code.' })
  }
})

// ─── POST /api/deallink/im/:dealId/verify-otp ────────────────────────────────

router.post('/:dealId/verify-otp', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { dealId } = req.params
  const { phone, code } = req.body

  if (!phone || !code) {
    return res.status(400).json({ error: 'phone and code are required.' })
  }

  try {
    // Validate session.
    const { data: session, error: sessErr } = await db
      .from('deallink_im_sessions')
      .select('name, otp_code, otp_sent_at')
      .eq('deal_id', dealId)
      .eq('phone', phone)
      .maybeSingle()

    if (sessErr) return res.status(500).json({ error: sessErr.message })
    if (!session) return res.status(404).json({ error: 'Session not found. Please request a new code.' })

    if (session.otp_code !== String(code).trim()) {
      return res.status(401).json({ error: 'Incorrect verification code.' })
    }
    const age = Date.now() - new Date(session.otp_sent_at).getTime()
    if (age > OTP_TTL_MS) {
      return res.status(410).json({ error: 'Verification code has expired. Please request a new one.' })
    }

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

    // Upsert buyer record.
    const { data: buyer, error: buyerErr } = await db
      .from('deallink_buyers')
      .upsert(
        {
          account_id:       deal.account_id,
          phone,
          name:             session.name,
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

  if (!buyer_id) {
    return res.status(400).json({ error: 'buyer_id is required.' })
  }

  try {
    // Fetch deal to get account_id.
    const { data: deal, error: dealErr } = await db
      .from('deallink_deals')
      .select('id, account_id')
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) return res.status(500).json({ error: dealErr.message })
    if (!deal)   return res.status(404).json({ error: 'Deal not found.' })

    // Insert offer.
    const { data: offer, error: offerErr } = await db
      .from('deallink_offers')
      .insert({
        deal_id:    dealId,
        buyer_id,
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
  } catch (e) {
    console.error('[deallink-im/offer] Error:', e.message)
    res.status(500).json({ error: 'Failed to submit offer.' })
  }
})

module.exports = router

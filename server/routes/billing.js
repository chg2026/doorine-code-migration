// Stripe billing routes
// Mounted at /api/billing in server/index.js.
//
// IMPORTANT — webhook body parsing:
//   The POST /webhook handler requires the raw request body so Stripe can
//   verify the signature. index.js mounts express.raw() for that path
//   BEFORE the global express.json() middleware. Do not add express.json()
//   to this router — it would break the webhook.
//
//   POST /checkout and POST /portal receive normal JSON bodies because the
//   global express.json() runs for those paths as usual.

const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null

// Per-product canonical domains for Stripe redirect URLs.
const PRODUCT_DOMAINS = {
  'chg':                'https://chg.doorine.com',
  'deallink':           'https://reiflywheel.doorine.com',
  'contractor-portal':  'https://contractorportal.neuroaios.ai',
}

// Map product_code → plan → Stripe price ID (from env vars)
const PRICE_MAP = {
  chg: {
    personal: process.env.STRIPE_PRICE_CHG_PERSONAL,
    team:     process.env.STRIPE_PRICE_CHG_TEAM,
  },
  deallink: {
    personal: process.env.STRIPE_PRICE_DEALLINK_PERSONAL,
    team:     process.env.STRIPE_PRICE_DEALLINK_TEAM,
  },
  'contractor-portal': {
    personal: process.env.STRIPE_PRICE_CONTRACTOR_PERSONAL,
    team:     process.env.STRIPE_PRICE_CONTRACTOR_TEAM,
  },
}

function stripeOrFail(res) {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe is not configured on this server.' })
    return null
  }
  return stripe
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function planLimits(plan) {
  return plan === 'team'
    ? { seat_limit: 5, guest_limit: 5 }
    : { seat_limit: 0, guest_limit: 2 }
}

function appDomain() {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  if (base) return base
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim()
  return dev ? `https://${dev}` : 'http://localhost:8080'
}

async function getProductId(productCode) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('code', productCode)
    .single()
  if (error || !data) throw new Error(`Product '${productCode}' not found`)
  return data.id
}

async function updateEntitlementBySubscription(subscriptionId, plan) {
  // stripe_subscription_id lives on accounts, not account_products.
  // Step 1: resolve account_id from accounts.
  const { data: acct, error: acctErr } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  if (acctErr) throw acctErr
  if (!acct) {
    console.warn(`[billing/webhook] updateEntitlementBySubscription: no account found for sub=${subscriptionId}`)
    return
  }
  // Step 2: update account_products by account_id.
  const { seat_limit, guest_limit } = planLimits(plan)
  const { error } = await supabaseAdmin
    .from('account_products')
    .update({ plan, seat_limit, guest_limit, status: 'active' })
    .eq('account_id', acct.id)
    .eq('status', 'active')
  if (error) throw error
}

// ─── POST /api/billing/checkout ───────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req, res) => {
  const s = stripeOrFail(res); if (!s) return

  try {
    const { product_code, plan } = req.body

    if (!product_code || !plan) {
      return res.status(400).json({ error: 'product_code and plan are required.' })
    }
    if (!['personal', 'team'].includes(plan)) {
      return res.status(400).json({ error: "plan must be 'personal' or 'team'." })
    }

    const priceId = PRICE_MAP[product_code]?.[plan]
    if (!priceId) {
      return res.status(400).json({ error: `No Stripe price configured for ${product_code}/${plan}.` })
    }

    const accountId = req.user.account_id

    // Load the account row — include stripe_subscription_id so we can
    // upgrade an existing subscription instead of opening a new checkout.
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, billing_email, stripe_customer_id, stripe_subscription_id')
      .eq('id', accountId)
      .single()
    if (accountError || !account) {
      return res.status(500).json({ error: 'Failed to load account.' })
    }

    // ── Upgrade path: existing subscription → swap price immediately ─────────
    if (account.stripe_subscription_id) {
      try {
        const subscription = await s.subscriptions.retrieve(account.stripe_subscription_id)
        await s.subscriptions.update(subscription.id, {
          items: [{ id: subscription.items.data[0].id, price: priceId }],
          proration_behavior: 'always_invoice',
          metadata: { account_id: accountId, product_code, plan },
        })

        // Mirror the plan change in Supabase immediately (the
        // customer.subscription.updated webhook will also fire, but updating
        // here ensures instant consistency).
        const { seat_limit, guest_limit } = planLimits(plan)
        await supabaseAdmin
          .from('account_products')
          .update({ plan, seat_limit, guest_limit })
          .eq('account_id', accountId)
          .eq('status', 'active')

        return res.json({ upgraded: true, url: null })
      } catch (upgradeErr) {
        // Subscription retrieval/update failed (e.g. cancelled/deleted in
        // Stripe) — fall through to create a fresh checkout session.
        console.warn('[billing/checkout] Subscription upgrade failed, falling back to checkout:', upgradeErr.message)
      }
    }

    // ── New-subscription path ─────────────────────────────────────────────────
    // Get or create Stripe customer — one customer per account.
    let customerId = account.stripe_customer_id
    if (!customerId) {
      const customer = await s.customers.create({
        email: account.billing_email || req.user.email,
        name:  account.name,
        metadata: { account_id: accountId },
      })
      customerId = customer.id
      await supabaseAdmin
        .from('accounts')
        .update({ stripe_customer_id: customerId })
        .eq('id', accountId)
    }

    const domain = PRODUCT_DOMAINS[product_code]
      || req.body.success_url?.split('/billing')[0]
      || 'https://chg.doorine.com'

    const session = await s.checkout.sessions.create({
      customer:      customerId,
      mode:          'subscription',
      line_items:    [{ price: priceId, quantity: 1 }],
      success_url:   `${domain}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:    `${domain}/billing`,
      // session metadata — readable in checkout.session.completed
      metadata: { account_id: accountId, product_code, plan },
      // subscription_data.metadata — inherited by the subscription object so
      // customer.subscription.updated events also carry the plan.
      subscription_data: {
        metadata: { account_id: accountId, product_code, plan },
      },
    })

    res.json({ url: session.url })
  } catch (e) {
    console.error('[billing/checkout] Error:', e.message)
    res.status(500).json({ error: 'Failed to create checkout session.' })
  }
})

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// Public — no requireAuth.
// Raw body is provided by the express.raw() middleware mounted in index.js
// BEFORE express.json(), keyed to this exact path.

router.post('/webhook', async (req, res) => {
  const s = stripeOrFail(res); if (!s) return

  const sig           = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET is not set')
    return res.status(500).json({ error: 'Webhook secret not configured.' })
  }

  let event
  try {
    event = s.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (e) {
    console.error('[billing/webhook] Signature verification failed:', e.message)
    return res.status(400).json({ error: `Webhook error: ${e.message}` })
  }

  // Return 200 immediately — Stripe retries on non-2xx; handler errors are
  // logged but must not cause a retry storm.
  res.json({ received: true })

  try {
    if (event.type === 'checkout.session.completed') {
      const session  = event.data.object
      const metadata = session.metadata || {}
      console.log('[billing/webhook] checkout.session.completed metadata:', JSON.stringify(metadata))

      const { account_id, product_code, plan } = metadata

      if (account_id && product_code && plan) {
        console.log(`[billing/webhook] updating account_products for account_id=${account_id} plan=${plan}`)

        const { seat_limit, guest_limit } = planLimits(plan)

        // Query 1 — account_products: plan + limits only (no stripe IDs).
        const apPayload = { plan, seat_limit, guest_limit }
        console.log('[billing/webhook] account_products payload:', JSON.stringify(apPayload))

        const { data: prodRow } = await supabaseAdmin
          .from('products')
          .select('id')
          .eq('code', product_code)
          .maybeSingle()
        const { data: apData, error: apError } = await supabaseAdmin
          .from('account_products')
          .upsert({
            account_id: account_id,
            product_id: prodRow?.id,
            ...apPayload,
            status: 'active',
            started_at: new Date().toISOString(),
          }, { onConflict: 'account_id,product_id' })
          .select()

        console.log('[billing/webhook] account_products result — data:', JSON.stringify(apData), 'error:', apError?.message ?? null)
        if (apError) throw apError

        // Query 2 — accounts: stripe subscription + customer IDs.
        const acctPayload = {
          stripe_subscription_id: session.subscription || null,
          stripe_customer_id:     session.customer     || null,
        }
        console.log('[billing/webhook] accounts payload:', JSON.stringify(acctPayload))

        const { data: acctData, error: acctError } = await supabaseAdmin
          .from('accounts')
          .update(acctPayload)
          .eq('id', account_id)
          .select()

        console.log('[billing/webhook] accounts result — data:', JSON.stringify(acctData), 'error:', acctError?.message ?? null)
        if (acctError) throw acctError

        console.log(`[billing/webhook] checkout.session.completed done: account=${account_id} product=${product_code} plan=${plan} ap_rows=${apData?.length ?? 0} acct_rows=${acctData?.length ?? 0}`)
      } else {
        console.warn('[billing/webhook] checkout.session.completed missing metadata fields — skipping update:', JSON.stringify(metadata))
      }

    } else if (event.type === 'customer.subscription.updated') {
      const sub  = event.data.object
      const plan = sub.metadata?.plan || 'personal'
      await updateEntitlementBySubscription(sub.id, plan)
      console.log(`[billing/webhook] customer.subscription.updated: sub=${sub.id} plan=${plan}`)

    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      // stripe_subscription_id lives on accounts — resolve account_id first.
      const { data: acct, error: acctErr } = await supabaseAdmin
        .from('accounts')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .maybeSingle()
      if (acctErr) throw acctErr
      if (!acct) {
        console.warn(`[billing/webhook] customer.subscription.deleted: no account found for sub=${sub.id}`)
      } else {
        const { seat_limit, guest_limit } = planLimits('personal')
        const { error } = await supabaseAdmin
          .from('account_products')
          .update({ plan: 'personal', seat_limit, guest_limit, status: 'active' })
          .eq('account_id', acct.id)
          .eq('status', 'active')
        if (error) throw error
        console.log(`[billing/webhook] customer.subscription.deleted: sub=${sub.id} account=${acct.id} — downgraded to personal`)
      }
    }
  } catch (e) {
    console.error(`[billing/webhook] Handler error for ${event.type}:`, e.message)
  }
})

// ─── POST /api/billing/portal ─────────────────────────────────────────────────

router.post('/portal', requireAuth, async (req, res) => {
  const s = stripeOrFail(res); if (!s) return

  try {
    const accountId = req.user.account_id

    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('stripe_customer_id')
      .eq('id', accountId)
      .single()
    if (accountError || !account) {
      return res.status(500).json({ error: 'Failed to load account.' })
    }

    if (!account.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.' })
    }

    const portalSession = await s.billingPortal.sessions.create({
      customer:   account.stripe_customer_id,
      return_url: `${appDomain()}/billing`,
    })

    res.json({ url: portalSession.url })
  } catch (e) {
    console.error('[billing/portal] Error:', e.message)
    res.status(500).json({ error: 'Failed to create billing portal session.' })
  }
})

module.exports = router

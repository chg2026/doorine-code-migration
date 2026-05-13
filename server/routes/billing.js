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
  const { seat_limit, guest_limit } = planLimits(plan)
  const { error } = await supabaseAdmin
    .from('account_products')
    .update({ plan, seat_limit, guest_limit, status: 'active' })
    .eq('stripe_subscription_id', subscriptionId)
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

    // Load the account row for billing_email and any existing stripe_customer_id.
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, billing_email, stripe_customer_id')
      .eq('id', accountId)
      .single()
    if (accountError || !account) {
      return res.status(500).json({ error: 'Failed to load account.' })
    }

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

    const domain = appDomain()

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
      const session = event.data.object
      const { account_id, product_code, plan } = session.metadata || {}

      if (account_id && product_code && plan) {
        const productId              = await getProductId(product_code)
        const { seat_limit, guest_limit } = planLimits(plan)
        const { error } = await supabaseAdmin
          .from('account_products')
          .update({
            plan,
            seat_limit,
            guest_limit,
            stripe_subscription_id: session.subscription || null,
            status: 'active',
          })
          .eq('account_id', accountId)
          .eq('product_id', productId)
        if (error) throw error
        console.log(`[billing/webhook] checkout.session.completed: account=${account_id} product=${product_code} plan=${plan}`)
      }

    } else if (event.type === 'customer.subscription.updated') {
      const sub  = event.data.object
      const plan = sub.metadata?.plan || 'personal'
      await updateEntitlementBySubscription(sub.id, plan)
      console.log(`[billing/webhook] customer.subscription.updated: sub=${sub.id} plan=${plan}`)

    } else if (event.type === 'customer.subscription.deleted') {
      const sub                         = event.data.object
      const { seat_limit, guest_limit } = planLimits('personal')
      const { error } = await supabaseAdmin
        .from('account_products')
        .update({ plan: 'personal', seat_limit, guest_limit, status: 'active' })
        .eq('stripe_subscription_id', sub.id)
      if (error) throw error
      console.log(`[billing/webhook] customer.subscription.deleted: sub=${sub.id} — downgraded to personal`)
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

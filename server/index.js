const express = require('express')
const cors = require('cors')
const cron = require('node-cron')
const { createNotification, sendEmailNotification } = require('./services/notifications')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 8080

const ALLOWED_ORIGINS = [
  'https://chg.doorine.com',
  'https://deallink.neuroaios.ai',
  'https://investorportal.neuroaios.ai',
  'https://contractorportal.neuroaios.ai',
  'https://reiflywheel.doorine.com',
  'https://chg.doorine.com',
  'https://investor.doorine.com',
  'https://contractor.doorine.com',
  'https://doorine.com',
]
const DEV_ORIGIN_RE = /^https:\/\/[a-zA-Z0-9-]+\.(replit\.dev|replit\.app)$/

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl, Stripe webhooks).
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN_RE.test(origin)) {
      return callback(null, true)
    }
    callback(new Error(`CORS: origin not allowed — ${origin}`))
  },
  credentials:     true,
  allowedHeaders:  ['Content-Type', 'Authorization'],
  methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// Stripe webhook requires the raw request body for signature verification.
// Register express.raw() for ONLY that path before the global express.json()
// middleware so the body stream isn't consumed and reparsed as JSON first.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))

app.use(express.json())

const { requireAuth } = require('./middleware/auth')
const { requireDepartment, requireProduct, scopeToAccount } = require('./middleware/permissions')

// Unauthenticated / cross-product routes — NOT wrapped with requireProduct.
//   /api/auth    — signup (no auth) + /auth/me (powers App Switcher, needs all entitlements)
//   /api/admin   — super-admin console; manages entitlements themselves
//   /api/users   — self-service profile; every authenticated user needs it regardless of product
app.use('/api/auth', require('./routes/auth'))
app.use('/api/billing', require('./routes/billing'))
app.use('/api/team', require('./routes/team'))
app.get('/api/health', (req, res) => {
  res.json({ status: 'Gold Bridge API is running', version: '2.0.0', timestamp: new Date().toISOString() })
})

app.use('/api/admin', requireAuth, require('./routes/admin'))
app.use('/api/users', requireAuth, require('./routes/users'))

// CHG product-scoped routes. requireProduct('chg') gates at the product boundary;
// requireDepartment then checks the role's permission level for the specific area.
// Super admins bypass both. Phase 5 will add parallel /api/deallink/* mounts.
const chgProduct = requireProduct('chg')

// Deal Link product routes. Public read path is unauthenticated and lives
// at /api/deallink/public — mount it BEFORE the authenticated /api/deallink
// router so requireAuth doesn't hijack the unauthenticated profile lookup.
const deallinkProduct = requireProduct('deallink')
app.use('/api/deallink/public', require('./routes/deallink-public'))
app.use('/api/deallink/im', require('./routes/deallink-im'))
app.use('/api/deallink/notifications', requireAuth, require('./routes/deallink-notifications'))
app.use('/api/deallink', requireAuth, deallinkProduct, scopeToAccount, require('./routes/deallink'))

app.use('/api/dashboard', requireAuth, chgProduct, require('./routes/dashboard'))
app.use('/api/properties', requireAuth, chgProduct, scopeToAccount, requireDepartment('property_management'), require('./routes/properties'))
app.use('/api/units', requireAuth, chgProduct, scopeToAccount, requireDepartment('property_management'), require('./routes/units'))
app.use('/api/contractors', requireAuth, chgProduct, scopeToAccount, requireDepartment('contractors'), require('./routes/contractors'))
app.use('/api/projects', requireAuth, chgProduct, scopeToAccount, requireDepartment('construction'), require('./routes/projects'))
app.use('/api/master-phases', requireAuth, chgProduct, scopeToAccount, requireDepartment('construction'), require('./routes/master-phases'))
app.use('/api/addendums', requireAuth, chgProduct, scopeToAccount, requireDepartment('construction'), require('./routes/addendums'))
app.use('/api/tenants', requireAuth, chgProduct, scopeToAccount, requireDepartment('property_management'), require('./routes/tenants'))
app.use('/api/deals', requireAuth, chgProduct, scopeToAccount, requireDepartment('acquisitions'), require('./routes/deals'))
app.use('/api/tasks', requireAuth, chgProduct, scopeToAccount, requireDepartment('tasks'), require('./routes/tasks'))
app.use('/api/invoices', requireAuth, chgProduct, scopeToAccount, requireDepartment('finance'), require('./routes/invoices'))

app.get('/', (req, res) => {
  res.json({ status: 'Gold Bridge API is running', version: '2.0.0', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gold Bridge API server running on port ${PORT}`)
})

// Daily SMS nudge for phone-only users who haven't added their email.
// Runs at 10:00 AM UTC. Sends nudges at day 3, 7, and 14 after signup.
// TODO: replace console.log with Twilio REST call once Twilio is configured.
//   Message: "Complete your Gold Bridge profile — add your email to unlock
//   reports and deal tools: [your-app-url]/settings/profile"
//   Use env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID
cron.schedule('0 10 * * *', async () => {
  const { supabaseAdmin } = require('./middleware/auth')
  if (!supabaseAdmin) return

  const now = new Date()
  const targets = [3, 7, 14]

  for (const daysAgo of targets) {
    const start = new Date(now)
    start.setDate(start.getDate() - daysAgo)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)

    const { data: users } = await supabaseAdmin
      .from('user_profiles')
      .select('id, phone')
      .is('email', null)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())

    if (!users?.length) continue

    for (const user of users) {
      if (!user.phone) continue
      console.log(`[nudge-cron] Would SMS ${user.phone} at day ${daysAgo}`)
    }
  }
})

// Daily contract deadline alert — runs at 8:00 AM UTC.
// Notifies deal owners when a deal under contract has 48 or 24 hours to go.
cron.schedule('0 8 * * *', async () => {
  try {
    const { supabaseAdmin } = require('./middleware/auth')
    if (!supabaseAdmin) return

    // Build date strings for tomorrow (+1 day) and day-after-tomorrow (+2 days).
    const pad = n => String(n).padStart(2, '0')
    const toDateStr = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

    const now = new Date()
    const d1 = new Date(now); d1.setUTCDate(d1.getUTCDate() + 1)
    const d2 = new Date(now); d2.setUTCDate(d2.getUTCDate() + 2)
    const tomorrow  = toDateStr(d1)  // 24-hour threshold
    const dayAfter  = toDateStr(d2)  // 48-hour threshold

    const { data: deals, error } = await supabaseAdmin
      .from('deallink_deals')
      .select('id, account_id, addr, contract_date')
      .eq('status', 'Under Contract')
      .in('contract_date', [tomorrow, dayAfter])

    if (error) {
      console.error('[contract-deadline-cron] Query error:', error.message)
      return
    }

    if (!deals?.length) return

    for (const deal of deals) {
      try {
        const hoursLabel = deal.contract_date === tomorrow ? '24' : '48'
        const dealAddr   = deal.addr || 'Your deal'

        const { data: owner } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .eq('account_id', deal.account_id)
          .eq('is_account_admin', true)
          .maybeSingle()

        if (!owner?.id || !owner?.email) continue

        await createNotification(
          owner.id,
          'contract_deadline',
          'Contract deadline approaching',
          `${dealAddr} — contract deadline in ${hoursLabel} hours`,
          { deal_id: deal.id }
        )

        await sendEmailNotification(
          owner.email,
          'Contract deadline alert — REI Flywheel',
          `<p>Hi,</p>
<p>Your deal at <strong>${dealAddr}</strong> has a contract deadline in <strong>${hoursLabel} hours</strong>.</p>
<p><a href="${process.env.VITE_DEALLINK_URL || 'https://reiflywheel.doorine.com'}/admin">View the deal in REI Flywheel</a></p>
<p>— The REI Flywheel team</p>`
        )

        console.log(`[contract-deadline-cron] Notified owner for deal ${deal.id} (${hoursLabel}h)`)
      } catch (dealErr) {
        console.error(`[contract-deadline-cron] Error on deal ${deal.id}:`, dealErr.message)
      }
    }
  } catch (err) {
    console.error('[contract-deadline-cron] Fatal error:', err.message)
  }
})

module.exports = app

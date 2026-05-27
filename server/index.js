const express = require('express')
const cors = require('cors')
const cron = require('node-cron')
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

module.exports = app

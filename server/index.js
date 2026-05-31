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
app.use('/api/deallink/dashboard', requireAuth, require('./routes/deallink-dashboard'))
app.use('/api/deallink/alerts', requireAuth, require('./routes/deallink-alerts'))
app.use('/api/deallink/referrals', requireAuth, require('./routes/deallink-referrals'))
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

// Weekly deal activity digest — runs every Monday at 8:00 AM UTC.
// Sends one email per active REI Flywheel user summarising the week's stats
// and resets profile_views_this_week → profile_views_last_week.
cron.schedule('0 8 * * 1', async () => {
  try {
    const { supabaseAdmin } = require('./middleware/auth')
    if (!supabaseAdmin) return

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const appUrl = process.env.VITE_DEALLINK_URL || 'https://reiflywheel.doorine.com'

    // Fetch all active REI Flywheel users — anyone with a deallink_profiles row.
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from('deallink_profiles')
      .select('account_id, handle')

    if (profilesErr) {
      console.error('[weekly-digest-cron] Failed to fetch profiles:', profilesErr.message)
      return
    }
    if (!profiles?.length) return

    for (const profile of profiles) {
      try {
        const accountId = profile.account_id

        // Resolve account admin (user_id + email).
        const { data: admin } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .eq('account_id', accountId)
          .eq('is_account_admin', true)
          .maybeSingle()

        if (!admin?.id || !admin?.email) continue

        // Gather stats in parallel.
        const [statsRes, buyersRes, dealsRes] = await Promise.all([
          supabaseAdmin
            .from('deallink_user_stats')
            .select('profile_views_this_week, profile_views_last_week, last_deal_action_at, streak_weeks')
            .eq('user_id', admin.id)
            .maybeSingle(),

          supabaseAdmin
            .from('deallink_buyers')
            .select('*', { count: 'exact', head: true })
            .eq('account_id', accountId)
            .gte('im_registered_at', sevenDaysAgo),

          supabaseAdmin
            .from('deallink_deals')
            .select('*', { count: 'exact', head: true })
            .eq('account_id', accountId)
            .gte('updated_at', sevenDaysAgo),
        ])

        const views      = statsRes.data?.profile_views_this_week ?? 0
        const newBuyers  = buyersRes.count ?? 0
        const activeDeal = dealsRes.count  ?? 0

        // Send digest email.
        await sendEmailNotification(
          admin.email,
          `${views} buyer${views === 1 ? '' : 's'} viewed your deals this week — REI Flywheel`,
          `<p>Hi${profile.handle ? ' @' + profile.handle : ''},</p>
<p>Here's your weekly REI Flywheel summary:</p>
<table style="border-collapse:collapse;width:100%;max-width:480px">
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #eee"><strong>Profile views this week</strong></td>
    <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${views}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #eee"><strong>New buyers registered</strong></td>
    <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${newBuyers}</td>
  </tr>
  <tr>
    <td style="padding:8px 0"><strong>Deals with activity</strong></td>
    <td style="padding:8px 0;text-align:right">${activeDeal}</td>
  </tr>
</table>
<br>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:14px">
  💡 <strong>Tip:</strong> Deals with photos get 3× more buyer views. Add photos to any deal missing them.
</p>
<p><a href="${appUrl}/admin">View your deals in REI Flywheel →</a></p>
<p style="color:#999;font-size:12px">— The REI Flywheel team</p>`
        )

        // Streak logic: active this week = last_deal_action_at within 7 days.
        const lastAction  = statsRes.data?.last_deal_action_at
        const currentStreak = statsRes.data?.streak_weeks ?? 0
        const isActive    = lastAction && new Date(lastAction) >= new Date(sevenDaysAgo)
        const newStreak   = isActive ? currentStreak + 1 : 0

        // Reset stats: archive this week's views → last_week, zero this_week, update streak.
        await supabaseAdmin
          .from('deallink_user_stats')
          .upsert(
            {
              user_id: admin.id,
              profile_views_last_week: views,
              profile_views_this_week: 0,
              streak_weeks: newStreak,
            },
            { onConflict: 'user_id' }
          )

        console.log(`[weekly-digest-cron] Sent digest to ${admin.email} (views=${views} buyers=${newBuyers} deals=${activeDeal} streak=${newStreak})`)
      } catch (userErr) {
        console.error(`[weekly-digest-cron] Error for account ${profile.account_id}:`, userErr.message)
      }
    }
  } catch (err) {
    console.error('[weekly-digest-cron] Fatal error:', err.message)
  }
})

// Weekly market activity alert — runs every Monday at 9:00 AM UTC.
// Notifies all REI Flywheel users of new marketplace deals posted this week.
cron.schedule('0 9 * * 1', async () => {
  try {
    const { supabaseAdmin } = require('./middleware/auth')
    if (!supabaseAdmin) return

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const marketplaceUrl = `${process.env.VITE_DEALLINK_URL || 'https://reiflywheel.doorine.com'}/marketplace`

    // Count new marketplace-visible deals posted this week.
    const { count: dealCount, error: countErr } = await supabaseAdmin
      .from('deallink_deals')
      .select('*', { count: 'exact', head: true })
      .eq('marketplace_visible', true)
      .gte('created_at', sevenDaysAgo)

    if (countErr) {
      console.error('[market-alert-cron] Deal count error:', countErr.message)
      return
    }

    // Nothing new this week — skip entirely.
    if (!dealCount) return

    // Fetch all active REI Flywheel users.
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from('deallink_profiles')
      .select('account_id, handle')

    if (profilesErr) {
      console.error('[market-alert-cron] Failed to fetch profiles:', profilesErr.message)
      return
    }
    if (!profiles?.length) return

    for (const profile of profiles) {
      try {
        const { data: admin } = await supabaseAdmin
          .from('user_profiles')
          .select('email')
          .eq('account_id', profile.account_id)
          .eq('is_account_admin', true)
          .maybeSingle()

        if (!admin?.email) continue

        await sendEmailNotification(
          admin.email,
          `${dealCount} new deal${dealCount === 1 ? '' : 's'} posted in your market this week — REI Flywheel`,
          `<p>Hi${profile.handle ? ' @' + profile.handle : ''},</p>
<p><strong>${dealCount} new deal${dealCount === 1 ? '' : 's'}</strong> ${dealCount === 1 ? 'was' : 'were'} posted to the REI Flywheel marketplace this week.</p>
<p><a href="${marketplaceUrl}">Browse new deals →</a></p>
<p style="color:#999;font-size:12px">— The REI Flywheel team</p>`
        )
      } catch (userErr) {
        console.error(`[market-alert-cron] Error for account ${profile.account_id}:`, userErr.message)
      }
    }

    console.log(`[market-alert-cron] Sent market alert to ${profiles.length} users (new deals=${dealCount})`)
  } catch (err) {
    console.error('[market-alert-cron] Fatal error:', err.message)
  }
})

module.exports = app

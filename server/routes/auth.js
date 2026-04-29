const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin, supabaseAnon } = require('../middleware/auth')
const crypto = require('crypto')

// Postgres-backed rate limiter — shared across server instances and survives
// deploys, unlike the previous in-memory Map. Requires the signup_attempts
// table from apps/chg/scripts/phase-2-signup-rate-limit.sql.
//
// If Supabase is unreachable, we fail OPEN (allow the signup through) rather
// than locking every signup out on a DB blip. The tradeoff: a rate-limit
// bypass during a DB outage is less bad than blocking all new customers.
const SIGNUP_WINDOW_MS = 15 * 60 * 1000
const MAX_SIGNUPS_PER_IP = 5

async function checkSignupRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  if (!supabaseAdmin) return next()

  try {
    const windowStart = new Date(Date.now() - SIGNUP_WINDOW_MS).toISOString()

    // Opportunistic prune: drop stale rows for this IP so the table doesn't
    // grow unbounded. Missed rows (other IPs) are pruned by future requests.
    await supabaseAdmin
      .from('signup_attempts')
      .delete()
      .eq('ip_address', ip)
      .lt('attempted_at', windowStart)

    const { count, error: countError } = await supabaseAdmin
      .from('signup_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('attempted_at', windowStart)

    if (countError) {
      console.error('[auth/signup] Rate-limit count error (fail-open):', countError.message)
      return next()
    }

    if ((count || 0) >= MAX_SIGNUPS_PER_IP) {
      return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' })
    }

    const { error: insertError } = await supabaseAdmin
      .from('signup_attempts')
      .insert({ ip_address: ip })
    if (insertError) {
      console.error('[auth/signup] Rate-limit insert error (fail-open):', insertError.message)
    }

    next()
  } catch (e) {
    console.error('[auth/signup] Rate-limit threw (fail-open):', e.message)
    next()
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/signup', checkSignupRateLimit, async (req, res) => {
  let accountId = null
  let roleId = null
  let authUserId = null

  try {
    const { email, password, full_name, company_name } = req.body
    if (!email || !password || !company_name) {
      return res.status(400).json({ error: 'Email, password, and company name are required.' })
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }
    if (company_name.length > 100) {
      return res.status(400).json({ error: 'Company name must be 100 characters or fewer.' })
    }

    const sanitizedName = (full_name || '').slice(0, 100).trim()
    const sanitizedCompany = company_name.slice(0, 100).trim()

    accountId = crypto.randomUUID()
    roleId = crypto.randomUUID()

    // Phase 2.5: plan/seat metadata moved to account_products. The accounts
    // row is just identity + status now; the CHG entitlement insert below
    // carries the plan ('starter' for new signups).
    const { error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({
        id: accountId,
        name: sanitizedCompany,
        status: 'active',
        billing_email: email.toLowerCase().trim(),
      })
    if (accountError) throw accountError

    // Look up CHG product — we need its id for the role scope AND the entitlement.
    const { data: chgProduct, error: productLookupError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('code', 'chg')
      .single()
    if (productLookupError || !chgProduct?.id) {
      throw new Error('CHG product row missing — cannot complete signup')
    }

    const { error: roleError } = await supabaseAdmin
      .from('roles')
      .insert({
        id: roleId,
        name: 'Admin',
        account_id: accountId,
        is_system: false,
        product_id: chgProduct.id,
      })
    if (roleError) throw roleError

    const departments = ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks']
    const { error: permError } = await supabaseAdmin
      .from('role_permissions')
      .insert(departments.map(dept => ({ role_id: roleId, department: dept, permission_level: 'edit', product_id: chgProduct.id })))
    if (permError) throw permError

    // Grant the CHG entitlement so requireProduct('chg') admits this account on
    // first login. Without this, a brand-new signup would be locked out of every
    // CHG business route.
    const { error: entitlementError } = await supabaseAdmin
      .from('account_products')
      .insert({
        account_id: accountId,
        product_id: chgProduct.id,
        plan: 'starter',
        status: 'active',
        started_at: new Date().toISOString(),
      })
    if (entitlementError) throw entitlementError

    const normalizedEmail = email.toLowerCase().trim()

    let authUser, authError
    const createResult = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: sanitizedName, account_id: accountId, role_id: roleId },
    })
    authUser = createResult.data
    authError = createResult.error

    if (authError && authError.message?.includes('Database error')) {
      const retryResult = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: sanitizedName },
      })
      authUser = retryResult.data
      authError = retryResult.error
    }
    if (authError) throw authError
    authUserId = authUser.user.id

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authUser.user.id,
        email: normalizedEmail,
        full_name: sanitizedName,
        account_id: accountId,
        role_id: roleId,
        is_account_admin: true,
        is_super_admin: false,
        status: 'active',
      })
    if (profileError) {
      console.error('[auth/signup] Profile creation error:', profileError.message)
      throw profileError
    }

    res.status(201).json({ message: 'Account created successfully.' })
  } catch (e) {
    console.error('[auth/signup] Error:', e.message)

    try {
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId)
      }
      if (roleId) {
        await supabaseAdmin.from('role_permissions').delete().eq('role_id', roleId)
        await supabaseAdmin.from('roles').delete().eq('id', roleId)
      }
      if (accountId) {
        await supabaseAdmin.from('account_products').delete().eq('account_id', accountId)
        await supabaseAdmin.from('accounts').delete().eq('id', accountId)
      }
    } catch (cleanupErr) {
      console.error('[auth/signup] Cleanup error:', cleanupErr.message)
    }

    if (e.message?.includes('already been registered') || e.message?.includes('unique constraint')) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }
    res.status(500).json({ error: 'Failed to create account. Please try again.' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = req.user.profile
    // Derive plan_tier from the CHG entitlement now that accounts.plan_tier
    // has been dropped. Keeps the response shape stable for client code that
    // reads profile.plan_tier (Profile.jsx etc.).
    const chgEntitlement = (req.user.entitlements || []).find(e => e.code === 'chg')
    const result = {
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone,
        avatar_url: profile.avatar_url,
        is_super_admin: profile.is_super_admin,
        is_account_admin: profile.is_account_admin,
        status: profile.status,
        account_id: profile.account_id,
        account_name: profile.accounts?.name || null,
        plan_tier: chgEntitlement?.plan || null,
        role_name: profile.roles?.name || null,
        role_id: profile.role_id,
        role_product_code: req.user.role_product_code,
        profile_score: profile.profile_score ?? 0,
        unverified_feature_uses: profile.unverified_feature_uses ?? 0,
      },
      permissions: req.user.permissions,
      entitlements: req.user.entitlements,
    }

    if (supabaseAdmin) {
      await supabaseAdmin.from('user_profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id)
    }

    res.json(result)
  } catch (e) {
    console.error('[auth/me] Error:', e.message)
    res.status(500).json({ error: 'Failed to fetch profile.' })
  }
})

// POST /api/auth/phone/send-otp
// Public — no auth required.
// Rate limit: 3 OTP sends per phone number per 15 minutes.
const OTP_WINDOW_MS = 15 * 60 * 1000
const MAX_OTP_SENDS = 3
const PHONE_RE = /^\+1[2-9]\d{9}$/

router.post('/phone/send-otp', async (req, res) => {
  const { phone } = req.body

  if (!phone || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Valid US phone number required (+1XXXXXXXXXX).' })
  }

  if (supabaseAdmin) {
    try {
      const windowStart = new Date(Date.now() - OTP_WINDOW_MS).toISOString()

      await supabaseAdmin
        .from('signup_attempts')
        .delete()
        .eq('phone', phone)
        .lt('attempted_at', windowStart)

      const { count } = await supabaseAdmin
        .from('signup_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('attempt_type', 'otp_send')
        .gte('attempted_at', windowStart)

      if ((count || 0) >= MAX_OTP_SENDS) {
        return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
      }

      await supabaseAdmin
        .from('signup_attempts')
        .insert({ phone, attempt_type: 'otp_send', ip_address: req.ip || 'unknown' })
    } catch (e) {
      console.error('[auth/phone/send-otp] Rate-limit error (fail-open):', e.message)
    }
  }

  if (!supabaseAnon) {
    return res.status(503).json({ error: 'Auth not configured on server.' })
  }

  const { error } = await supabaseAnon.auth.signInWithOtp({ phone })
  if (error) {
    console.error('[auth/phone/send-otp] Error:', error.message)
    return res.status(500).json({ error: 'Failed to send code. Please try again.' })
  }

  res.json({ success: true })
})

// POST /api/auth/phone/verify-otp
// Public — no auth required.
// Returns { session, isNewUser: bool }. Runs the same 5-step account creation
// as /signup for first-time phone users.
router.post('/phone/verify-otp', async (req, res) => {
  const { phone, code } = req.body
  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone and code are required.' })
  }

  if (!supabaseAnon) {
    return res.status(503).json({ error: 'Auth not configured on server.' })
  }

  const { data, error } = await supabaseAnon.auth.verifyOtp({ phone, token: code, type: 'sms' })
  if (error) {
    return res.status(401).json({ error: 'Invalid or expired code.' })
  }

  const { session, user } = data

  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('id, account_id, status')
    .eq('id', user.id)
    .single()

  if (existingProfile) {
    if (existingProfile.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended.' })
    }
    return res.json({ session, isNewUser: false })
  }

  // New user — run 5-step account creation (mirrors /signup)
  let accountId = null
  let roleId = null

  try {
    const { data: chgProduct, error: productError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('code', 'chg')
      .single()

    if (productError || !chgProduct?.id) {
      throw new Error('CHG product row missing — cannot complete signup')
    }

    accountId = crypto.randomUUID()
    roleId = crypto.randomUUID()

    const { error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({ id: accountId, name: 'My Company', status: 'active' })
    if (accountError) throw accountError

    const { error: roleError } = await supabaseAdmin
      .from('roles')
      .insert({ id: roleId, name: 'Admin', account_id: accountId, is_system: false, product_id: chgProduct.id })
    if (roleError) throw roleError

    const departments = ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks']
    const { error: permError } = await supabaseAdmin
      .from('role_permissions')
      .insert(departments.map(dept => ({ role_id: roleId, department: dept, permission_level: 'edit', product_id: chgProduct.id })))
    if (permError) throw permError

    const { error: entitlementError } = await supabaseAdmin
      .from('account_products')
      .insert({ account_id: accountId, product_id: chgProduct.id, plan: 'starter', status: 'active', started_at: new Date().toISOString() })
    if (entitlementError) throw entitlementError

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: null,
        phone,
        account_id: accountId,
        role_id: roleId,
        is_account_admin: true,
        is_super_admin: false,
        status: 'active',
        profile_score: 20,
      })
    if (profileError) throw profileError

    res.json({ session, isNewUser: true })
  } catch (e) {
    console.error('[auth/phone/verify-otp] Error:', e.message)
    try {
      if (roleId) {
        await supabaseAdmin.from('role_permissions').delete().eq('role_id', roleId)
        await supabaseAdmin.from('roles').delete().eq('id', roleId)
      }
      if (accountId) {
        await supabaseAdmin.from('account_products').delete().eq('account_id', accountId)
        await supabaseAdmin.from('accounts').delete().eq('id', accountId)
      }
    } catch (cleanupErr) {
      console.error('[auth/phone/verify-otp] Cleanup error:', cleanupErr.message)
    }
    res.status(500).json({ error: 'Failed to create account. Please try again.' })
  }
})

module.exports = router

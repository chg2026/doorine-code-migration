const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin } = require('../middleware/auth')
const crypto = require('crypto')

const signupAttempts = new Map()
const SIGNUP_WINDOW_MS = 15 * 60 * 1000
const MAX_SIGNUPS_PER_IP = 5

function checkSignupRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()
  const attempts = signupAttempts.get(ip) || []
  const recent = attempts.filter(t => now - t < SIGNUP_WINDOW_MS)
  if (recent.length >= MAX_SIGNUPS_PER_IP) {
    return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' })
  }
  recent.push(now)
  signupAttempts.set(ip, recent)
  next()
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

    const { error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({
        id: accountId,
        name: sanitizedCompany,
        plan_tier: 'starter',
        status: 'active',
        billing_email: email.toLowerCase().trim(),
        max_users: 5,
        allowed_departments: ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks'],
      })
    if (accountError) throw accountError

    const { error: roleError } = await supabaseAdmin
      .from('roles')
      .insert({
        id: roleId,
        name: 'Admin',
        account_id: accountId,
        is_system: false,
      })
    if (roleError) throw roleError

    const departments = ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks']
    const { error: permError } = await supabaseAdmin
      .from('role_permissions')
      .insert(departments.map(dept => ({ role_id: roleId, department: dept, permission_level: 'edit' })))
    if (permError) throw permError

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
        plan_tier: profile.accounts?.plan_tier || null,
        role_name: profile.roles?.name || null,
        role_id: profile.role_id,
      },
      permissions: req.user.permissions,
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

module.exports = router

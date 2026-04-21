const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

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

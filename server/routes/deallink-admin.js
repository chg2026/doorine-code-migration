// Super-admin routes for REI Flywheel management.
// No scopeToAccount — these operate across all wholesaler accounts.

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const router = express.Router()

function requireSuperAdmin(req, res, next) {
  if (!req.user?.isSuperAdmin) return res.status(403).json({ error: 'Super admin only.' })
  next()
}

// GET /api/deallink/admin/profiles — list all wholesaler profiles
router.get('/profiles', requireSuperAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('deallink_profiles')
    .select('handle, name, city, is_ambassador, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ profiles: data || [] })
})

// PATCH /api/deallink/admin/profiles/:handle/ambassador — award or revoke badge
router.patch('/profiles/:handle/ambassador', requireSuperAdmin, async (req, res) => {
  const { is_ambassador } = req.body
  if (typeof is_ambassador !== 'boolean') {
    return res.status(400).json({ error: 'is_ambassador must be a boolean.' })
  }
  const { error } = await supabaseAdmin
    .from('deallink_profiles')
    .update({ is_ambassador })
    .eq('handle', req.params.handle)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

module.exports = router

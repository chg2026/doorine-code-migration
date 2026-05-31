const { Router } = require('express')
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

const router = Router()

function db(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// GET /api/deallink/referrals/my-link
router.get('/my-link', requireAuth, async (req, res) => {
  const sb = db(res); if (!sb) return
  try {
    const { data: profile } = await sb
      .from('deallink_profiles')
      .select('handle')
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (!profile?.handle) return res.json({ referral_url: null })
    res.json({ referral_url: `https://doorine.com/join?ref=${profile.handle}` })
  } catch (err) {
    console.error('[deallink-referrals/my-link] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch referral link.' })
  }
})

// GET /api/deallink/referrals/stats
router.get('/stats', requireAuth, async (req, res) => {
  const sb = db(res); if (!sb) return
  try {
    const { data: rows, error } = await sb
      .from('deallink_referrals')
      .select('status')
      .eq('referrer_id', req.user.id)

    if (error) throw error

    const total = (rows || []).length
    const activated = (rows || []).filter((r) => r.status === 'activated').length
    const pending = (rows || []).filter((r) => r.status === 'pending').length

    res.json({ total, activated, pending })
  } catch (err) {
    console.error('[deallink-referrals/stats] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch referral stats.' })
  }
})

// POST /api/deallink/referrals/track
router.post('/track', requireAuth, async (req, res) => {
  const sb = db(res); if (!sb) return
  try {
    const { ref } = req.body || {}
    if (!ref) return res.json({ ok: true })

    // Look up the referrer by handle.
    const { data: referrerProfile } = await sb
      .from('deallink_profiles')
      .select('user_id')
      .eq('handle', ref)
      .maybeSingle()

    if (!referrerProfile?.user_id) return res.json({ ok: true })

    // Skip if a record already exists for this referrer/referred pair.
    const { data: existing } = await sb
      .from('deallink_referrals')
      .select('id')
      .eq('referrer_id', referrerProfile.user_id)
      .eq('referred_user_id', req.user.id)
      .maybeSingle()

    if (existing) return res.json({ ok: true })

    await sb.from('deallink_referrals').insert({
      referrer_id: referrerProfile.user_id,
      referred_user_id: req.user.id,
      status: 'pending',
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[deallink-referrals/track] Error:', err.message)
    res.status(500).json({ error: 'Failed to track referral.' })
  }
})

module.exports = router

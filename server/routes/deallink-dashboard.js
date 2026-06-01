const { Router } = require('express')
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

const router = Router()

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// GET /api/deallink/dashboard/stats
// Fetches or creates a deallink_user_stats row for the authenticated user.
router.get('/stats', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const { data, error } = await db
      .from('deallink_user_stats')
      .upsert({ user_id: req.user.id }, { onConflict: 'user_id', ignoreDuplicates: false })
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[deallink-dashboard/stats] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch stats.' })
  }
})

// GET /api/deallink/dashboard/action-inbox
// Returns counts of items requiring the owner's attention.
router.get('/action-inbox', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = req.user.account_id
  if (!accountId) return res.status(400).json({ error: 'No account_id on user.' })

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [offersRes, leadsRes, staleRes] = await Promise.all([
      // Unreviewed offers: offers on this account's deals with status Pending.
      db
        .from('deallink_offers')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('status', 'Pending'),

      // Uncontacted leads: leads with no notes and no status set.
      db
        .from('deallink_leads')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .or('notes.is.null,notes.eq.')
        .or('status.is.null,status.eq.'),

      // Stale deals: not closed/dead and created 7+ days ago.
      db
        .from('deallink_deals')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .lt('created_at', sevenDaysAgo)
        .neq('status', 'Closed')
        .neq('status', 'Dead'),
    ])

    if (offersRes.error) throw offersRes.error
    if (leadsRes.error)  throw leadsRes.error
    if (staleRes.error)  throw staleRes.error

    const offers      = offersRes.count ?? 0
    const leads       = leadsRes.count  ?? 0
    const stale_deals = staleRes.count  ?? 0

    res.json({ offers, leads, stale_deals, total: offers + leads + stale_deals })
  } catch (err) {
    console.error('[deallink-dashboard/action-inbox] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch action inbox.' })
  }
})

// GET /api/deallink/dashboard/market-feed
// Returns recent marketplace-visible deals from all accounts (public feed).
router.get('/market-feed', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await db
      .from('deallink_deals')
      .select('*')
      .eq('marketplace_visible', true)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[deallink-dashboard/market-feed] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch market feed.' })
  }
})

// GET /api/deallink/dashboard/profile-score
// Calculates a completeness score (0–100) for the user's Deal Link profile.
router.get('/profile-score', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = req.user.account_id
  if (!accountId) return res.status(400).json({ error: 'No account_id on user.' })

  try {
    const [profileRes, dealCountRes] = await Promise.all([
      db
        .from('deallink_profiles')
        .select('handle, avatar_url, bio')
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('deallink_deals')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId),
    ])

    if (profileRes.error)   throw profileRes.error
    if (dealCountRes.error) throw dealCountRes.error

    const profile   = profileRes.data
    const dealCount = dealCountRes.count ?? 0

    const hasHandle    = !!(profile?.handle)
    const hasAvatar    = !!(profile?.avatar_url)
    const hasBio       = !!(profile?.bio)
    const hasOneDeal   = dealCount >= 1
    const hasTwoDeals  = dealCount >= 2

    const score =
      (hasHandle   ? 20 : 0) +
      (hasAvatar   ? 20 : 0) +
      (hasBio      ? 20 : 0) +
      (hasOneDeal  ? 20 : 0) +
      (hasTwoDeals ? 20 : 0)

    let next_action = null
    if (!hasHandle)  next_action = 'Set your public handle'
    else if (!hasAvatar)  next_action = 'Upload a profile photo'
    else if (!hasBio)     next_action = 'Write a short bio'
    else if (!hasOneDeal) next_action = 'Add your first deal'
    else if (!hasTwoDeals) next_action = 'Add a second deal to reach 100%'

    res.json({ score, next_action })
  } catch (err) {
    console.error('[deallink-dashboard/profile-score] Error:', err.message)
    res.status(500).json({ error: 'Failed to calculate profile score.' })
  }
})

module.exports = router

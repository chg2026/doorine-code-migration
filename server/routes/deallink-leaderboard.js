const { Router } = require('express')
const { supabaseAdmin } = require('../middleware/auth')

const router = Router()

// GET /api/deallink/leaderboard — public, no auth required.
// Returns the top 10 users ranked by weighted score:
//   deals_closed × 3  +  buyer_list_count × 2  +  referrals_activated × 1
router.get('/', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase admin client not configured.' })
  }

  try {
    // Fetch all five datasets in parallel.
    const [profilesRes, dealsRes, statsRes, referralsRes, badgesRes] = await Promise.all([
      supabaseAdmin
        .from('deallink_profiles')
        .select('user_id, account_id, handle, avatar_url'),
      supabaseAdmin
        .from('deallink_deals')
        .select('account_id')
        .eq('status', 'Closed'),
      supabaseAdmin
        .from('deallink_user_stats')
        .select('user_id, buyer_list_count'),
      supabaseAdmin
        .from('deallink_referrals')
        .select('referrer_id')
        .eq('status', 'activated'),
      supabaseAdmin
        .from('deallink_badges')
        .select('user_id')
        .eq('badge_type', 'ambassador'),
    ])

    if (profilesRes.error) throw profilesRes.error
    if (dealsRes.error) throw dealsRes.error
    if (statsRes.error) throw statsRes.error
    if (referralsRes.error) throw referralsRes.error
    if (badgesRes.error) throw badgesRes.error

    // Build lookup maps for O(1) access.
    const closedByAccount = {}
    for (const d of dealsRes.data || []) {
      closedByAccount[d.account_id] = (closedByAccount[d.account_id] || 0) + 1
    }

    const statsByUser = {}
    for (const s of statsRes.data || []) {
      statsByUser[s.user_id] = s.buyer_list_count || 0
    }

    const referralsByUser = {}
    for (const r of referralsRes.data || []) {
      referralsByUser[r.referrer_id] = (referralsByUser[r.referrer_id] || 0) + 1
    }

    const ambassadorSet = new Set((badgesRes.data || []).map((b) => b.user_id))

    // Score every profile and filter out zero-score users.
    const scored = (profilesRes.data || [])
      .map((p) => {
        const deals_closed = closedByAccount[p.account_id] || 0
        const buyer_list_count = statsByUser[p.user_id] || 0
        const referrals_activated = referralsByUser[p.user_id] || 0
        const total_score = deals_closed * 3 + buyer_list_count * 2 + referrals_activated * 1
        return {
          handle: p.handle,
          avatar_url: p.avatar_url || null,
          deals_closed,
          buyer_list_count,
          referrals_activated,
          total_score,
          is_ambassador: ambassadorSet.has(p.user_id),
        }
      })
      .filter((u) => u.total_score > 0)
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 10)

    res.json(scored)
  } catch (err) {
    console.error('[deallink-leaderboard] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch leaderboard.' })
  }
})

module.exports = router

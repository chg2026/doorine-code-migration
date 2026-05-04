const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

router.use(requireAuth)

router.put('/profile', async (req, res) => {
  try {
    const { full_name, phone } = req.body
    const updates = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (phone !== undefined) updates.phone = phone

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/users/complete-profile
// Protected via router.use(requireAuth) above.
// Called after NameModal (name) and after email gate (email).
router.patch('/complete-profile', async (req, res) => {
  const { first_name, last_name, company_name, email } = req.body
  const userId = req.user.id
  const accountId = req.user.account_id

  const updates = {}
  let scoreIncrease = 0

  if (first_name || last_name) {
    updates.full_name = `${first_name || ''} ${last_name || ''}`.trim()
    scoreIncrease += 20
  }

  if (email) {
    const normalized = email.toLowerCase().trim()
    updates.email = normalized
    scoreIncrease += 25
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, { email: normalized })
    } catch (e) {
      console.error('[users/complete-profile] Supabase auth email update error:', e.message)
    }
  }

  try {
    const { data: current } = await supabaseAdmin
      .from('user_profiles')
      .select('profile_score, unverified_feature_uses')
      .eq('id', userId)
      .single()

    // Empty body — caller is recording a gated feature use (no profile fields to update)
    if (Object.keys(updates).length === 0) {
      const newUses = (current?.unverified_feature_uses || 0) + 1
      await supabaseAdmin
        .from('user_profiles')
        .update({ unverified_feature_uses: newUses })
        .eq('id', userId)
      return res.json({ success: true, unverified_feature_uses: newUses })
    }

    updates.profile_score = Math.min(100, (current?.profile_score || 0) + scoreIncrease)

    await supabaseAdmin.from('user_profiles').update(updates).eq('id', userId)

    if (company_name) {
      await supabaseAdmin
        .from('accounts')
        .update({ name: company_name, ...(updates.email ? { billing_email: updates.email } : {}) })
        .eq('id', accountId)
    }

    res.json({ success: true, profile_score: updates.profile_score })
  } catch (e) {
    console.error('[users/complete-profile] Error:', e.message)
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

module.exports = router

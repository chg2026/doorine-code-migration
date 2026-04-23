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

module.exports = router

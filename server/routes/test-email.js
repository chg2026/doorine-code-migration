const { Router } = require('express')
const { sendEmailNotification } = require('../services/notifications')

const router = Router()

// POST /api/test/send-email
// Temporary — no auth. Remove once Resend integration is verified.
router.post('/send-email', async (req, res) => {
  try {
    const result = await sendEmailNotification(
      'support@goldbridgerei.com',
      'REI Flywheel — Resend test',
      '<p>Resend is connected and working.</p>'
    )
    res.json({ ok: true, result })
  } catch (err) {
    console.error('[test/send-email] Error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

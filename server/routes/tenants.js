const express = require('express')
const router = express.Router()
const supabase = require('../db')

// Get all tenants
router.get('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('tenants')
      .select('*, properties(address)')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create tenant
router.post('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('tenants')
      .insert([req.body])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update tenant payment status
router.put('/:id', async (req, res) => {
  try {
    // Auto late fee logic
    if (req.body.payment_status === 'late') {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('late_fee_count, rent_amount')
        .eq('id', req.params.id)
        .single()

      const newCount = (tenant.late_fee_count || 0) + 1
      const lateFee = newCount === 1 ? 69 : tenant.rent_amount * 0.10
      req.body.late_fee_count = newCount
      req.body.current_late_fee = lateFee
    }

    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('tenants')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
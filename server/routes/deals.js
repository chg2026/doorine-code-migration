const express = require('express')
const router = express.Router()
const supabase = require('../db')

// Get all deals
router.get('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create deal
router.post('/', async (req, res) => {
  try {
    if (req.body.arv && req.body.asking_price) {
      const totalCost = req.body.asking_price +
        (req.body.labor_estimate || 0) +
        (req.body.material_estimate || 0)
      req.body.roi_estimate = Math.round(
        ((req.body.arv - totalCost) / totalCost) * 100
      )
    }
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('deals')
      .insert([req.body])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update deal
router.put('/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('deals')
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
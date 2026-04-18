const express = require('express')
const router = express.Router()
const supabase = require('../db')

// Get all invoices
router.get('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('invoices')
      .select('*, properties(address)')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create invoice
router.post('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('invoices')
      .insert([req.body])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
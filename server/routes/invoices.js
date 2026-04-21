const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

router.get('/', async (req, res) => {
  try {
    let query = db().from('invoices').select('*, properties(address)').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const row = { ...req.body, account_id: req.user.account_id }
    const { data, error } = await db().from('invoices').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

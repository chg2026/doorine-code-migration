const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

router.get('/', async (req, res) => {
  try {
    let query = db().from('deals').select('*').order('created_at', { ascending: false })
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
    if (row.arv && row.asking_price) {
      const totalCost = row.asking_price + (row.labor_estimate || 0) + (row.material_estimate || 0)
      row.roi_estimate = Math.round(((row.arv - totalCost) / totalCost) * 100)
    }
    const { data, error } = await db().from('deals').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    let query = db().from('deals').update(req.body).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

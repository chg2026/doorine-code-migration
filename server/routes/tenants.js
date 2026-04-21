const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

router.get('/', async (req, res) => {
  try {
    let query = db().from('tenants').select('*, properties(address)').order('created_at', { ascending: false })
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
    const { data, error } = await db().from('tenants').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (req.body.payment_status === 'late') {
      const { data: tenant } = await db().from('tenants').select('late_fee_count, rent_amount').eq('id', req.params.id).single()
      const newCount = (tenant.late_fee_count || 0) + 1
      const lateFee = newCount === 1 ? 69 : tenant.rent_amount * 0.10
      req.body.late_fee_count = newCount
      req.body.current_late_fee = lateFee
    }
    let query = db().from('tenants').update(req.body).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

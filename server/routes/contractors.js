const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

router.get('/', async (req, res) => {
  try {
    let query = db().from('contractors').select('*').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    let query = db().from('contractors').select('*').eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const row = { ...req.body, account_id: req.user.account_id }
    const { data, error } = await db().from('contractors').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    let query = db().from('contractors').update(req.body).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await db().from('construction_projects').update({ contractor_id: null }).eq('contractor_id', req.params.id)
    let query = db().from('contractors').delete().eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { error } = await query
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

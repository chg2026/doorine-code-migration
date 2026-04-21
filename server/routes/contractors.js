const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.contractors !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

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

router.post('/', requireEdit, async (req, res) => {
  try {
    const row = stripAccountId(req.body)
    row.account_id = req.user.account_id
    const { data, error } = await db().from('contractors').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    const updates = stripAccountId(req.body)
    let query = db().from('contractors').update(updates).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    if (!data || data.length === 0) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let verifyQuery = db().from('contractors').select('id').eq('id', req.params.id)
    if (req.account_filter) verifyQuery = verifyQuery.eq('account_id', req.account_filter)
    const { data: cont } = await verifyQuery.single()
    if (!cont) return res.status(403).json({ error: 'Access denied.' })

    let projQuery = db().from('construction_projects').update({ contractor_id: null }).eq('contractor_id', req.params.id)
    if (req.account_filter) projQuery = projQuery.eq('account_id', req.account_filter)
    await projQuery
    const { error } = await db().from('contractors').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

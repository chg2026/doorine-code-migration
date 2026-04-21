const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.tasks !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('recurring_tasks').select('*, properties(address)').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id/complete', requireEdit, async (req, res) => {
  try {
    let query = db().from('recurring_tasks').update({
      status: 'completed'
    }).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    if (!data || data.length === 0) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId, verifyForeignKey } = require('../middleware/permissions')

const db = () => supabaseAdmin

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.property_management !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

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

router.post('/', requireEdit, async (req, res) => {
  try {
    const row = stripAccountId(req.body)
    row.account_id = req.user.account_id
    if (req.account_filter && row.property_id) {
      if (!(await verifyForeignKey(db(), 'properties', row.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
    }
    const { data, error } = await db().from('tenants').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    let verifyQuery = db().from('tenants').select('id, late_fee_count, rent_amount, payment_status').eq('id', req.params.id)
    if (req.account_filter) verifyQuery = verifyQuery.eq('account_id', req.account_filter)
    const { data: tenant, error: vErr } = await verifyQuery.maybeSingle()
    if (vErr || !tenant) return res.status(403).json({ error: 'Access denied.' })

    const updates = stripAccountId(req.body)

    if (req.account_filter && updates.property_id) {
      if (!(await verifyForeignKey(db(), 'properties', updates.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
    }

    if (updates.payment_status === 'late' && tenant.payment_status !== 'late') {
      const newCount = (tenant.late_fee_count || 0) + 1
      updates.late_fee_count = newCount
    }

    const { data, error } = await db().from('tenants').update(updates).eq('id', req.params.id).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

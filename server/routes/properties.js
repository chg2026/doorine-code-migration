const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

function clean(body) {
  const out = stripAccountId(body)
  const skip = ['account_filter', 'id', 'created_at', 'updated_at']
  for (const k of skip) delete out[k]
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null
  }
  if (out.type && !out.property_type) out.property_type = out.type
  if (out.property_type && !out.type) out.type = out.property_type
  return out
}

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.property_management !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('properties').select('*').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    let query = db().from('properties').select('*').eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.single()
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireEdit, async (req, res) => {
  try {
    const row = clean(req.body)
    row.account_id = req.user.account_id
    const { data, error } = await db().from('properties').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    const updates = clean(req.body)
    let query = db().from('properties').update(updates).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    if (!data || data.length === 0) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let verifyQuery = db().from('properties').select('id').eq('id', req.params.id)
    if (req.account_filter) verifyQuery = verifyQuery.eq('account_id', req.account_filter)
    const { data: prop } = await verifyQuery.single()
    if (!prop) return res.status(403).json({ error: 'Access denied.' })

    const propertyId = req.params.id
    const { data: projs } = await db().from('construction_projects').select('id').eq('property_id', propertyId)
    const projIds = (projs || []).map(p => p.id)
    if (projIds.length) {
      await db().from('construction_phases').delete().in('project_id', projIds)
      await db().from('construction_projects').delete().in('id', projIds)
    }
    await Promise.all([
      db().from('invoices').delete().eq('property_id', propertyId),
      db().from('tenants').delete().eq('property_id', propertyId),
      db().from('recurring_tasks').delete().eq('property_id', propertyId),
    ].map(p => p.then(() => null, () => null)))
    const { error } = await db().from('properties').delete().eq('id', propertyId)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

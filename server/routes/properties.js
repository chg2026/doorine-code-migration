const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

function clean(body) {
  const out = stripAccountId(body)
  const skip = ['account_filter', 'id', 'created_at', 'updated_at', 'unit_labels']
  for (const k of skip) delete out[k]
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null
  }
  if (out.type && !out.property_type) out.property_type = out.type
  if (out.property_type && !out.type) out.type = out.property_type
  return out
}

function defaultUnitLabels(propertyType, count) {
  const n = Math.max(1, parseInt(count || 1, 10) || 1)
  if (propertyType === 'single_family') return ['Unit 1']
  return Array.from({ length: n }, (_, i) => `Unit ${i + 1}`)
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
    if (row.property_type === 'single_family') row.unit_count = 1

    const { data, error } = await db().from('properties').insert([row]).select()
    if (error) throw error
    const property = data[0]

    const labels = Array.isArray(req.body.unit_labels) && req.body.unit_labels.length
      ? req.body.unit_labels
      : defaultUnitLabels(property.property_type, property.unit_count)

    const unitRows = labels.map((label, i) => ({
      property_id: property.id,
      account_id: property.account_id,
      label: (label || `Unit ${i + 1}`).toString().slice(0, 100),
      sort_order: i,
    }))
    if (unitRows.length) {
      const { error: unitErr } = await db().from('units').insert(unitRows)
      if (unitErr) {
        await db().from('properties').delete().eq('id', property.id)
        throw new Error(`Unit auto-create failed: ${unitErr.message}`)
      }
      // ensure unit_count matches actual rows created
      await db().from('properties').update({ unit_count: unitRows.length }).eq('id', property.id)
      property.unit_count = unitRows.length
    }

    res.json(property)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    const updates = clean(req.body)
    // unit_count is owned by /api/units (add/remove sync the count). Ignore on property edit.
    delete updates.unit_count
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
    let projQuery = db().from('construction_projects').select('id').eq('property_id', propertyId)
    if (req.account_filter) projQuery = projQuery.eq('account_id', req.account_filter)
    const { data: projs } = await projQuery
    const projIds = (projs || []).map(p => p.id)
    if (projIds.length) {
      await db().from('construction_phases').delete().in('project_id', projIds)
      await db().from('construction_projects').delete().in('id', projIds)
    }
    const cascadeTables = ['invoices', 'tenants', 'recurring_tasks']
    for (const table of cascadeTables) {
      let cq = db().from(table).delete().eq('property_id', propertyId)
      if (req.account_filter) cq = cq.eq('account_id', req.account_filter)
      await cq
    }
    let delQuery = db().from('properties').delete().eq('id', propertyId)
    if (req.account_filter) delQuery = delQuery.eq('account_id', req.account_filter)
    const { error } = await delQuery
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

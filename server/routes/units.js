const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

async function syncPropertyUnitCount(propertyId) {
  const { count } = await db().from('units').select('id', { count: 'exact', head: true }).eq('property_id', propertyId)
  await db().from('properties').update({ unit_count: count || 0 }).eq('id', propertyId)
}

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.property_management !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

// GET /api/units?property_id=xxx — list units for a property (or all in account)
router.get('/', async (req, res) => {
  try {
    let query = db().from('units').select('*').order('sort_order', { ascending: true })
    if (req.query.property_id) query = query.eq('property_id', req.query.property_id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/units/:id/stats — combined project rollup for one unit
router.get('/:id/stats', async (req, res) => {
  try {
    let unitQ = db().from('units').select('id, account_id').eq('id', req.params.id)
    if (req.account_filter) unitQ = unitQ.eq('account_id', req.account_filter)
    const { data: unit } = await unitQ.single()
    if (!unit) return res.status(404).json({ error: 'Unit not found' })

    let projQ = db()
      .from('construction_projects')
      .select('id, status, labor_budget, material_budget, labor_spent, material_spent, overall_pct, target_completion, start_date')
      .eq('unit_id', req.params.id)
    if (req.account_filter) projQ = projQ.eq('account_id', req.account_filter)
    const { data: projects } = await projQ

    const list = projects || []
    const active = list.filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    const totalBudget = list.reduce((s, p) => s + Number(p.labor_budget || 0) + Number(p.material_budget || 0), 0)
    const totalSpent = list.reduce((s, p) => s + Number(p.labor_spent || 0) + Number(p.material_spent || 0), 0)
    const completion = list.length ? Math.round(list.reduce((s, p) => s + Number(p.overall_pct || 0), 0) / list.length) : 0

    // on-time = completion% >= elapsed%
    let onTime = true
    for (const p of active) {
      if (!p.start_date || !p.target_completion) continue
      const start = new Date(p.start_date).getTime()
      const end = new Date(p.target_completion).getTime()
      const now = Date.now()
      if (end <= start) continue
      const elapsedPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
      if (Number(p.overall_pct || 0) < elapsedPct - 5) { onTime = false; break }
    }

    res.json({
      project_count: list.length,
      active_count: active.length,
      total_budget: totalBudget,
      total_spent: totalSpent,
      completion_pct: completion,
      on_time: onTime,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/units/:id/projects — list construction projects for this unit
// (under property_management scope so the unit dashboard can render without
// construction access)
router.get('/:id/projects', async (req, res) => {
  try {
    let unitQ = db().from('units').select('id, account_id').eq('id', req.params.id)
    if (req.account_filter) unitQ = unitQ.eq('account_id', req.account_filter)
    const { data: unit } = await unitQ.single()
    if (!unit) return res.status(404).json({ error: 'Unit not found' })

    let projQ = db()
      .from('construction_projects')
      .select('id, name, status, start_date, target_completion, overall_pct, labor_budget, material_budget, labor_spent, material_spent, contractor_id, contractors(id, name), construction_phases(id, name, completion_pct, status)')
      .eq('unit_id', req.params.id)
      .order('created_at', { ascending: false })
    if (req.account_filter) projQ = projQ.eq('account_id', req.account_filter)
    const { data: projects } = await projQ
    res.json(projects || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/units — create a single unit
router.post('/', requireEdit, async (req, res) => {
  try {
    const { property_id, label, sort_order } = req.body
    if (!property_id || !label) return res.status(400).json({ error: 'property_id and label required' })

    let propQ = db().from('properties').select('id, account_id').eq('id', property_id)
    if (req.account_filter) propQ = propQ.eq('account_id', req.account_filter)
    const { data: prop } = await propQ.single()
    if (!prop) return res.status(403).json({ error: 'Access denied' })

    const { data, error } = await db().from('units').insert([{
      property_id,
      account_id: prop.account_id,
      label,
      sort_order: sort_order ?? 0,
    }]).select().single()
    if (error) throw error
    await syncPropertyUnitCount(property_id)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/units/:id — rename / reorder
router.put('/:id', requireEdit, async (req, res) => {
  try {
    const updates = {}
    if (req.body.label !== undefined) updates.label = req.body.label
    if (req.body.sort_order !== undefined) updates.sort_order = req.body.sort_order

    let q = db().from('units').update(updates).eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q.select()
    if (error) throw error
    if (!data?.length) return res.status(403).json({ error: 'Access denied' })
    res.json(data[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/units/:id
router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let lookup = db().from('units').select('id, property_id').eq('id', req.params.id)
    if (req.account_filter) lookup = lookup.eq('account_id', req.account_filter)
    const { data: unit } = await lookup.single()
    if (!unit) return res.status(403).json({ error: 'Access denied' })

    let q = db().from('units').delete().eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { error } = await q
    if (error) throw error
    await syncPropertyUnitCount(unit.property_id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router

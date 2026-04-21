const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId, verifyForeignKey } = require('../middleware/permissions')

const db = () => supabaseAdmin

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.construction !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

async function verifyProjectOwnership(projectId, accountFilter) {
  if (!accountFilter) return true
  const { data } = await db().from('construction_projects').select('id').eq('id', projectId).eq('account_id', accountFilter).single()
  return !!data
}

async function verifyPhaseOwnership(phaseId, accountFilter) {
  if (!accountFilter) return true
  const { data: phase } = await db().from('construction_phases').select('project_id').eq('id', phaseId).single()
  if (!phase) return false
  return verifyProjectOwnership(phase.project_id, accountFilter)
}

router.get('/', async (req, res) => {
  try {
    let query = db()
      .from('construction_projects')
      .select(`*, properties(address, city), contractors(name, trade), construction_phases(*)`)
      .order('created_at', { ascending: false })
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
    let query = db()
      .from('construction_projects')
      .select(`*, properties(address, city), contractors(name, trade, phone), construction_phases(*)`)
      .eq('id', req.params.id)
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
    const { phases, ...rawFields } = req.body || {}
    const projectFields = stripAccountId(rawFields)
    projectFields.account_id = req.user.account_id

    if (req.account_filter) {
      if (projectFields.property_id && !(await verifyForeignKey(db(), 'properties', projectFields.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
      if (projectFields.contractor_id && !(await verifyForeignKey(db(), 'contractors', projectFields.contractor_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid contractor reference.' })
      }
    }

    const { data, error } = await db().from('construction_projects').insert([projectFields]).select()
    if (error) throw error
    const project = data[0]

    if (Array.isArray(phases) && phases.length > 0) {
      const rows = phases
        .filter(name => typeof name === 'string' && name.trim())
        .map(name => ({ project_id: project.id, name, completion_pct: 0, budget: 0 }))
      if (rows.length > 0) {
        const { error: phaseErr } = await db().from('construction_phases').insert(rows)
        if (phaseErr) {
          await db().from('construction_phases').delete().eq('project_id', project.id)
          await db().from('construction_projects').delete().eq('id', project.id)
          throw new Error('Failed to create standard phases: ' + phaseErr.message)
        }
      }
    }

    res.json(project)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const updates = stripAccountId(req.body)
    if (req.account_filter) {
      if (updates.property_id && !(await verifyForeignKey(db(), 'properties', updates.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
      if (updates.contractor_id && !(await verifyForeignKey(db(), 'contractors', updates.contractor_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid contractor reference.' })
      }
    }
    let updQuery = db().from('construction_projects').update(updates).eq('id', req.params.id)
    if (req.account_filter) updQuery = updQuery.eq('account_id', req.account_filter)
    const { data, error } = await updQuery.select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    await db().from('construction_phases').delete().eq('project_id', req.params.id)
    let delQuery = db().from('construction_projects').delete().eq('id', req.params.id)
    if (req.account_filter) delQuery = delQuery.eq('account_id', req.account_filter)
    const { error } = await delQuery
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/phases', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const phaseData = stripAccountId(req.body)
    const { data, error } = await db()
      .from('construction_phases')
      .insert([{ ...phaseData, project_id: req.params.id }])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/phases/:id', requireEdit, async (req, res) => {
  try {
    if (!(await verifyPhaseOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const updates = stripAccountId(req.body)
    const { data, error } = await db().from('construction_phases').update(updates).eq('id', req.params.id).select()
    if (error) throw error
    const phase = data[0]
    const { data: allPhases } = await db().from('construction_phases').select('completion_pct').eq('project_id', phase.project_id)
    const avgPct = allPhases && allPhases.length
      ? Math.round(allPhases.reduce((s, p) => s + (p.completion_pct || 0), 0) / allPhases.length)
      : 0
    await db().from('construction_projects').update({ overall_pct: avgPct }).eq('id', phase.project_id)
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/phases/:id', requireEdit, async (req, res) => {
  try {
    if (!(await verifyPhaseOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const { error } = await db().from('construction_phases').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/expenses', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const { type, amount, vendor } = req.body
    const amt = parseFloat(amount) || 0
    const { data: proj, error: pErr } = await db().from('construction_projects').select('*').eq('id', req.params.id).single()
    if (pErr) throw pErr
    const classification = type === 'labor' ? 'construction_labor' : type === 'material' ? 'construction_material' : 'construction_other'
    if (proj.property_id) {
      await db().from('invoices').insert([{
        property_id: proj.property_id,
        vendor: vendor || 'Unknown',
        amount: amt,
        classification,
        account_id: req.user.account_id,
      }])
    }
    const update = {}
    if (type === 'labor') update.labor_spent = (parseFloat(proj.labor_spent) || 0) + amt
    if (type === 'material') update.material_spent = (parseFloat(proj.material_spent) || 0) + amt
    if (Object.keys(update).length > 0) {
      await db().from('construction_projects').update(update).eq('id', req.params.id)
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

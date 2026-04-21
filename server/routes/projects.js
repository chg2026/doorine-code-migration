const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId, verifyForeignKey } = require('../middleware/permissions')

const db = () => supabaseAdmin

const PROJECT_FIELDS = [
  'name', 'description', 'status',
  'property_id', 'unit_id', 'contractor_id',
  'start_date', 'target_completion',
  'labor_budget', 'material_budget',
  'labor_spent', 'material_spent',
  'overall_pct',
  'agreement_url', 'w9_url', 'insurance_url',
]

const PHASE_FIELDS = [
  'name', 'contractor_id', 'status',
  'labor_budget', 'materials_budget',
  'labor_spent', 'materials_spent',
  'completion_pct', 'budget',
  'estimated_start', 'estimated_completion',
  'payment_approved', 'checklist_complete',
  'notes', 'sort_order',
]

function pick(body, allowed) {
  const stripped = stripAccountId(body || {})
  const out = {}
  for (const k of allowed) {
    if (stripped[k] === undefined) continue
    let v = stripped[k]
    if (v === '') v = null
    out[k] = v
  }
  return out
}

function cleanProject(body) {
  const out = pick(body, PROJECT_FIELDS)
  ;['labor_budget', 'material_budget', 'labor_spent', 'material_spent'].forEach(k => {
    if (out[k] != null) {
      const n = parseFloat(out[k])
      out[k] = Number.isFinite(n) ? n : 0
    }
  })
  if (out.overall_pct != null) {
    const n = parseInt(out.overall_pct, 10)
    out.overall_pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
  }
  return out
}

function cleanPhase(body) {
  const out = pick(body, PHASE_FIELDS)
  ;['labor_budget', 'materials_budget', 'labor_spent', 'materials_spent', 'budget'].forEach(k => {
    if (out[k] != null) {
      const n = parseFloat(out[k])
      out[k] = Number.isFinite(n) ? n : 0
    }
  })
  if (out.completion_pct != null) {
    const n = parseInt(out.completion_pct, 10)
    out.completion_pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
  }
  ;['payment_approved', 'checklist_complete'].forEach(k => {
    if (out[k] != null) out[k] = !!out[k]
  })
  return out
}

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

async function getPhaseProjectId(phaseId, accountFilter) {
  const { data: phase } = await db().from('construction_phases').select('project_id').eq('id', phaseId).single()
  if (!phase) return null
  if (accountFilter) {
    const ok = await verifyProjectOwnership(phase.project_id, accountFilter)
    if (!ok) return null
  }
  return phase.project_id
}

async function rollupProjectCompletion(projectId) {
  const { data: phases } = await db().from('construction_phases').select('completion_pct').eq('project_id', projectId)
  const list = phases || []
  const avg = list.length ? Math.round(list.reduce((s, p) => s + (Number(p.completion_pct) || 0), 0) / list.length) : 0
  await db().from('construction_projects').update({ overall_pct: avg }).eq('id', projectId)
  return avg
}

async function verifyProjectFKs(updates, accountFilter) {
  if (!accountFilter) return null
  if (updates.property_id && !(await verifyForeignKey(db(), 'properties', updates.property_id, accountFilter))) {
    return 'Invalid property reference.'
  }
  if (updates.unit_id && !(await verifyForeignKey(db(), 'units', updates.unit_id, accountFilter))) {
    return 'Invalid unit reference.'
  }
  if (updates.contractor_id && !(await verifyForeignKey(db(), 'contractors', updates.contractor_id, accountFilter))) {
    return 'Invalid contractor reference.'
  }
  return null
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    let query = db()
      .from('construction_projects')
      .select(`*, properties(id, name, address, street, city), units(id, label), contractors(id, name, trade), construction_phases(id, name, completion_pct, status)`)
      .order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    let query = db()
      .from('construction_projects')
      .select(`*,
        properties(id, name, address, street, city, state, zip),
        units(id, label),
        contractors(id, name, trade, phone, email, company_name),
        construction_phases(*, contractors(id, name))`)
      .eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.single()
    if (error) throw error
    if (Array.isArray(data?.construction_phases)) {
      data.construction_phases.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireEdit, async (req, res) => {
  try {
    const { phases, ...rawFields } = req.body || {}
    const projectFields = cleanProject(rawFields)
    if (!projectFields.name) return res.status(400).json({ error: 'Project name is required.' })
    projectFields.account_id = req.user.account_id
    if (req.user?.id) projectFields.created_by = req.user.id

    const fkErr = await verifyProjectFKs(projectFields, req.account_filter)
    if (fkErr) return res.status(400).json({ error: fkErr })

    const { data, error } = await db().from('construction_projects').insert([projectFields]).select()
    if (error) throw error
    const project = data[0]

    if (Array.isArray(phases) && phases.length > 0) {
      const rows = phases
        .map((ph, idx) => {
          const name = typeof ph === 'string' ? ph : ph?.name
          if (!name || !String(name).trim()) return null
          const fields = typeof ph === 'string'
            ? { name: ph, sort_order: idx }
            : { ...cleanPhase(ph), sort_order: ph.sort_order ?? idx }
          return { project_id: project.id, ...fields }
        })
        .filter(Boolean)

      if (req.account_filter) {
        for (const row of rows) {
          if (row.contractor_id && !(await verifyForeignKey(db(), 'contractors', row.contractor_id, req.account_filter))) {
            await db().from('construction_projects').delete().eq('id', project.id)
            return res.status(400).json({ error: `Invalid contractor reference on phase "${row.name}".` })
          }
        }
      }

      if (rows.length > 0) {
        const { error: phaseErr } = await db().from('construction_phases').insert(rows)
        if (phaseErr) {
          await db().from('construction_phases').delete().eq('project_id', project.id)
          await db().from('construction_projects').delete().eq('id', project.id)
          throw new Error('Failed to create phases: ' + phaseErr.message)
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
    const updates = cleanProject(req.body)
    const fkErr = await verifyProjectFKs(updates, req.account_filter)
    if (fkErr) return res.status(400).json({ error: fkErr })

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

// ─── PHASES ──────────────────────────────────────────────────────────────────

router.get('/:id/phases', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const { data, error } = await db()
      .from('construction_phases')
      .select('*, contractors(id, name)')
      .eq('project_id', req.params.id)
      .order('sort_order', { ascending: true })
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/phases', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const phaseData = cleanPhase(req.body)
    if (!phaseData.name || !String(phaseData.name).trim()) {
      return res.status(400).json({ error: 'Phase name is required.' })
    }
    if (req.account_filter && phaseData.contractor_id) {
      if (!(await verifyForeignKey(db(), 'contractors', phaseData.contractor_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid contractor reference.' })
      }
    }
    if (phaseData.sort_order == null) {
      const { count } = await db().from('construction_phases').select('id', { count: 'exact', head: true }).eq('project_id', req.params.id)
      phaseData.sort_order = count || 0
    }
    const { data, error } = await db()
      .from('construction_phases')
      .insert([{ ...phaseData, project_id: req.params.id }])
      .select('*, contractors(id, name)')
    if (error) throw error
    await rollupProjectCompletion(req.params.id)
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/phases/:id', requireEdit, async (req, res) => {
  try {
    const projectId = await getPhaseProjectId(req.params.id, req.account_filter)
    if (!projectId) return res.status(403).json({ error: 'Access denied.' })

    const updates = cleanPhase(req.body)
    if (req.account_filter && updates.contractor_id) {
      if (!(await verifyForeignKey(db(), 'contractors', updates.contractor_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid contractor reference.' })
      }
    }
    const { data, error } = await db()
      .from('construction_phases')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, contractors(id, name)')
    if (error) throw error
    await rollupProjectCompletion(projectId)
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/phases/:id', requireEdit, async (req, res) => {
  try {
    const projectId = await getPhaseProjectId(req.params.id, req.account_filter)
    if (!projectId) return res.status(403).json({ error: 'Access denied.' })

    const { error } = await db().from('construction_phases').delete().eq('id', req.params.id)
    if (error) throw error
    await rollupProjectCompletion(projectId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Bulk add phases (e.g. from master library multi-select)
router.post('/:id/phases/bulk', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const items = Array.isArray(req.body?.phases) ? req.body.phases : []
    if (items.length === 0) return res.json([])

    const { count } = await db().from('construction_phases').select('id', { count: 'exact', head: true }).eq('project_id', req.params.id)
    const baseOrder = count || 0

    const rows = items
      .map((ph, idx) => {
        const name = typeof ph === 'string' ? ph : ph?.name
        if (!name || !String(name).trim()) return null
        const fields = typeof ph === 'string' ? { name } : cleanPhase(ph)
        return { project_id: req.params.id, sort_order: baseOrder + idx, ...fields }
      })
      .filter(Boolean)

    if (rows.length === 0) return res.json([])

    if (req.account_filter) {
      for (const row of rows) {
        if (row.contractor_id && !(await verifyForeignKey(db(), 'contractors', row.contractor_id, req.account_filter))) {
          return res.status(400).json({ error: `Invalid contractor reference on phase "${row.name}".` })
        }
      }
    }

    const { data, error } = await db().from('construction_phases').insert(rows).select('*, contractors(id, name)')
    if (error) throw error
    await rollupProjectCompletion(req.params.id)
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── EXPENSES (legacy quick-log; full invoice flow lives in invoices route) ──

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
        project_id: proj.id,
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

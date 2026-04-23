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

// ─── LOOKUPS (construction-scoped selectors so construction-only users can
// populate the project form without needing property_management access) ──────

router.get('/lookups/properties', async (req, res) => {
  try {
    let q = db().from('properties').select('id, name, address, street, city, status').order('name', { ascending: true })
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/lookups/contractors', async (req, res) => {
  try {
    let q = db().from('contractors').select('id, name, trade, company_name').order('name', { ascending: true })
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/lookups/units', async (req, res) => {
  try {
    if (!req.query.property_id) return res.json([])
    if (req.account_filter) {
      const ok = await verifyForeignKey(db(), 'properties', req.query.property_id, req.account_filter)
      if (!ok) return res.status(403).json({ error: 'Access denied.' })
    }
    const { data, error } = await db().from('units').select('id, label, sort_order')
      .eq('property_id', req.query.property_id)
      .order('sort_order', { ascending: true })
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

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
    projectFields.account_id = req.account_filter || req.user.account_id
    if (req.user?.id) projectFields.created_by = req.user.id

    const fkErr = await verifyProjectFKs(projectFields, req.account_filter)
    if (fkErr) return res.status(400).json({ error: fkErr })

    const { data, error } = await db().from('construction_projects').insert([projectFields]).select()
    if (error) throw error
    const project = data[0]
    await logActivity(project.id, project.account_id, req.user?.id, 'project_created',
      `Project "${project.name}" created.`, { status: project.status })

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

    // Snapshot old values to emit precise activity (target date / budget bumps).
    const { data: prev } = await db().from('construction_projects')
      .select('target_completion, labor_budget, material_budget, status, name, account_id')
      .eq('id', req.params.id).single()

    let updQuery = db().from('construction_projects').update(updates).eq('id', req.params.id)
    if (req.account_filter) updQuery = updQuery.eq('account_id', req.account_filter)
    const { data, error } = await updQuery.select()
    if (error) throw error
    const next = data[0]

    if (prev && next) {
      const acct = prev.account_id
      const events = []
      if (updates.target_completion !== undefined && prev.target_completion !== next.target_completion) {
        events.push(['delivery_date_changed',
          `Target completion changed from ${prev.target_completion || '—'} to ${next.target_completion || '—'}.`])
      }
      const oldBudget = (Number(prev.labor_budget) || 0) + (Number(prev.material_budget) || 0)
      const newBudget = (Number(next.labor_budget) || 0) + (Number(next.material_budget) || 0)
      if (oldBudget !== newBudget) {
        events.push(['budget_updated',
          `Total budget changed from $${oldBudget.toLocaleString()} to $${newBudget.toLocaleString()}.`])
      }
      if (updates.status !== undefined && prev.status !== next.status) {
        events.push(['status_changed', `Status changed from "${prev.status || 'planning'}" to "${next.status}".`])
      }
      const docMap = { agreement_url: 'Agreement', w9_url: 'W-9', insurance_url: 'Insurance' }
      for (const k of Object.keys(docMap)) {
        if (updates[k] !== undefined && updates[k]) {
          events.push(['document_uploaded', `${docMap[k]} document uploaded.`])
        }
      }
      for (const [type, desc] of events) {
        await logActivity(req.params.id, acct, req.user?.id, type, desc)
      }
    }
    res.json(next)
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
    const { data: prev } = await db().from('construction_phases')
      .select('completion_pct, status, name').eq('id', req.params.id).single()
    const { data, error } = await db()
      .from('construction_phases')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, contractors(id, name)')
    if (error) throw error
    const newPct = await rollupProjectCompletion(projectId)
    const { data: proj } = await db().from('construction_projects').select('account_id').eq('id', projectId).single()
    if (prev && proj && updates.completion_pct !== undefined && Number(prev.completion_pct || 0) !== Number(updates.completion_pct)) {
      await logActivity(projectId, proj.account_id, req.user?.id, 'completion_updated',
        `Phase "${prev.name}" updated to ${updates.completion_pct}%. Project now ${newPct}%.`)
    }
    if (prev && proj && updates.status && prev.status !== updates.status) {
      await logActivity(projectId, proj.account_id, req.user?.id, 'phase_status_changed',
        `Phase "${prev.name}" marked ${String(updates.status).replace(/_/g, ' ')}.`)
    }
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

// ─── INVOICES (project-scoped; FinancePage still uses /api/invoices) ────────
//
// Categories:
//   labor      → rolls into project.labor_spent + phase.labor_spent
//   materials  → rolls into project.material_spent + phase.materials_spent
//   equipment | permits | other  → tracked but not auto-rolled into spent totals
//
// Storage column on invoices.classification mirrors category prefixed with
// "construction_" for back-compat with the existing FinancePage list.

const INVOICE_CATEGORIES = ['labor', 'materials', 'equipment', 'permits', 'other']

function classificationFor(category) {
  switch (category) {
    case 'labor':     return 'construction_labor'
    case 'materials': return 'construction_material'
    case 'equipment': return 'construction_equipment'
    case 'permits':   return 'construction_permits'
    default:          return 'construction_other'
  }
}

async function recalcProjectSpent(projectId) {
  // Resolve owning account once so every read/write is tenant-scoped.
  const { data: proj } = await db().from('construction_projects')
    .select('id, account_id').eq('id', projectId).single()
  if (!proj) return
  const accountId = proj.account_id

  const { data: phases } = await db().from('construction_phases')
    .select('id').eq('project_id', projectId)
  const phaseIds = (phases || []).map(p => p.id)

  // ONE aggregate read for the whole project — eliminates the N+1.
  const { data: rows } = await db().from('invoices')
    .select('amount, category, phase_id')
    .eq('project_id', projectId)
    .eq('account_id', accountId)

  const perPhase = new Map() // phaseId -> { labor, mats }
  let pLabor = 0, pMats = 0
  for (const r of rows || []) {
    const a = Number(r.amount) || 0
    if (r.category === 'labor') pLabor += a
    else if (r.category === 'materials') pMats += a
    if (r.phase_id) {
      const cur = perPhase.get(r.phase_id) || { labor: 0, mats: 0 }
      if (r.category === 'labor') cur.labor += a
      else if (r.category === 'materials') cur.mats += a
      perPhase.set(r.phase_id, cur)
    }
  }

  // Update phases in parallel — recompute is idempotent so any later
  // invoice mutation on this project triggers another full recalc, so
  // a stale overwrite is self-healing on the next write.
  await Promise.all(phaseIds.map(phId => {
    const v = perPhase.get(phId) || { labor: 0, mats: 0 }
    return db().from('construction_phases')
      .update({ labor_spent: v.labor, materials_spent: v.mats })
      .eq('id', phId)
      .eq('project_id', projectId)
  }))

  await db().from('construction_projects')
    .update({ labor_spent: pLabor, material_spent: pMats })
    .eq('id', projectId)
    .eq('account_id', accountId)
}

async function logActivity(projectId, accountId, userId, eventType, description, metadata = {}) {
  try {
    await db().from('project_activity').insert([{
      project_id: projectId, account_id: accountId, event_type: eventType,
      description, metadata, created_by: userId || null,
    }])
  } catch { /* best effort — never block the user-facing op on audit-log writes */ }
}

router.get('/:id/invoices', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    let listQ = db().from('invoices')
      .select('*, construction_phases(id, name)')
      .eq('project_id', req.params.id)
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (req.account_filter) listQ = listQ.eq('account_id', req.account_filter)
    const { data, error } = await listQ
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/invoices', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const body = stripAccountId(req.body || {})
    const category = INVOICE_CATEGORIES.includes(body.category) ? body.category : 'other'
    const amount = parseFloat(body.amount) || 0

    // Validate phase ownership
    let phaseId = body.phase_id || null
    if (phaseId) {
      const owned = await getPhaseProjectId(phaseId, req.account_filter)
      if (owned !== req.params.id) return res.status(400).json({ error: 'Phase does not belong to this project.' })
    }

    const { data: proj } = await db().from('construction_projects').select('account_id, property_id').eq('id', req.params.id).single()

    const row = {
      account_id: req.account_filter || proj?.account_id,
      project_id: req.params.id,
      property_id: proj?.property_id || null,
      phase_id: phaseId,
      vendor: (body.vendor || '').trim() || 'Unknown',
      amount,
      invoice_date: body.invoice_date || null,
      invoice_number: body.invoice_number || null,
      category,
      classification: classificationFor(category),
      notes: body.notes || null,
      file_url: body.file_url || null,
      submitted_by: req.user?.id || null,
    }
    const { data, error } = await db().from('invoices').insert([row]).select('*, construction_phases(id, name)').single()
    if (error) throw error

    await recalcProjectSpent(req.params.id)
    await logActivity(req.params.id, row.account_id, req.user?.id, 'invoice_logged',
      `Invoice ${row.invoice_number ? '#' + row.invoice_number + ' ' : ''}from ${row.vendor} ($${amount.toLocaleString()}) logged.`,
      { invoice_id: data.id, category, amount })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/invoices/:id', requireEdit, async (req, res) => {
  try {
    let q = db().from('invoices').select('*').eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data: existing } = await q.single()
    if (!existing) return res.status(403).json({ error: 'Access denied.' })

    const body = stripAccountId(req.body || {})
    const updates = {}
    if (body.vendor !== undefined) updates.vendor = body.vendor || null
    if (body.amount !== undefined) updates.amount = parseFloat(body.amount) || 0
    if (body.invoice_date !== undefined) updates.invoice_date = body.invoice_date || null
    if (body.invoice_number !== undefined) updates.invoice_number = body.invoice_number || null
    if (body.notes !== undefined) updates.notes = body.notes || null
    if (body.file_url !== undefined) updates.file_url = body.file_url || null
    if (body.category !== undefined && INVOICE_CATEGORIES.includes(body.category)) {
      updates.category = body.category
      updates.classification = classificationFor(body.category)
    }
    if (body.phase_id !== undefined) {
      if (body.phase_id) {
        const owned = await getPhaseProjectId(body.phase_id, req.account_filter)
        if (owned !== existing.project_id) return res.status(400).json({ error: 'Phase does not belong to this project.' })
        updates.phase_id = body.phase_id
      } else {
        updates.phase_id = null
      }
    }

    const { data, error } = await db().from('invoices').update(updates).eq('id', req.params.id)
      .select('*, construction_phases(id, name)').single()
    if (error) throw error

    if (existing.project_id) await recalcProjectSpent(existing.project_id)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/invoices/:id', requireEdit, async (req, res) => {
  try {
    let q = db().from('invoices').select('id, project_id, account_id').eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data: existing } = await q.single()
    if (!existing) return res.status(403).json({ error: 'Access denied.' })

    const { error } = await db().from('invoices').delete().eq('id', req.params.id)
    if (error) throw error
    if (existing.project_id) await recalcProjectSpent(existing.project_id)
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
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

// ─── NOTES ───────────────────────────────────────────────────────────────────

const NOTE_TYPES = ['note', 'update', 'reminder', 'issue', 'meeting']
const VISIBILITIES = ['all', 'admin']

function isAdminish(req) {
  return !!(req.user?.is_super_admin || req.user?.is_account_admin)
}

// Hydrate user_profiles for a list of rows that have a `created_by` UUID.
// project_notes/project_activity reference auth.users which Supabase REST
// can't auto-join, so we fetch profiles in one extra query and stitch them in.
async function attachAuthors(rows, accountFilter) {
  const ids = [...new Set((rows || []).map(r => r.created_by).filter(Boolean))]
  if (ids.length === 0) return rows
  let pq = db().from('user_profiles').select('id, email, full_name').in('id', ids)
  if (accountFilter) pq = pq.eq('account_id', accountFilter)
  const { data: profiles } = await pq
  const byId = new Map((profiles || []).map(p => [p.id, p]))
  return (rows || []).map(r => ({ ...r, author: byId.get(r.created_by) || null }))
}

router.get('/:id/notes', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    let q = db().from('project_notes').select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false })
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    if (!isAdminish(req)) q = q.eq('visibility', 'all')
    const { data, error } = await q
    if (error) throw error
    res.json(await attachAuthors(data, req.account_filter))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/notes', requireEdit, async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    const body = stripAccountId(req.body || {})
    const content = (body.content || '').trim()
    if (!content) return res.status(400).json({ error: 'Note content is required.' })
    const note_type  = NOTE_TYPES.includes(body.note_type) ? body.note_type : 'note'
    const visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : 'all'

    const { data: proj } = await db().from('construction_projects').select('account_id').eq('id', req.params.id).single()
    const accountId = req.account_filter || proj?.account_id
    const row = {
      project_id: req.params.id, account_id: accountId,
      content, note_type, visibility, created_by: req.user?.id || null,
    }
    const { data, error } = await db().from('project_notes').insert([row]).select('*').single()
    if (error) throw error
    const [hydrated] = await attachAuthors([data], req.account_filter)
    res.json(hydrated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/notes/:id', requireEdit, async (req, res) => {
  try {
    let q = db().from('project_notes').select('*').eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data: existing } = await q.single()
    if (!existing) return res.status(403).json({ error: 'Access denied.' })
    // Only the author may edit (admins delete; edits stay author-only to keep
    // an honest paper trail that nobody silently rewrote someone else's note).
    if (existing.created_by !== req.user?.id) {
      return res.status(403).json({ error: 'Only the author can edit this note.' })
    }
    const body = stripAccountId(req.body || {})
    const updates = {}
    if (body.content !== undefined) {
      const c = (body.content || '').trim()
      if (!c) return res.status(400).json({ error: 'Note content is required.' })
      updates.content = c
    }
    if (body.note_type !== undefined && NOTE_TYPES.includes(body.note_type)) updates.note_type = body.note_type
    if (body.visibility !== undefined && VISIBILITIES.includes(body.visibility)) updates.visibility = body.visibility
    const { data, error } = await db().from('project_notes').update(updates).eq('id', req.params.id).select('*').single()
    if (error) throw error
    const [hydrated] = await attachAuthors([data], req.account_filter)
    res.json(hydrated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/notes/:id', requireEdit, async (req, res) => {
  try {
    let q = db().from('project_notes').select('*').eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data: existing } = await q.single()
    if (!existing) return res.status(403).json({ error: 'Access denied.' })
    if (existing.created_by !== req.user?.id && !isAdminish(req)) {
      return res.status(403).json({ error: 'Only the author or an admin can delete this note.' })
    }
    const { error } = await db().from('project_notes').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── ACTIVITY (read-only) ────────────────────────────────────────────────────

router.get('/:id/activity', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.account_filter))) {
      return res.status(403).json({ error: 'Access denied.' })
    }
    let q = db().from('project_activity').select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q
    if (error) throw error
    res.json(await attachAuthors(data, req.account_filter))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.logActivity = logActivity
module.exports = router

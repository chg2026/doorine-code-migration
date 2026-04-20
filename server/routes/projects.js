const express = require('express')
const router = express.Router()
const supabase = require('../db')

const dbCheck = (res) => {
  if (!supabase) { res.status(503).json({ error: 'Database not configured.' }); return false; }
  return true;
}

// Get all projects with phases + relations
router.get('/', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_projects')
      .select(`*, properties(address, city), contractors(name, trade), construction_phases(*)`)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get single project
router.get('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_projects')
      .select(`*, properties(address, city), contractors(name, trade, phone), construction_phases(*)`)
      .eq('id', req.params.id)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Create project — optionally with a list of standard phases to create atomically.
// Body: { ...projectFields, phases?: ["Demolition","Framing",...] }
// If any phase insert fails, the just-created project is rolled back so the
// client never sees a project with a partial phase list.
router.post('/', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { phases, ...projectFields } = req.body || {}

    const { data, error } = await supabase
      .from('construction_projects')
      .insert([projectFields])
      .select()
    if (error) throw error
    const project = data[0]

    if (Array.isArray(phases) && phases.length > 0) {
      const rows = phases
        .filter(name => typeof name === 'string' && name.trim())
        .map(name => ({ project_id: project.id, name, completion_pct: 0, budget: 0 }))

      if (rows.length > 0) {
        const { error: phaseErr } = await supabase
          .from('construction_phases')
          .insert(rows)
        if (phaseErr) {
          // Roll back: delete any phases that did make it in, then the project itself
          await supabase.from('construction_phases').delete().eq('project_id', project.id)
          await supabase.from('construction_projects').delete().eq('id', project.id)
          throw new Error('Failed to create standard phases: ' + phaseErr.message)
        }
      }
    }

    res.json(project)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update project
router.put('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_projects')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete project — cascades phases first to avoid FK violations
router.delete('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    // Remove all child phases before deleting the project
    const { error: phaseErr } = await supabase
      .from('construction_phases')
      .delete()
      .eq('project_id', req.params.id)
    if (phaseErr) throw phaseErr

    const { error } = await supabase
      .from('construction_projects')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Add phase to project
router.post('/:id/phases', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_phases')
      .insert([{ ...req.body, project_id: req.params.id }])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update phase — MUST come before DELETE /phases/:id
router.put('/phases/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_phases')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error

    const phase = data[0]
    const { data: allPhases } = await supabase
      .from('construction_phases')
      .select('completion_pct')
      .eq('project_id', phase.project_id)

    const avgPct = allPhases && allPhases.length
      ? Math.round(allPhases.reduce((s, p) => s + (p.completion_pct || 0), 0) / allPhases.length)
      : 0

    await supabase
      .from('construction_projects')
      .update({ overall_pct: avgPct })
      .eq('id', phase.project_id)

    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete phase — MUST come before DELETE /:id
router.delete('/phases/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { error } = await supabase
      .from('construction_phases')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Log expense for a project (creates invoice + updates project spent totals)
router.post('/:id/expenses', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { type, amount, vendor } = req.body
    const amt = parseFloat(amount) || 0

    const { data: proj, error: pErr } = await supabase
      .from('construction_projects')
      .select('*')
      .eq('id', req.params.id)
      .single()
    if (pErr) throw pErr

    const classification = type === 'labor'
      ? 'construction_labor'
      : type === 'material'
      ? 'construction_material'
      : 'construction_other'

    if (proj.property_id) {
      await supabase.from('invoices').insert([{
        property_id: proj.property_id,
        vendor: vendor || 'Unknown',
        amount: amt,
        classification,
      }])
    }

    const update = {}
    if (type === 'labor')    update.labor_spent    = (parseFloat(proj.labor_spent)    || 0) + amt
    if (type === 'material') update.material_spent = (parseFloat(proj.material_spent) || 0) + amt

    if (Object.keys(update).length > 0) {
      await supabase.from('construction_projects').update(update).eq('id', req.params.id)
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

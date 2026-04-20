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

// Create project
router.post('/', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('construction_projects')
      .insert([req.body])
      .select()
    if (error) throw error
    res.json(data[0])
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

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
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

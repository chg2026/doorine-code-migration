const express = require('express')
const router = express.Router()
const supabase = require('../db')

// Get all projects with property info
router.get('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_projects')
      .select(`
        *,
        properties(address, city),
        contractors(name, trade),
        construction_phases(*)
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single project with all phases
router.get('/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_projects')
      .select(`
        *,
        properties(address, city),
        contractors(name, trade, phone),
        construction_phases(*)
      `)
      .eq('id', req.params.id)
      .single()
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create project
router.post('/', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_projects')
      .insert([req.body])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update project
router.put('/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_projects')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Add phase to project
router.post('/:id/phases', async (req, res) => {
  try {
    const phaseData = {
      ...req.body,
      project_id: req.params.id
    }
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_phases')
      .insert([phaseData])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update phase
router.put('/phases/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY." });
    const { data, error } = await supabase
      .from('construction_phases')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error

    // Recalculate overall project completion
    const phase = data[0]
    const { data: allPhases } = await supabase
      .from('construction_phases')
      .select('completion_pct')
      .eq('project_id', phase.project_id)

    const avgPct = Math.round(
      allPhases.reduce((sum, p) => sum + p.completion_pct, 0) / allPhases.length
    )

    await supabase
      .from('construction_projects')
      .update({ overall_pct: avgPct })
      .eq('id', phase.project_id)

    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
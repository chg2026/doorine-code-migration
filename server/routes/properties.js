const express = require('express')
const router = express.Router()
const supabase = require('../db')

const dbCheck = (res) => {
  if (!supabase) { res.status(503).json({ error: 'Database not configured.' }); return false; }
  return true;
}

// Sanitize incoming property data — empty strings break Postgres date/numeric columns,
// and we keep `type` and `property_type` in sync since both columns exist in the DB.
function clean(body) {
  const out = {};
  for (const k of Object.keys(body || {})) {
    out[k] = body[k] === '' ? null : body[k];
  }
  if (out.type && !out.property_type) out.property_type = out.type;
  if (out.property_type && !out.type) out.type = out.property_type;
  return out;
}

// Get all properties
router.get('/', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single property
router.get('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .single()
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create property
router.post('/', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('properties')
      .insert([clean(req.body)])
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update property
router.put('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { data, error } = await supabase
      .from('properties')
      .update(clean(req.body))
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete property — cascade dependents manually so FK constraints don't block.
// For projects, also delete their child phases first.
router.delete('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const propertyId = req.params.id

    // 1. Find any construction projects on this property and delete their phases first
    const { data: projs } = await supabase
      .from('construction_projects')
      .select('id')
      .eq('property_id', propertyId)
    const projIds = (projs || []).map(p => p.id)
    if (projIds.length) {
      await supabase.from('construction_phases').delete().in('project_id', projIds)
      await supabase.from('construction_projects').delete().in('id', projIds)
    }

    // 2. Delete dependent rows in tables that reference properties (best-effort).
    //    Each call is fire-and-forget — missing tables won't block the property delete.
    await Promise.all([
      supabase.from('invoices').delete().eq('property_id', propertyId),
      supabase.from('tenants').delete().eq('property_id', propertyId),
      supabase.from('property_tasks').delete().eq('property_id', propertyId),
    ].map(p => p.then(() => null, () => null)))

    // 3. Finally delete the property itself
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

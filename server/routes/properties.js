const express = require('express')
const router = express.Router()
const supabase = require('../db')

const dbCheck = (res) => {
  if (!supabase) { res.status(503).json({ error: 'Database not configured.' }); return false; }
  return true;
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
      .insert([req.body])
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
      .update(req.body)
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete property
router.delete('/:id', async (req, res) => {
  try {
    if (!dbCheck(res)) return
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

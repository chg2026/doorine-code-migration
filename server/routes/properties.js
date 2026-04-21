const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')

const db = () => supabaseAdmin

function clean(body) {
  const out = {};
  const skip = ['account_filter'];
  for (const k of Object.keys(body || {})) {
    if (skip.includes(k)) continue;
    out[k] = body[k] === '' ? null : body[k];
  }
  if (out.type && !out.property_type) out.property_type = out.type;
  if (out.property_type && !out.type) out.type = out.property_type;
  return out;
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

router.post('/', async (req, res) => {
  try {
    const row = clean(req.body)
    row.account_id = req.user.account_id
    const { data, error } = await db().from('properties').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    let query = db().from('properties').update(clean(req.body)).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const propertyId = req.params.id
    const { data: projs } = await db()
      .from('construction_projects').select('id').eq('property_id', propertyId)
    const projIds = (projs || []).map(p => p.id)
    if (projIds.length) {
      await db().from('construction_phases').delete().in('project_id', projIds)
      await db().from('construction_projects').delete().in('id', projIds)
    }
    await Promise.all([
      db().from('invoices').delete().eq('property_id', propertyId),
      db().from('tenants').delete().eq('property_id', propertyId),
      db().from('recurring_tasks').delete().eq('property_id', propertyId),
    ].map(p => p.then(() => null, () => null)))
    let query = db().from('properties').delete().eq('id', propertyId)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { error } = await query
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

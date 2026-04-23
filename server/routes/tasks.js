const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId, verifyForeignKey } = require('../middleware/permissions')

const db = () => supabaseAdmin

const TYPES = ['task', 'reminder']

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.tasks !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('recurring_tasks')
      .select('*, properties(address), construction_projects(id, name)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    if (req.query.project_id) query = query.eq('project_id', req.query.project_id)
    if (req.query.assigned_to) query = query.eq('assigned_to', req.query.assigned_to)
    if (req.query.type) query = query.eq('type', req.query.type)
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireEdit, async (req, res) => {
  try {
    const body = stripAccountId(req.body || {})
    const name = (body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Name is required.' })
    const type = TYPES.includes(body.type) ? body.type : 'task'

    if (req.account_filter) {
      if (body.project_id && !(await verifyForeignKey(db(), 'construction_projects', body.project_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid project reference.' })
      }
      if (body.property_id && !(await verifyForeignKey(db(), 'properties', body.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
      if (body.assigned_to && !(await verifyForeignKey(db(), 'user_profiles', body.assigned_to, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid assignee.' })
      }
    }

    const row = {
      account_id: req.account_filter || req.user.account_id,
      name,
      description: body.description || null,
      type,
      status: 'pending',
      due_date: body.due_date || null,
      assigned_to: body.assigned_to || null,
      project_id: body.project_id || null,
      property_id: body.property_id || null,
      source_note_id: body.source_note_id || null,
    }
    const { data, error } = await db().from('recurring_tasks').insert([row])
      .select('*, properties(address), construction_projects(id, name)').single()
    if (error) throw error
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id/complete', requireEdit, async (req, res) => {
  try {
    let query = db().from('recurring_tasks').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    if (!data || data.length === 0) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let query = db().from('recurring_tasks').delete().eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { error } = await query
    if (error) throw error
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lookup of teammates the current user can assign tasks/reminders to.
router.get('/lookups/assignees', async (req, res) => {
  try {
    let q = db().from('user_profiles').select('id, email, full_name').order('full_name', { ascending: true })
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router

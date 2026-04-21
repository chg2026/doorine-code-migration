const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

const CHANGE_TYPES = ['scope', 'budget', 'timeline']

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.construction !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

function canApprove(req) {
  return !!(req.user?.is_super_admin || req.user?.is_account_admin)
}

function requireApprover(req, res, next) {
  if (!canApprove(req)) return res.status(403).json({ error: 'Admin access required to review addendums.' })
  next()
}

async function ensureProjectOwnership(projectId, accountFilter) {
  if (!projectId) return null
  let q = db().from('construction_projects').select('id, account_id, target_completion, labor_budget, material_budget').eq('id', projectId)
  if (accountFilter) q = q.eq('account_id', accountFilter)
  const { data } = await q.single()
  return data || null
}

async function logActivity(projectId, accountId, userId, eventType, description, metadata = {}) {
  try {
    await db().from('project_activity').insert([{
      project_id: projectId, account_id: accountId, event_type: eventType,
      description, metadata, created_by: userId || null,
    }])
  } catch { /* best-effort */ }
}

// List addendums (optionally filter by project_id or status)
router.get('/', async (req, res) => {
  try {
    let q = db().from('addendums').select('*, construction_projects(id, name)').order('created_at', { ascending: false })
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    if (req.query.project_id) q = q.eq('project_id', req.query.project_id)
    if (req.query.status) q = q.eq('status', req.query.status)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Create
router.post('/', requireEdit, async (req, res) => {
  try {
    const body = stripAccountId(req.body || {})
    if (!body.project_id) return res.status(400).json({ error: 'project_id required.' })
    if (!body.title || !String(body.title).trim()) return res.status(400).json({ error: 'Title required.' })

    const project = await ensureProjectOwnership(body.project_id, req.account_filter)
    if (!project) return res.status(403).json({ error: 'Access denied.' })

    const changeTypes = Array.isArray(body.change_types) ? body.change_types.filter(t => CHANGE_TYPES.includes(t)) : []
    const row = {
      project_id: body.project_id,
      account_id: project.account_id,
      title: String(body.title).trim(),
      description: body.description || null,
      change_types: changeTypes,
      budget_delta_labor: parseFloat(body.budget_delta_labor) || 0,
      budget_delta_materials: parseFloat(body.budget_delta_materials) || 0,
      proposed_delivery_date: body.proposed_delivery_date || null,
      document_url: body.document_url || null,
      status: 'pending',
      requested_by: req.user?.id || null,
      request_date: new Date().toISOString(),
    }
    const { data, error } = await db().from('addendums').insert([row]).select().single()
    if (error) throw error

    await logActivity(row.project_id, row.account_id, req.user?.id, 'addendum_requested',
      `Addendum requested: ${row.title}`,
      { addendum_id: data.id, change_types: changeTypes })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Approve / reject (admin only)
router.post('/:id/review', requireApprover, async (req, res) => {
  try {
    const action = req.body?.action
    const comment = (req.body?.comment || '').trim() || null
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject.' })
    if (action === 'reject' && !comment) return res.status(400).json({ error: 'A comment is required when rejecting an addendum.' })

    let q = db().from('addendums').select('*').eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data: addendum } = await q.single()
    if (!addendum) return res.status(404).json({ error: 'Addendum not found.' })
    if (addendum.status !== 'pending') return res.status(400).json({ error: 'Addendum already reviewed.' })

    const reviewedAt = new Date().toISOString()
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const updates = {
      status: newStatus,
      reviewed_by: req.user?.id || null,
      review_date: reviewedAt,
      review_comment: comment,
    }

    // Atomic-claim pattern: only one concurrent reviewer can flip the
    // status away from 'pending'. Whoever wins the conditional UPDATE
    // owns the side-effects (budget + delivery date application).
    const { data: claimed, error: claimErr } = await db()
      .from('addendums').update(updates)
      .eq('id', req.params.id).eq('status', 'pending')
      .select().single()
    if (claimErr || !claimed) {
      return res.status(409).json({ error: 'Addendum was just reviewed by someone else. Refresh to see the latest status.' })
    }

    if (action === 'approve') {
      try {
        const project = await ensureProjectOwnership(addendum.project_id, req.account_filter)
        if (!project) throw new Error('Project access denied.')

        const projUpdates = {}
        const dLabor = Number(addendum.budget_delta_labor) || 0
        const dMats  = Number(addendum.budget_delta_materials) || 0
        if (dLabor !== 0) projUpdates.labor_budget    = (Number(project.labor_budget)    || 0) + dLabor
        if (dMats  !== 0) projUpdates.material_budget = (Number(project.material_budget) || 0) + dMats
        if (addendum.proposed_delivery_date) projUpdates.target_completion = addendum.proposed_delivery_date
        if (Object.keys(projUpdates).length > 0) {
          const { error: pErr } = await db().from('construction_projects').update(projUpdates).eq('id', addendum.project_id)
          if (pErr) throw pErr
        }
      } catch (sideErr) {
        // Roll back the claim so the addendum stays actionable
        await db().from('addendums').update({
          status: 'pending', reviewed_by: null, review_date: null, review_comment: null,
        }).eq('id', req.params.id)
        return res.status(500).json({ error: 'Approval failed: ' + (sideErr.message || sideErr) })
      }
    }

    const data = claimed

    await logActivity(addendum.project_id, addendum.account_id, req.user?.id,
      action === 'approve' ? 'addendum_approved' : 'addendum_rejected',
      `Addendum "${addendum.title}" ${newStatus}${comment ? ': ' + comment : '.'}`,
      { addendum_id: addendum.id, comment })

    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let q = db().from('addendums').delete().eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { error } = await q
    if (error) throw error
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router

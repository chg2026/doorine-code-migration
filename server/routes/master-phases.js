const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

// Anyone with at least view access on construction can read the library.
// Mutations are restricted to super admins or account admins (per spec:
// "Master phase manager (admin-only settings page)").
function canManage(req) {
  return !!(req.user?.is_super_admin || req.user?.is_account_admin)
}

function requireManage(req, res, next) {
  if (!canManage(req)) return res.status(403).json({ error: 'Admin access required to manage the master phase library.' })
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('master_phases').select('*').order('sort_order', { ascending: true })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireManage, async (req, res) => {
  try {
    const body = stripAccountId(req.body || {})
    const name = (body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Phase name is required.' })

    const accountId = req.account_filter || req.user.account_id
    if (!accountId) return res.status(400).json({ error: 'Account context required.' })

    const { count } = await db().from('master_phases').select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    const row = {
      account_id: accountId,
      name,
      sort_order: body.sort_order != null ? parseInt(body.sort_order, 10) || 0 : (count || 0) + 1,
      is_active: body.is_active !== false,
    }
    const { data, error } = await db().from('master_phases').insert([row]).select().single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A phase with that name already exists.' })
      throw error
    }
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireManage, async (req, res) => {
  try {
    const body = stripAccountId(req.body || {})
    const updates = {}
    if (body.name !== undefined) updates.name = String(body.name).trim()
    if (body.sort_order !== undefined) updates.sort_order = parseInt(body.sort_order, 10) || 0
    if (body.is_active !== undefined) updates.is_active = !!body.is_active

    let q = db().from('master_phases').update(updates).eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { data, error } = await q.select()
    if (error) throw error
    if (!data?.length) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireManage, async (req, res) => {
  try {
    let q = db().from('master_phases').delete().eq('id', req.params.id)
    if (req.account_filter) q = q.eq('account_id', req.account_filter)
    const { error } = await q
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

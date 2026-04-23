const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId } = require('../middleware/permissions')

const db = () => supabaseAdmin

const ALLOWED_FIELDS = [
  'name', 'company_name', 'contact_name', 'trade', 'phone', 'email',
  'w9_status', 'w9_url', 'insurance_url', 'insurance_expiry',
  'agreement_signed', 'performance_score', 'notes',
]

function clean(body) {
  const stripped = stripAccountId(body)
  const out = {}
  for (const k of ALLOWED_FIELDS) {
    if (stripped[k] === undefined) continue
    let v = stripped[k]
    if (v === '') v = null
    out[k] = v
  }
  if (out.performance_score != null && out.performance_score !== '') {
    const n = parseInt(out.performance_score, 10)
    out.performance_score = Number.isFinite(n) ? n : null
  }
  if (out.agreement_signed != null) out.agreement_signed = !!out.agreement_signed
  return out
}

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.contractors !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('contractors').select('*').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    let query = db().from('contractors').select('*').eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Project history for a contractor (will be empty until projects are wired)
router.get('/:id/projects', async (req, res) => {
  try {
    let verify = db().from('contractors').select('id').eq('id', req.params.id)
    if (req.account_filter) verify = verify.eq('account_id', req.account_filter)
    const { data: c } = await verify.single()
    if (!c) return res.status(403).json({ error: 'Access denied.' })

    let projQ = db()
      .from('construction_projects')
      .select('id, name, status, start_date, target_completion, overall_pct, property_id')
      .eq('contractor_id', req.params.id)
      .order('created_at', { ascending: false })
    if (req.account_filter) projQ = projQ.eq('account_id', req.account_filter)
    const { data: projects } = await projQ
    res.json(projects || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireEdit, async (req, res) => {
  try {
    const row = clean(req.body)
    if (!row.name) return res.status(400).json({ error: 'Name is required.' })
    row.account_id = req.user.account_id
    const { data, error } = await db().from('contractors').insert([row]).select()
    if (error) throw error
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireEdit, async (req, res) => {
  try {
    const updates = clean(req.body)
    let query = db().from('contractors').update(updates).eq('id', req.params.id)
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query.select()
    if (error) throw error
    if (!data || data.length === 0) return res.status(403).json({ error: 'Access denied.' })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireEdit, async (req, res) => {
  try {
    let verifyQuery = db().from('contractors').select('id').eq('id', req.params.id)
    if (req.account_filter) verifyQuery = verifyQuery.eq('account_id', req.account_filter)
    const { data: cont } = await verifyQuery.single()
    if (!cont) return res.status(403).json({ error: 'Access denied.' })

    let projQuery = db().from('construction_projects').update({ contractor_id: null }).eq('contractor_id', req.params.id)
    if (req.account_filter) projQuery = projQuery.eq('account_id', req.account_filter)
    await projQuery
    let delQuery = db().from('contractors').delete().eq('id', req.params.id)
    if (req.account_filter) delQuery = delQuery.eq('account_id', req.account_filter)
    const { error } = await delQuery
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

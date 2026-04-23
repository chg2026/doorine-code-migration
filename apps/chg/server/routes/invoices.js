const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../middleware/auth')
const { stripAccountId, verifyForeignKey } = require('../middleware/permissions')
const projectsRouter = require('./projects')

const db = () => supabaseAdmin

function requireEdit(req, res, next) {
  if (req.user?.is_super_admin) return next()
  if (req.user?.permissions?.finance !== 'edit') {
    return res.status(403).json({ error: 'Edit access required.' })
  }
  next()
}

router.get('/', async (req, res) => {
  try {
    let query = db().from('invoices').select('*, properties(address)').order('created_at', { ascending: false })
    if (req.account_filter) query = query.eq('account_id', req.account_filter)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireEdit, async (req, res) => {
  try {
    const row = stripAccountId(req.body)
    row.account_id = req.user.account_id
    if (req.account_filter && row.property_id) {
      if (!(await verifyForeignKey(db(), 'properties', row.property_id, req.account_filter))) {
        return res.status(400).json({ error: 'Invalid property reference.' })
      }
    }
    const { data, error } = await db().from('invoices').insert([row]).select()
    if (error) throw error

    // If the invoice references a project, mirror the activity event the
    // project-scoped POST emits — keeps the project activity log consistent
    // regardless of which invoice entry-point was used.
    const inv = data[0]
    if (inv?.project_id && projectsRouter.logActivity) {
      const amount = Number(inv.amount) || 0
      await projectsRouter.logActivity(inv.project_id, inv.account_id, req.user?.id, 'invoice_logged',
        `Invoice ${inv.invoice_number ? '#' + inv.invoice_number + ' ' : ''}from ${inv.vendor || 'Unknown'} ($${amount.toLocaleString()}) logged.`,
        { invoice_id: inv.id, category: inv.category, amount })
    }
    res.json(inv)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

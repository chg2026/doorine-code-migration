const express = require('express')
const router = express.Router()
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

router.use(requireAuth)

router.get('/stats', async (req, res) => {
  try {
    const accountFilter = req.user.is_super_admin ? {} : { account_id: req.user.account_id }

    const [properties, projects, tasks] = await Promise.all([
      supabaseAdmin.from('properties').select('id').match(accountFilter),
      supabaseAdmin.from('construction_projects').select('id, status, labor_spent, material_spent').match(accountFilter),
      supabaseAdmin.from('recurring_tasks').select('id, status').match(accountFilter),
    ])

    const allProjects = projects.data || []
    const activeProjects = allProjects.filter(p => p.status === 'active')
    const totalSpend = allProjects.reduce((sum, p) => sum + Number(p.labor_spent || 0) + Number(p.material_spent || 0), 0)
    const openTasks = (tasks.data || []).filter(t => t.status === 'pending')

    res.json({
      properties: (properties.data || []).length,
      active_projects: activeProjects.length,
      open_tasks: openTasks.length,
      total_spend: totalSpend,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router

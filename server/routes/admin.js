const express = require('express')
const router = express.Router()
const { requireSuperAdmin, supabaseAdmin } = require('../middleware/auth')

router.use(requireSuperAdmin)

router.get('/stats', async (req, res) => {
  try {
    const [accounts, users] = await Promise.all([
      supabaseAdmin.from('accounts').select('id, status, created_at'),
      supabaseAdmin.from('user_profiles').select('id'),
    ])

    const allAccounts = accounts.data || []
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    res.json({
      total_accounts: allAccounts.length,
      total_users: (users.data || []).length,
      active_accounts: allAccounts.filter(a => a.status === 'active').length,
      recent_accounts: allAccounts.filter(a => a.created_at >= thirtyDaysAgo).length,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/accounts', async (req, res) => {
  try {
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: userCounts } = await supabaseAdmin
      .from('user_profiles')
      .select('account_id')

    const countMap = {}
    for (const u of userCounts || []) {
      countMap[u.account_id] = (countMap[u.account_id] || 0) + 1
    }

    const result = (accounts || []).map(a => ({
      ...a,
      user_count: countMap[a.id] || 0,
    }))

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/accounts', async (req, res) => {
  try {
    const { name, plan_tier = 'starter', status = 'active', billing_email } = req.body
    if (!name) return res.status(400).json({ error: 'Account name is required.' })

    const tierDefaults = {
      starter: { max_users: 5, allowed_departments: ['acquisitions', 'construction'] },
      professional: { max_users: 20, allowed_departments: ['acquisitions', 'construction', 'property_management', 'contractors'] },
      enterprise: { max_users: 9999, allowed_departments: ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks'] },
    }
    const tier = tierDefaults[plan_tier] || tierDefaults.starter

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({ name, plan_tier, status, billing_email, ...tier })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, plan_tier, status, billing_email } = req.body
    const updates = {}
    if (name !== undefined) updates.name = name
    if (plan_tier !== undefined) {
      updates.plan_tier = plan_tier
      const tierDefaults = {
        starter: { max_users: 5, allowed_departments: ['acquisitions', 'construction'] },
        professional: { max_users: 20, allowed_departments: ['acquisitions', 'construction', 'property_management', 'contractors'] },
        enterprise: { max_users: 9999, allowed_departments: ['acquisitions', 'construction', 'property_management', 'contractors', 'finance', 'tasks'] },
      }
      const t = tierDefaults[plan_tier] || {}
      if (t.max_users) updates.max_users = t.max_users
      if (t.allowed_departments) updates.allowed_departments = t.allowed_departments
    }
    if (status !== undefined) updates.status = status
    if (billing_email !== undefined) updates.billing_email = billing_email

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/accounts/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('accounts').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/users', async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('*, roles(name), accounts(name)')
      .order('created_at', { ascending: false })

    const result = (data || []).map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      status: u.status,
      is_super_admin: u.is_super_admin,
      is_account_admin: u.is_account_admin,
      last_login: u.last_login,
      role_name: u.roles?.name || null,
      account_name: u.accounts?.name || null,
      account_id: u.account_id,
      role_id: u.role_id,
      created_at: u.created_at,
    }))

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/users', async (req, res) => {
  try {
    const { email, password, full_name, account_id, role_id, is_account_admin } = req.body
    if (!email || !password || !account_id) {
      return res.status(400).json({ error: 'Email, password, and account_id are required.' })
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, account_id, role_id },
    })
    if (authError) throw authError

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authUser.user.id,
        email,
        full_name: full_name || '',
        account_id,
        role_id: role_id || null,
        is_account_admin: is_account_admin || false,
      })
    if (profileError) throw profileError

    res.status(201).json({ id: authUser.user.id, email })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/users/:id', async (req, res) => {
  try {
    const { full_name, role_id, status, is_account_admin } = req.body
    const updates = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (role_id !== undefined) updates.role_id = role_id
    if (status !== undefined) updates.status = status
    if (is_account_admin !== undefined) updates.is_account_admin = is_account_admin

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/users/:id', async (req, res) => {
  try {
    await supabaseAdmin.from('user_profiles').delete().eq('id', req.params.id)
    await supabaseAdmin.auth.admin.deleteUser(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/roles', async (req, res) => {
  try {
    const { data: roles } = await supabaseAdmin
      .from('roles')
      .select('*, accounts(name)')
      .order('created_at', { ascending: false })

    const { data: perms } = await supabaseAdmin
      .from('role_permissions')
      .select('*')

    const permsByRole = {}
    for (const p of perms || []) {
      if (!permsByRole[p.role_id]) permsByRole[p.role_id] = []
      permsByRole[p.role_id].push(p)
    }

    const result = (roles || []).map(r => ({
      ...r,
      account_name: r.accounts?.name || null,
      permissions: permsByRole[r.id] || [],
    }))

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/roles', async (req, res) => {
  try {
    const { name, account_id, permissions = [] } = req.body
    if (!name) return res.status(400).json({ error: 'Role name is required.' })

    const { data: role, error } = await supabaseAdmin
      .from('roles')
      .insert({ name, account_id: account_id || null, created_by: req.user.id })
      .select()
      .single()
    if (error) throw error

    if (permissions.length > 0) {
      const permRows = permissions.map(p => ({
        role_id: role.id,
        department: p.department,
        permission_level: p.permission_level || 'none',
      }))
      await supabaseAdmin.from('role_permissions').insert(permRows)
    }

    res.status(201).json(role)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/roles/:id', async (req, res) => {
  try {
    const { name, permissions } = req.body

    if (name !== undefined) {
      const { error } = await supabaseAdmin.from('roles').update({ name }).eq('id', req.params.id)
      if (error) throw error
    }

    if (permissions) {
      await supabaseAdmin.from('role_permissions').delete().eq('role_id', req.params.id)
      if (permissions.length > 0) {
        const permRows = permissions.map(p => ({
          role_id: req.params.id,
          department: p.department,
          permission_level: p.permission_level || 'none',
        }))
        await supabaseAdmin.from('role_permissions').insert(permRows)
      }
    }

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/roles/:id', async (req, res) => {
  try {
    const { data: users } = await supabaseAdmin.from('user_profiles').select('id').eq('role_id', req.params.id)
    if (users && users.length > 0) {
      return res.status(400).json({ error: `Cannot delete role — ${users.length} user(s) still assigned. Reassign them first.` })
    }
    const { error } = await supabaseAdmin.from('roles').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router

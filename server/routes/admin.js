const express = require('express')
const router = express.Router()
const { requireSuperAdmin, supabaseAdmin } = require('../middleware/auth')

router.use(requireSuperAdmin)

// ─── Entitlement helpers ────────────────────────────────────────────────────
//
// Plan metadata lives on account_products. These helpers are product-agnostic
// — Phase 4 generalizes the old CHG-only path so the admin console can manage
// CHG, Deal Link, and any future product the same way.

// Allowed plans per product. Hardcoded for now; can move to the products
// table as a JSON column when Phase 5 brings real Deal Link tiers.
const PLANS_BY_PRODUCT = {
  chg: ['starter', 'pro', 'enterprise'],
  deallink: ['free', 'pro'],
}

function isValidPlan(productCode, plan) {
  const allowed = PLANS_BY_PRODUCT[productCode]
  return Array.isArray(allowed) && allowed.includes(plan)
}

async function getProductByCode(code) {
  if (!code) return null
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, code, name')
    .eq('code', code)
    .single()
  if (error || !data?.id) return null
  return data
}

// Upsert an active entitlement at the given plan. Used by:
//   - signup flow (via existing helper, eventually consolidated here)
//   - admin POST /entitlements (grant)
//   - admin PUT /accounts/:id with plan_tier (legacy CHG path)
async function syncEntitlement(accountId, productCode, plan) {
  if (!accountId || !productCode || !plan) return { error: 'missing params' }
  const product = await getProductByCode(productCode)
  if (!product) {
    console.warn(`[admin] Product '${productCode}' not found — entitlement sync skipped`)
    return { error: `product '${productCode}' not found` }
  }
  const { data, error } = await supabaseAdmin
    .from('account_products')
    .upsert(
      {
        account_id: accountId,
        product_id: product.id,
        plan,
        status: 'active',
        started_at: new Date().toISOString(),
        // Re-granting a previously disabled entitlement clears the audit fields
        // so they reflect the CURRENT lifecycle, not a stale revocation.
        disabled_at: null,
        disabled_by: null,
      },
      { onConflict: 'account_id,product_id' }
    )
    .select('account_id, product_id, plan, status, started_at')
    .single()
  if (error) console.error('[admin] Entitlement sync error:', error.message)
  return { data, error, product }
}

// Thin back-compat wrapper for the CHG-only callsites that already exist
// in this file (POST /accounts, PUT /accounts/:id with plan_tier). Keeps
// the diff minimal until Phase 4 PR C.
async function syncChgEntitlement(accountId, plan) {
  if (!accountId || !plan) return
  await syncEntitlement(accountId, 'chg', plan)
}

// Append-only audit trail for entitlement changes. activity_log has
// SELECT-only RLS; supabaseAdmin uses the service role and bypasses it.
// Failures here MUST NOT block the underlying admin write — log + swallow.
async function logEntitlementActivity({ actorId, accountId, action, metadata }) {
  try {
    const { error } = await supabaseAdmin.from('activity_log').insert({
      user_id: actorId || null,
      account_id: accountId,
      action,
      entity_type: 'account_product',
      metadata: metadata || {},
    })
    if (error) console.warn('[admin] activity_log insert failed:', error.message)
  } catch (e) {
    console.warn('[admin] activity_log threw:', e.message)
  }
}

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

    // Load every entitlement once. We use this for two things:
    //   (1) project plan_tier from the active CHG row (back-compat for
    //       admin UI fields that still read .plan_tier — Phase 2.5 shape)
    //   (2) attach a per-account entitlements array so the admin list
    //       UI can render product pills without a second round-trip
    const { data: allEntitlements } = await supabaseAdmin
      .from('account_products')
      .select('account_id, plan, status, started_at, disabled_at, products:product_id ( code, name )')

    const chgPlanByAccount = {}
    const entitlementsByAccount = {}
    for (const row of allEntitlements || []) {
      const code = row.products?.code
      if (!code) continue
      const flat = {
        code,
        name: row.products?.name || code,
        plan: row.plan,
        status: row.status,
        started_at: row.started_at,
        disabled_at: row.disabled_at,
      }
      if (!entitlementsByAccount[row.account_id]) entitlementsByAccount[row.account_id] = []
      entitlementsByAccount[row.account_id].push(flat)
      if (code === 'chg' && row.status === 'active') {
        chgPlanByAccount[row.account_id] = row.plan
      }
    }

    const countMap = {}
    for (const u of userCounts || []) {
      countMap[u.account_id] = (countMap[u.account_id] || 0) + 1
    }

    const result = (accounts || []).map(a => ({
      ...a,
      plan_tier: chgPlanByAccount[a.id] || null,
      user_count: countMap[a.id] || 0,
      entitlements: entitlementsByAccount[a.id] || [],
    }))

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Entitlement management (Phase 4) ───────────────────────────────────────
//
// All four routes operate on a single account's entitlements. Mounted under
// /admin/accounts/:id/entitlements so the URL itself enforces the account
// scope and the UI can construct paths predictably.

router.get('/accounts/:id/entitlements', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('account_products')
      .select('account_id, plan, status, started_at, disabled_at, disabled_by, products:product_id ( id, code, name, brand_domain, status )')
      .eq('account_id', req.params.id)
      .order('started_at', { ascending: true })
    if (error) throw error
    const flat = (data || []).map(r => ({
      account_id: r.account_id,
      product_id: r.products?.id,
      product_code: r.products?.code,
      product_name: r.products?.name,
      product_status: r.products?.status,
      plan: r.plan,
      status: r.status,
      started_at: r.started_at,
      disabled_at: r.disabled_at,
      disabled_by: r.disabled_by,
    }))
    res.json(flat)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/accounts/:id/entitlements', async (req, res) => {
  try {
    const { product_code, plan } = req.body
    if (!product_code || !plan) {
      return res.status(400).json({ error: 'product_code and plan are required.' })
    }
    if (!isValidPlan(product_code, plan)) {
      return res.status(400).json({ error: `Invalid plan '${plan}' for product '${product_code}'.` })
    }

    // Confirm the account exists before granting — surfaces a clean 404
    // instead of a confusing FK error from the upsert.
    const { data: account, error: acctError } = await supabaseAdmin
      .from('accounts').select('id').eq('id', req.params.id).single()
    if (acctError || !account) return res.status(404).json({ error: 'Account not found.' })

    // Capture prior state so the audit log can record what changed (e.g.
    // re-granting a previously disabled entitlement, or upgrading a plan).
    const product = await getProductByCode(product_code)
    if (!product) return res.status(400).json({ error: `Unknown product '${product_code}'.` })

    const { data: existing } = await supabaseAdmin
      .from('account_products')
      .select('plan, status')
      .eq('account_id', req.params.id)
      .eq('product_id', product.id)
      .maybeSingle()

    const { data, error } = await syncEntitlement(req.params.id, product_code, plan)
    if (error) throw error

    await logEntitlementActivity({
      actorId: req.user?.id,
      accountId: req.params.id,
      action: existing ? 'entitlement.regrant' : 'entitlement.grant',
      metadata: {
        product_code,
        new_plan: plan,
        prior_plan: existing?.plan || null,
        prior_status: existing?.status || null,
      },
    })

    res.status(201).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/accounts/:id/entitlements/:product_code', async (req, res) => {
  try {
    const { plan } = req.body
    const { id: accountId, product_code } = req.params
    if (!plan) return res.status(400).json({ error: 'plan is required.' })
    if (!isValidPlan(product_code, plan)) {
      return res.status(400).json({ error: `Invalid plan '${plan}' for product '${product_code}'.` })
    }

    const product = await getProductByCode(product_code)
    if (!product) return res.status(404).json({ error: `Unknown product '${product_code}'.` })

    const { data: existing, error: existErr } = await supabaseAdmin
      .from('account_products')
      .select('plan, status')
      .eq('account_id', accountId)
      .eq('product_id', product.id)
      .single()
    if (existErr || !existing) return res.status(404).json({ error: 'Entitlement not found.' })

    const { data, error } = await supabaseAdmin
      .from('account_products')
      .update({ plan })
      .eq('account_id', accountId)
      .eq('product_id', product.id)
      .select()
      .single()
    if (error) throw error

    await logEntitlementActivity({
      actorId: req.user?.id,
      accountId,
      action: 'entitlement.plan_change',
      metadata: { product_code, prior_plan: existing.plan, new_plan: plan },
    })

    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/accounts/:id/entitlements/:product_code', async (req, res) => {
  try {
    const { id: accountId, product_code } = req.params

    const product = await getProductByCode(product_code)
    if (!product) return res.status(404).json({ error: `Unknown product '${product_code}'.` })

    const { data: existing, error: existErr } = await supabaseAdmin
      .from('account_products')
      .select('plan, status')
      .eq('account_id', accountId)
      .eq('product_id', product.id)
      .single()
    if (existErr || !existing) return res.status(404).json({ error: 'Entitlement not found.' })
    if (existing.status === 'disabled') {
      // Idempotent: revoking an already-disabled entitlement is a no-op,
      // not an error. Lets the UI's revoke button be safely retried.
      return res.json({ ok: true, already_disabled: true })
    }

    const { error } = await supabaseAdmin
      .from('account_products')
      .update({
        status: 'disabled',
        disabled_at: new Date().toISOString(),
        disabled_by: req.user?.id || null,
      })
      .eq('account_id', accountId)
      .eq('product_id', product.id)
    if (error) throw error

    await logEntitlementActivity({
      actorId: req.user?.id,
      accountId,
      action: 'entitlement.revoke',
      metadata: { product_code, prior_plan: existing.plan },
    })

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/accounts', async (req, res) => {
  try {
    const { name, plan_tier = 'starter', status = 'active', billing_email } = req.body
    if (!name) return res.status(400).json({ error: 'Account name is required.' })

    // accounts row is identity + status only now; plan lives on account_products.
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({ name, status, billing_email })
      .select()
      .single()

    if (error) throw error

    await syncChgEntitlement(data.id, plan_tier)

    // Project plan_tier back onto the response so the admin UI shape is stable.
    res.status(201).json({ ...data, plan_tier })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, plan_tier, status, billing_email } = req.body
    // plan_tier no longer lives on accounts — it routes to account_products.
    const updates = {}
    if (name !== undefined) updates.name = name
    if (status !== undefined) updates.status = status
    if (billing_email !== undefined) updates.billing_email = billing_email

    let data
    if (Object.keys(updates).length > 0) {
      const result = await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single()
      if (result.error) throw result.error
      data = result.data
    } else {
      const result = await supabaseAdmin
        .from('accounts')
        .select('*')
        .eq('id', req.params.id)
        .single()
      if (result.error) throw result.error
      data = result.data
    }

    if (plan_tier !== undefined) {
      await syncChgEntitlement(req.params.id, plan_tier)
    }

    // Project plan_tier back onto the response. If it wasn't changed in this
    // request, look up the current CHG entitlement so the UI doesn't see null.
    let responsePlan = plan_tier
    if (responsePlan === undefined) {
      const { data: ent } = await supabaseAdmin
        .from('account_products')
        .select('plan, status, products:product_id ( code )')
        .eq('account_id', req.params.id)
      responsePlan = (ent || []).find(e => e.products?.code === 'chg' && e.status === 'active')?.plan || null
    }

    res.json({ ...data, plan_tier: responsePlan })
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

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) console.warn('[auth] SUPABASE_URL is not set')

const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

const supabaseAnon = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return res.status(401).json({ error: 'Authentication required.' })

  const token = match[1]

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Auth not configured on server.' })
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired session.' })

    // Load profile + role (with its product) + account.
    // roles.product_id joins to products(code) — tells us which product this role belongs to.
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select(`
        *,
        roles (
          name,
          product_id,
          products:product_id ( code, name )
        ),
        accounts (
          name,
          status
        )
      `)
      .eq('id', user.id)
      .single()

    if (!profile) return res.status(401).json({ error: 'User profile not found.' })

    if (profile.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended.' })
    }

    if (profile.accounts?.status === 'suspended') {
      return res.status(403).json({ error: 'Organization account suspended.' })
    }

    const { data: perms } = await supabaseAdmin
      .from('role_permissions')
      .select('department, permission_level')
      .eq('role_id', profile.role_id)

    // Load active product entitlements for this account. Super admins get all
    // active entitlements across their account (same shape). Used by
    // requireProduct middleware and /auth/me response.
    const entitlements = []
    if (profile.account_id) {
      const { data: rows } = await supabaseAdmin
        .from('account_products')
        .select(`
          plan,
          status,
          seats,
          trial_ends_at,
          started_at,
          products:product_id ( code, name, brand_domain )
        `)
        .eq('account_id', profile.account_id)
        .eq('status', 'active')

      if (rows) {
        for (const row of rows) {
          if (!row.products?.code) continue
          entitlements.push({
            code: row.products.code,
            name: row.products.name,
            brand_domain: row.products.brand_domain,
            plan: row.plan,
            status: row.status,
            seats: row.seats,
            trial_ends_at: row.trial_ends_at,
            started_at: row.started_at,
          })
        }
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      profile,
      account_id: profile.account_id,
      is_super_admin: profile.is_super_admin,
      is_account_admin: profile.is_account_admin,
      role_product_code: profile.roles?.products?.code || null,
      entitlements,
      permissions: (perms || []).reduce((acc, p) => { acc[p.department] = p.permission_level; return acc }, {}),
    }

    next()
  } catch (e) {
    console.error('[auth] Error validating token:', e.message)
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user?.is_super_admin) {
    return res.status(403).json({ error: 'Super Admin access required.' })
  }
  next()
}

function requireAccountAdmin(req, res, next) {
  if (!req.user?.is_super_admin && !req.user?.is_account_admin) {
    return res.status(403).json({ error: 'Admin access required.' })
  }
  next()
}

module.exports = { requireAuth, requireSuperAdmin, requireAccountAdmin, supabaseAdmin, supabaseAnon }

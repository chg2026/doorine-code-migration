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

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*, roles(name), accounts(name, plan_tier, status, allowed_departments)')
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

    req.user = {
      id: user.id,
      email: user.email,
      profile,
      account_id: profile.account_id,
      is_super_admin: profile.is_super_admin,
      is_account_admin: profile.is_account_admin,
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

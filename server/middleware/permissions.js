// ─── PRODUCT ACCESS ───────────────────────────────────────────────────────
// requireProduct(code) — rejects requests from accounts that don't have an
// active entitlement to the named product. Super admins bypass.
//
// requireAuth populates req.user.entitlements before this runs, so this is
// a pure in-memory check — no extra DB round-trip.
//
// Phase 2 uses this on route mounts to enforce product boundaries:
//   app.use('/api/properties', requireAuth, requireProduct('chg'), ...)
// Phase 5 will add Deal Link routes scoped with requireProduct('deallink').

function requireProduct(code) {
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next()

    const entitlement = (req.user?.entitlements || []).find(e => e.code === code)
    if (!entitlement) {
      return res.status(403).json({ error: `No access to product: ${code}.` })
    }
    if (entitlement.status !== 'active') {
      return res.status(403).json({ error: `Product ${code} is not active on this account.` })
    }

    // Attach the matched entitlement for downstream handlers.
    req.product = { code, entitlement }
    next()
  }
}

// ─── DEPARTMENT ACCESS ────────────────────────────────────────────────────
// Backward-compatible signature.
//   requireDepartment('finance')                      → product=chg, level=view
//   requireDepartment('finance', 'edit')              → product=chg, level=edit
//   requireDepartment('finance', { level: 'edit' })   → product=chg, level=edit
//   requireDepartment('finance', { product: 'chg' })  → product=chg, level=view
//   requireDepartment('finance', { product: 'deallink', level: 'edit' })
//
// Checks:
//   1. User's role belongs to the requested product (role_product_code match).
//      Super admins bypass.
//   2. User has the requested permission level on the department.

function _normalizeOpts(opts) {
  if (typeof opts === 'string') return { level: opts, product: 'chg' }
  const { level = 'view', product = 'chg' } = opts || {}
  return { level, product }
}

function requireDepartment(department, opts) {
  const { level, product } = _normalizeOpts(opts)
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next()

    // If the user's role is scoped to a different product, they can't touch
    // this endpoint even if they happen to have matching permissions.
    if (req.user?.role_product_code && req.user.role_product_code !== product) {
      return res.status(403).json({ error: `Role scoped to ${req.user.role_product_code}, not ${product}.` })
    }

    const perm = req.user?.permissions?.[department]
    if (!perm || perm === 'none') {
      return res.status(403).json({ error: `No access to ${department}.` })
    }
    if (level === 'edit' && perm !== 'edit') {
      return res.status(403).json({ error: `Edit access required for ${department}.` })
    }
    next()
  }
}

function requireEditPermission(department, opts) {
  const { product } = _normalizeOpts(opts)
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next()

    if (req.user?.role_product_code && req.user.role_product_code !== product) {
      return res.status(403).json({ error: `Role scoped to ${req.user.role_product_code}, not ${product}.` })
    }

    const perm = req.user?.permissions?.[department]
    if (perm !== 'edit') {
      return res.status(403).json({ error: `Edit access required for ${department}.` })
    }
    next()
  }
}

// ─── ACCOUNT SCOPE ────────────────────────────────────────────────────────

function scopeToAccount(req, res, next) {
  if (req.user?.is_super_admin) {
    req.account_filter = null
  } else {
    if (!req.user?.account_id) {
      return res.status(403).json({ error: 'No account associated with this user.' })
    }
    req.account_filter = req.user.account_id
  }
  next()
}

function stripAccountId(body) {
  if (!body) return body
  const { account_id, ...rest } = body
  return rest
}

async function verifyForeignKey(supabase, table, id, accountId) {
  if (!id || !accountId) return true
  const { data } = await supabase.from(table).select('id').eq('id', id).eq('account_id', accountId).single()
  return !!data
}

module.exports = {
  requireProduct,
  requireDepartment,
  requireEditPermission,
  scopeToAccount,
  stripAccountId,
  verifyForeignKey,
}

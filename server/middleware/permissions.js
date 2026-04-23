function requireDepartment(department, level = 'view') {
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next()

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

function requireEditPermission(department) {
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next()
    const perm = req.user?.permissions?.[department]
    if (perm !== 'edit') {
      return res.status(403).json({ error: `Edit access required for ${department}.` })
    }
    next()
  }
}

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

module.exports = { requireDepartment, requireEditPermission, scopeToAccount, stripAccountId, verifyForeignKey }

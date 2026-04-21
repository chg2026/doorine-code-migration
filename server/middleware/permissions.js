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

function scopeToAccount(req, res, next) {
  if (req.user?.is_super_admin) {
    req.account_filter = null
  } else {
    req.account_filter = req.user?.account_id
  }
  next()
}

module.exports = { requireDepartment, scopeToAccount }

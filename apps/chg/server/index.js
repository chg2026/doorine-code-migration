const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

const { requireAuth } = require('./middleware/auth')
const { requireDepartment, scopeToAccount } = require('./middleware/permissions')

app.use('/api/auth', require('./routes/auth'))
app.get('/api/health', (req, res) => {
  res.json({ status: 'CHG CRM is running', version: '2.0.0', timestamp: new Date().toISOString() })
})

app.use('/api/admin', requireAuth, require('./routes/admin'))
app.use('/api/users', require('./routes/users'))
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'))

app.use('/api/properties', requireAuth, scopeToAccount, requireDepartment('property_management'), require('./routes/properties'))
app.use('/api/units', requireAuth, scopeToAccount, requireDepartment('property_management'), require('./routes/units'))
app.use('/api/contractors', requireAuth, scopeToAccount, requireDepartment('contractors'), require('./routes/contractors'))
app.use('/api/projects', requireAuth, scopeToAccount, requireDepartment('construction'), require('./routes/projects'))
app.use('/api/master-phases', requireAuth, scopeToAccount, requireDepartment('construction'), require('./routes/master-phases'))
app.use('/api/addendums', requireAuth, scopeToAccount, requireDepartment('construction'), require('./routes/addendums'))
app.use('/api/tenants', requireAuth, scopeToAccount, requireDepartment('property_management'), require('./routes/tenants'))
app.use('/api/deals', requireAuth, scopeToAccount, requireDepartment('acquisitions'), require('./routes/deals'))
app.use('/api/tasks', requireAuth, scopeToAccount, requireDepartment('tasks'), require('./routes/tasks'))
app.use('/api/invoices', requireAuth, scopeToAccount, requireDepartment('finance'), require('./routes/invoices'))

const buildPath = path.join(__dirname, '..', 'client', 'build')
const hasBuild = fs.existsSync(path.join(buildPath, 'index.html'))

if (hasBuild) {
  app.use(express.static(buildPath))
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res.json({ status: 'CHG CRM API is running', version: '2.0.0', timestamp: new Date().toISOString() })
  })
}

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CHG CRM server running on port ${PORT}`)
})

module.exports = app

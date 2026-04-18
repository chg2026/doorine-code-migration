const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'CHG CRM is running', version: '1.0.0', timestamp: new Date().toISOString() })
})

app.use('/api/properties', require('./routes/properties'))
app.use('/api/contractors', require('./routes/contractors'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/tenants', require('./routes/tenants'))
app.use('/api/deals', require('./routes/deals'))
app.use('/api/tasks', require('./routes/tasks'))
app.use('/api/invoices', require('./routes/invoices'))

const buildPath = path.resolve(__dirname, '../client/build')
app.use(express.static(buildPath))

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CHG CRM server running on port ${PORT}`)
})

module.exports = app
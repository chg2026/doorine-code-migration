const express = require('express')
const app = express()

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Doorine</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0f;
    color: #e8e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    text-align: center;
    padding: 2rem;
    max-width: 560px;
    width: 100%;
  }
  .logo {
    font-size: 3.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, #a78bfa, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1rem;
  }
  .tagline {
    font-size: 1.125rem;
    color: #9ca3b8;
    font-weight: 400;
    line-height: 1.5;
    margin-bottom: 2.5rem;
  }
  .ctas {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .btn {
    display: inline-block;
    padding: 0.75rem 1.75rem;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.15s, transform 0.15s;
  }
  .btn:hover { opacity: 0.85; transform: translateY(-1px); }
  .btn-primary {
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    color: #fff;
  }
  .btn-secondary {
    background: #1a1a2e;
    color: #c4b5fd;
    border: 1px solid #2d2d4e;
  }
</style>
</head>
<body>
<div class="container">
  <div class="logo">Doorine</div>
  <p class="tagline">The operating system for real estate investors</p>
  <div class="ctas">
    <a class="btn btn-primary" href="https://reiflywheel.doorine.com">REI Flywheel &rarr;</a>
    <a class="btn btn-secondary" href="https://chg.doorine.com">CHG Platform &rarr;</a>
  </div>
</div>
</body>
</html>`

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/r/:handle', (req, res) => {
  res.redirect(301, `https://reiflywheel.doorine.com/p/${req.params.handle}`)
})

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(HTML)
})

app.use((req, res) => {
  res.redirect(301, '/')
})

// ─── Listen ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Doorine landing listening on port ${PORT}`))

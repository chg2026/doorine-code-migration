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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const API_BASE = 'https://rei-code-dev.replit.app'

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/</g, '\\u003c')
}

function ogHtml({ title, description, image, url, redirectUrl }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeImage = image ? escapeHtml(image) : ''
  const safeUrl = escapeHtml(url)
  const safeRedirect = escapeHtml(redirectUrl)
  const jsRedirect = escapeJs(redirectUrl)
  const imageTags = safeImage
    ? `  <meta property="og:image" content="${safeImage}" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />\n  <meta name="twitter:image" content="${safeImage}" />\n`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="REI Flywheel" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
${imageTags}  <meta property="og:url" content="${safeUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <link rel="canonical" href="${safeRedirect}" />
</head>
<body>
  <p>Redirecting to <a href="${safeRedirect}">${safeRedirect}</a>…</p>
  <script>window.location.href = '${jsRedirect}';</script>
</body>
</html>`
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function formatMoney(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return ''
  return '$' + Math.round(num).toLocaleString('en-US')
}

app.get('/og/p/:handle', async (req, res) => {
  const { handle } = req.params
  const redirectUrl = `https://reiflywheel.doorine.com/p/${handle}`
  const data = await fetchJson(`${API_BASE}/api/deallink/public/${encodeURIComponent(handle)}`)

  const profile = data?.profile ?? data ?? {}
  const deals = Array.isArray(data?.deals) ? data.deals : Array.isArray(profile?.deals) ? profile.deals : []
  const activeDeals = deals.filter((d) => {
    const s = String(d?.status ?? '').toLowerCase()
    return !s || s === 'active' || s === 'live' || s === 'open'
  }).length || deals.length

  const bio = profile.bio || profile.tagline || profile.description || 'Real estate investor on REI Flywheel'
  const avatar = profile.avatar_url || profile.avatarUrl || profile.photo_url || profile.photoUrl
  const firstDealPhoto = deals
    .map((d) => {
      const photos = d?.photos || d?.images || []
      if (Array.isArray(photos) && photos.length) {
        const p = photos[0]
        return typeof p === 'string' ? p : p?.url || p?.src
      }
      return d?.cover_photo || d?.coverPhoto || d?.photo_url || d?.image_url
    })
    .find(Boolean)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    ogHtml({
      title: `@${handle} — REI Flywheel`,
      description: `${bio} · ${activeDeals} active deals`,
      image: avatar || firstDealPhoto || '',
      url: `https://doorine.com/r/${handle}`,
      redirectUrl,
    }),
  )
})

app.get('/og/im/:dealId', async (req, res) => {
  const { dealId } = req.params
  const redirectUrl = `https://reiflywheel.doorine.com/im/${dealId}`
  const data = await fetchJson(`${API_BASE}/api/deallink/im/${encodeURIComponent(dealId)}`)

  const preview = data?.preview ?? {}
  const title = `${preview.addr}, ${preview.city} — $${Number(preview.ask).toLocaleString()} asking`
  const description = `${preview.type} · ${preview.beds}bd/${preview.baths}ba · View full deal analysis on REI Flywheel`
  const firstPhoto = preview.photos?.[0] || ''

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    ogHtml({
      title,
      description,
      image: firstPhoto,
      url: `https://doorine.com/r/${dealId}`,
      redirectUrl,
    }),
  )
})

app.get('/r/:handle', (req, res) => {
  const { handle } = req.params
  const prefix = UUID_RE.test(handle) ? 'og/im' : 'og/p'
  res.redirect(302, `/${prefix}/${handle}`)
})

app.get('/im/:dealId', (req, res) => {
  res.redirect(301, `https://reiflywheel.doorine.com/im/${req.params.dealId}`)
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

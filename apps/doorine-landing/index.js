const express = require('express')
const fetch   = require('node-fetch')

const app = express()

// ─── Config ──────────────────────────────────────────────────────────────────

const GOLD_BRIDGE_API = (process.env.GOLD_BRIDGE_API_URL || '').replace(/\/$/, '')
const FLYWHEEL_URL    = 'https://reiflywheel.doorine.com'
const SITE_URL        = 'https://doorine.com'
const DEFAULT_IMAGE   = `${SITE_URL}/og-default.png`

// ─── Crawler detection ───────────────────────────────────────────────────────

const CRAWLER_RE = /facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|ia_archiver|Applebot|Pinterest|Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot/i

function isCrawler(req) {
  return CRAWLER_RE.test(req.headers['user-agent'] || '')
}

// ─── OG HTML builder ─────────────────────────────────────────────────────────

function ogHtml({ title, description, image, url, siteName }) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(siteName || 'REI Flywheel')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script>window.location.href="${esc(url)}"</script>
</head>
<body><p>Redirecting…</p></body>
</html>`
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Profile link — doorine.com/r/:handle
app.get('/r/:handle', async (req, res) => {
  if (!isCrawler(req)) {
    return res.redirect(302, `${FLYWHEEL_URL}/p/${req.params.handle}`)
  }

  const canonicalUrl = `${SITE_URL}/r/${req.params.handle}`

  try {
    const apiRes  = await fetch(`${GOLD_BRIDGE_API}/api/deallink/public/${req.params.handle}`, { timeout: 5000 })
    if (!apiRes.ok) throw new Error('not found')
    const { profile, deals } = await apiRes.json()

    const name   = profile?.name || req.params.handle
    const city   = profile?.city ? ` · ${profile.city}` : ''
    const bio    = profile?.bio  || `Check out ${name}'s off-market real estate deals on REI Flywheel.`
    const count  = Array.isArray(deals) ? deals.length : 0
    const desc   = count > 0 ? `${count} active deal${count !== 1 ? 's' : ''} — ${bio}` : bio
    const image  = profile?.avatar_url || DEFAULT_IMAGE

    return res.send(ogHtml({
      title:    `${name}${city} — REI Flywheel`,
      description: desc,
      image,
      url:      canonicalUrl,
      siteName: 'REI Flywheel',
    }))
  } catch (_) {
    console.error('[OG /r/]', _.message || _, _.stack)
    return res.send(ogHtml({
      title:    `REI Flywheel — Off-Market Deals`,
      description: 'Browse off-market real estate deals from wholesalers on REI Flywheel.',
      image:    DEFAULT_IMAGE,
      url:      canonicalUrl,
      siteName: 'REI Flywheel',
    }))
  }
})

// Deal IM link — doorine.com/im/:dealId
app.get('/im/:dealId', async (req, res) => {
  if (!isCrawler(req)) {
    return res.redirect(302, `${FLYWHEEL_URL}/im/${req.params.dealId}`)
  }

  const canonicalUrl = `${SITE_URL}/im/${req.params.dealId}`

  try {
    const apiRes = await fetch(`${GOLD_BRIDGE_API}/api/deallink/im/${req.params.dealId}`, { timeout: 5000 })
    if (!apiRes.ok) throw new Error('not found')
    const { preview } = await apiRes.json()

    const addr        = preview?.addr   || 'Off-Market Deal'
    const city        = preview?.city   ? `, ${preview.city}` : ''
    const zip         = preview?.zip    ? ` ${preview.zip}`   : ''
    const type        = preview?.type   ? ` · ${preview.type}` : ''
    const ask         = preview?.ask    ? ` · $${Number(preview.ask).toLocaleString()}` : ''
    const wholesaler  = preview?.wholesaler?.name || 'a REI Flywheel wholesaler'
    const image       = preview?.photos?.[0] || DEFAULT_IMAGE

    return res.send(ogHtml({
      title:    `${addr}${city}${zip}${type}${ask}`,
      description: `Off-market deal from ${wholesaler} on REI Flywheel. Submit an offer or request more info.`,
      image,
      url:      canonicalUrl,
      siteName: 'REI Flywheel',
    }))
  } catch (_) {
    console.error('[OG /im/]', _.message || _, _.stack)
    return res.send(ogHtml({
      title:    'Off-Market Deal — REI Flywheel',
      description: 'View this exclusive off-market real estate deal on REI Flywheel.',
      image:    DEFAULT_IMAGE,
      url:      canonicalUrl,
      siteName: 'REI Flywheel',
    }))
  }
})

// ─── Static HTML landing page ─────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Doorine — The Real Estate Operating Platform</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --cream:#F0EBE0;
  --cream-light:#F7F3EC;
  --gold:#C49A2A;
  --gold-dark:#A07E1C;
  --charcoal:#1C1A16;
  --muted:#6B6254;
  --subtle:#9A8C72;
  --border:rgba(160,140,100,0.25);
}
body{font-family:'DM Sans',sans-serif;background:var(--cream);color:var(--charcoal);font-size:15px;line-height:1.65;}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(160,140,100,0.45);border-radius:100px;padding:4px 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7A6E58;margin-bottom:20px;}
.pill-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);}

/* NAV */
nav{display:flex;align-items:center;justify-content:space-between;padding:20px 60px;border-bottom:1px solid var(--border);background:var(--cream);}
.nav-logo{font-family:'Playfair Display',serif;font-size:22px;font-weight:900;letter-spacing:-.02em;}
.nav-logo span{color:var(--gold);font-style:italic;}
.nav-links{display:flex;align-items:center;gap:32px;font-size:13px;color:var(--subtle);}
.nav-links a{text-decoration:none;color:inherit;}
.nav-links a:hover{color:var(--charcoal);}
.nav-cta{background:var(--gold);color:#fff;border:none;padding:9px 22px;border-radius:6px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:500;}
.nav-cta:hover{background:var(--gold-dark);}

/* HERO */
.hero{text-align:center;padding:80px 60px 60px;max-width:900px;margin:0 auto;}
.hero h1{font-family:'Playfair Display',serif;font-size:72px;line-height:1.08;font-weight:900;letter-spacing:-.03em;margin-bottom:24px;}
.hero h1 em{color:var(--gold);font-style:italic;}
.hero p{font-size:17px;color:var(--muted);max-width:560px;margin:0 auto 36px;line-height:1.7;}
.hero-btns{display:flex;align-items:center;justify-content:center;gap:14px;}
.btn-primary{background:var(--gold);color:#fff;border:none;padding:13px 28px;border-radius:6px;font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:500;display:inline-flex;align-items:center;gap:8px;}
.btn-primary:hover{background:var(--gold-dark);}
.btn-ghost{background:transparent;color:var(--charcoal);border:1.5px solid rgba(100,90,70,0.4);padding:12px 26px;border-radius:6px;font-size:14px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:400;}
.btn-ghost:hover{border-color:rgba(100,90,70,0.7);}

/* STATS */
.stats{display:flex;justify-content:center;align-items:center;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:60px 0 0;}
.stat{flex:1;max-width:220px;text-align:center;padding:32px 20px;border-right:1px solid var(--border);}
.stat:last-child{border-right:none;}
.stat-num{font-family:'Playfair Display',serif;font-size:38px;font-weight:900;color:var(--charcoal);line-height:1;}
.stat-label{font-size:12px;color:var(--subtle);margin-top:6px;letter-spacing:.02em;}

/* PRODUCTS */
.products{padding:80px 60px;}
.section-head{text-align:center;margin-bottom:56px;}
.section-head h2{font-family:'Playfair Display',serif;font-size:42px;font-weight:900;line-height:1.15;letter-spacing:-.02em;}
.section-head h2 em{color:var(--gold);font-style:italic;}
.section-head p{font-size:15px;color:var(--muted);max-width:480px;margin:14px auto 0;line-height:1.7;}
.product-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid rgba(160,140,100,0.3);border-radius:12px;overflow:hidden;}
.pcard{padding:36px 32px;background:#F5F0E8;border-right:1px solid rgba(160,140,100,0.25);position:relative;}
.pcard:last-child{border-right:none;}
.pcard-accent{position:absolute;top:0;left:0;right:0;height:3px;background:var(--gold);}
.pcard-tag{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--subtle);margin-bottom:16px;}
.pcard-name{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;line-height:1.1;margin-bottom:4px;}
.pcard-name em{color:var(--gold);font-style:italic;}
.pcard-who{font-size:12px;color:var(--subtle);margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid rgba(160,140,100,0.25);}
.pcard-desc{font-size:13px;color:#5C5446;line-height:1.65;margin-bottom:24px;}
.pcard-features{list-style:none;margin-bottom:28px;}
.pcard-features li{font-size:12px;color:#5C5446;padding:7px 0;border-bottom:1px solid rgba(160,140,100,0.18);display:flex;align-items:center;gap:8px;}
.pcard-features li:last-child{border-bottom:none;}
.check{color:var(--gold);font-size:13px;}
.pcard-link{font-size:12px;color:var(--gold);font-weight:500;display:inline-flex;align-items:center;gap:5px;cursor:pointer;text-decoration:none;}
.pcard-link:hover{color:var(--gold-dark);}

/* HOW IT WORKS */
.how{padding:80px 60px;border-top:1px solid var(--border);}
.how-inner{max-width:860px;margin:0 auto;}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:56px;}
.step{text-align:center;}
.step-num{font-family:'Playfair Display',serif;font-size:48px;font-weight:900;color:rgba(196,154,42,0.25);line-height:1;margin-bottom:14px;}
.step h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin-bottom:10px;}
.step p{font-size:13px;color:var(--muted);line-height:1.65;}

/* FOOTER CTA */
.footer-cta{background:#1C1A16;padding:80px 60px;text-align:center;}
.footer-cta h2{font-family:'Playfair Display',serif;font-size:46px;font-weight:900;color:#F0EBE0;line-height:1.1;margin-bottom:16px;}
.footer-cta h2 em{color:var(--gold);font-style:italic;}
.footer-cta p{font-size:15px;color:#9A8C72;max-width:440px;margin:0 auto 36px;}

/* FOOTER */
footer{padding:32px 60px;border-top:1px solid rgba(160,140,100,0.2);background:var(--cream);display:flex;justify-content:space-between;align-items:center;}
.footer-logo{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;}
.footer-logo span{color:var(--gold);font-style:italic;}
.footer-copy{font-size:12px;color:var(--subtle);}
.footer-links{display:flex;gap:24px;font-size:12px;color:var(--subtle);}
.footer-links a{text-decoration:none;color:inherit;}
.footer-links a:hover{color:var(--charcoal);}
</style>
</head>
<body>

<nav>
  <div class="nav-logo">Door<span>ine</span></div>
  <div class="nav-links">
    <a href="#">Products</a>
    <a href="#">How it works</a>
    <a href="#">Pricing</a>
    <a href="#">Sign in</a>
  </div>
  <a href="https://reiflywheel.doorine.com" class="nav-cta">Get started →</a>
</nav>

<section class="hero">
  <div class="pill"><span class="pill-dot"></span>The real estate operating platform</div>
  <h1>One platform.<br>Every <em>role.</em></h1>
  <p>Doorine connects the entire real estate investment ecosystem — flippers, wholesalers, and contractors — under one roof.</p>
  <div class="hero-btns">
    <a href="https://reiflywheel.doorine.com" class="btn-primary">Get started →</a>
    <a href="#products" class="btn-ghost">See the products</a>
  </div>
</section>

<div class="stats">
  <div class="stat"><div class="stat-num">3</div><div class="stat-label">Purpose-built products</div></div>
  <div class="stat"><div class="stat-num">$14M+</div><div class="stat-label">Portfolio ARV tracked</div></div>
  <div class="stat"><div class="stat-num">100%</div><div class="stat-label">Built for real estate</div></div>
  <div class="stat"><div class="stat-num">1</div><div class="stat-label">Login. Every product.</div></div>
</div>

<section class="products" id="products">
  <div class="section-head">
    <div class="pill"><span class="pill-dot"></span>The suite</div>
    <h2>Built for every part of<br>the <em>deal.</em></h2>
    <p>Three focused products. One login. Switch between them instantly with the Doorine app switcher.</p>
  </div>
  <div class="product-cards">
    <div class="pcard">
      <div class="pcard-accent"></div>
      <div class="pcard-tag">For flippers</div>
      <div class="pcard-name">CHG <em>Rehab</em></div>
      <div class="pcard-who">End-to-end rehab management</div>
      <p class="pcard-desc">The operating system for real estate rehab businesses — from first underwrite to final close. Manage deals, projects, contractors, and capital all in one place.</p>
      <ul class="pcard-features">
        <li><span class="check">✓</span>Deal underwriting & ARV comps</li>
        <li><span class="check">✓</span>Rehab project management</li>
        <li><span class="check">✓</span>Contractor coordination</li>
        <li><span class="check">✓</span>Deal pipeline & CRM</li>
      </ul>
      <a href="https://chg.doorine.com" class="pcard-link">Explore CHG Rehab →</a>
    </div>
    <div class="pcard">
      <div class="pcard-accent"></div>
      <div class="pcard-tag">For wholesalers</div>
      <div class="pcard-name">REI<em>flywheel</em></div>
      <div class="pcard-who">One link for every deal you wholesale</div>
      <p class="pcard-desc">Share a public profile. Post inventory once. Capture buyers — without the spreadsheet shuffle. The simplest way to run your wholesale business online.</p>
      <ul class="pcard-features">
        <li><span class="check">✓</span>Public deal profile & handle</li>
        <li><span class="check">✓</span>Buyer network management</li>
        <li><span class="check">✓</span>Deal marketplace & pipeline</li>
        <li><span class="check">✓</span>Deal analyzer tools</li>
      </ul>
      <a href="https://reiflywheel.doorine.com" class="pcard-link">Explore REIflywheel →</a>
    </div>
    <div class="pcard">
      <div class="pcard-accent"></div>
      <div class="pcard-tag">For contractors</div>
      <div class="pcard-name">Contractor <em>Portal</em></div>
      <div class="pcard-who">Your workspace. Your jobs.</div>
      <p class="pcard-desc">Give your subs their own workspace. Receive RFIs, submit bids, track jobs, manage invoices, and stay compliant — all without a single email chain.</p>
      <ul class="pcard-features">
        <li><span class="check">✓</span>Job & bid management</li>
        <li><span class="check">✓</span>Invoice submission & tracking</li>
        <li><span class="check">✓</span>RFI & change order workflow</li>
        <li><span class="check">✓</span>Compliance & lien waivers</li>
      </ul>
      <a href="https://chg.doorine.com" class="pcard-link">Explore Contractor Portal →</a>
    </div>
  </div>
</section>

<section class="how">
  <div class="how-inner">
    <div class="section-head">
      <div class="pill"><span class="pill-dot"></span>How it works</div>
      <h2>One login. <em>Every tool.</em></h2>
      <p>Doorine is a single platform with an app switcher — access any product instantly based on your role.</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">01</div>
        <h3>Create your Doorine account</h3>
        <p>One account gives you access to the entire suite. No separate logins, no juggling passwords.</p>
      </div>
      <div class="step">
        <div class="step-num">02</div>
        <h3>Choose your products</h3>
        <p>Select the tools that match your role — whether you're a flipper, wholesaler, contractor, or all three.</p>
      </div>
      <div class="step">
        <div class="step-num">03</div>
        <h3>Switch instantly</h3>
        <p>Use the Doorine app switcher to move between products in one click — context always intact.</p>
      </div>
    </div>
  </div>
</section>

<section class="footer-cta">
  <div class="pill" style="border-color:rgba(196,154,42,0.4);color:#9A8C72;"><span class="pill-dot"></span>Get started today</div>
  <h2>Real estate runs on<br><em>Doorine.</em></h2>
  <p>Join flippers, wholesalers, and contractors already using Doorine to run their businesses.</p>
  <a href="https://reiflywheel.doorine.com" class="btn-primary">Get started for free →</a>
</section>

<footer>
  <div class="footer-logo">Door<span>ine</span></div>
  <div class="footer-copy">© 2025 Doorine. All rights reserved.</div>
  <div class="footer-links">
    <a href="#">Privacy</a>
    <a href="#">Terms</a>
    <a href="#">Contact</a>
  </div>
</footer>

</body>
</html>`

// ─── Routes (static) ───────────────────────────────────────────────────────────

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

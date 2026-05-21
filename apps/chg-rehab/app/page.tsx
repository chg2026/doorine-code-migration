import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import "./landing.css";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/pipeline");

  return (
    <div className="lp-body">
      {/* NAV */}
      <nav className="lp-nav">
        <a className="lp-logo" href="#">CHG <sub>Rehab</sub></a>
        <ul className="lp-nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#modules">Modules</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#testimonials">Clients</a></li>
        </ul>
        <div className="lp-nav-right">
          <a className="lp-btn-ghost" href="/login">Sign in</a>
        </div>
      </nav>

      {/* HERO */}
      <div className="lp-hero">
        <div className="lp-hero-left">
          <div className="lp-hero-tag">Enterprise Rehab Platform</div>
          <h1>Every deal.<br /><em>Every phase.</em><br />One platform.</h1>
          <p className="lp-hero-sub">CHG is the end-to-end operating system for real estate rehab businesses — from first underwrite to final close. Manage deals, projects, contractors, and capital all in one place.</p>
          <div className="lp-hero-btns">
            <a className="lp-btn-hero" href="/login">Get started →</a>
          </div>
          <div className="lp-hero-stats">
            <div><div className="lp-hero-stat-num">$14.2M</div><div className="lp-hero-stat-label">Portfolio ARV tracked</div></div>
            <div><div className="lp-hero-stat-num">12+</div><div className="lp-hero-stat-label">Active deals managed</div></div>
            <div><div className="lp-hero-stat-num">8</div><div className="lp-hero-stat-label">Modules built-in</div></div>
          </div>
        </div>
        <div className="lp-hero-visual">
          <div className="lp-dash-mockup">
            <div className="lp-dash-top-bar">
              <span className="lp-dash-logo">CHG <span style={{fontSize:10,fontWeight:400,color:'var(--mid)'}}>Rehab</span></span>
              <span className="lp-dash-url">chg.doorine.com/pipeline ↗</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div className="lp-dash-avatar">CA</div>
                <span style={{fontSize:11,fontWeight:600}}>CHG Admin</span>
              </div>
            </div>
            <div className="lp-dash-welcome">Welcome back, CHG.</div>
            <div className="lp-dash-sub">Here&apos;s what&apos;s moving across your portfolio this week.</div>
            <div className="lp-dash-kpis">
              <div className="lp-kpi"><div className="lp-kpi-label">Active Deals</div><div className="lp-kpi-num">12</div><div className="lp-kpi-sub">3 due diligence · 2 under contract</div><div className="lp-kpi-bar"></div></div>
              <div className="lp-kpi"><div className="lp-kpi-label">Active Rehabs</div><div className="lp-kpi-num">5</div><div className="lp-kpi-sub">3 on schedule · 1 behind</div><div className="lp-kpi-bar" style={{background:'linear-gradient(90deg,var(--gold) 75%,var(--border) 75%)'}}></div></div>
              <div className="lp-kpi"><div className="lp-kpi-label">Open RFIs</div><div className="lp-kpi-num">8</div><div className="lp-kpi-sub">3 awaiting contractor reply</div><div className="lp-kpi-bar" style={{background:'linear-gradient(90deg,var(--gold) 40%,var(--border) 40%)'}}></div></div>
              <div className="lp-kpi"><div className="lp-kpi-label">Portfolio ARV</div><div className="lp-kpi-num" style={{fontSize:17}}>$14.2M</div><div className="lp-kpi-sub">$11.8M basis · +$2.4M proj.</div><div className="lp-kpi-bar" style={{background:'linear-gradient(90deg,var(--gold) 85%,var(--border) 85%)'}}></div></div>
            </div>
            <div className="lp-deals-label">Recent deals</div>
            <div className="lp-deal-row"><div><div className="lp-deal-addr">3411 Cedar Ridge Dr</div><div className="lp-deal-city">Dallas, TX · 75204</div></div><div><div className="lp-deal-price">$162,000</div><div className="lp-deal-arv">ARV $238k</div></div><span className="lp-deal-badge lp-badge-identified">Identified</span></div>
            <div className="lp-deal-row"><div><div className="lp-deal-addr">2455 Larkfield Ave</div><div className="lp-deal-city">Cleveland, OH · 44109</div></div><div><div className="lp-deal-price">$94,500</div><div className="lp-deal-arv">ARV $172k</div></div><span className="lp-deal-badge lp-badge-contract">Under contract</span></div>
            <div className="lp-deal-row"><div><div className="lp-deal-addr">1812 Magnolia Park Ln</div><div className="lp-deal-city">Woodland Hills, CA</div></div><div><div className="lp-deal-price">$520,000</div><div className="lp-deal-arv">ARV $810k</div></div><span className="lp-deal-badge lp-badge-contract">Under contract</span></div>
            <div className="lp-deal-row"><div><div className="lp-deal-addr">1920 W 50th St, Apt 1</div><div className="lp-deal-city">Cleveland, OH · 44102</div></div><div><div className="lp-deal-price">$104,200</div><div className="lp-deal-arv">ARV $186k</div></div><span className="lp-deal-badge lp-badge-closed">Closed</span></div>
          </div>
          <div className="lp-float-card">
            <div className="lp-float-label">This week · New leads</div>
            <div className="lp-float-num">7</div>
            <div className="lp-float-sub">↑ 3 from last week</div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="lp-section lp-feat-bg" id="features">
        <div className="lp-section-inner">
          <div className="lp-feat-header">
            <div className="lp-section-tag">Core Capabilities</div>
            <div className="lp-section-h">Built for the way <em>rehab operators</em> work</div>
            <p className="lp-section-p">Every tool you need — and nothing you don&apos;t. CHG is purpose-built for investors who run real rehab businesses at scale.</p>
          </div>
          <div className="lp-feat-grid">
            {[
              {icon:'📊',title:'Deal Underwriting',desc:'Model deals with precision. Run ARV comps, repair estimates, and return projections in a single, structured workflow.',items:['ARV & comp analysis','MAO calculator','Investor return modeling','Side-by-side scenario comparison']},
              {icon:'🔨',title:'Rehab Manager',desc:'Track every project from scope to punch list. Monitor schedules, budgets, and milestones across your entire rehab portfolio.',items:['Scope of work builder','Budget vs. actual tracking','Phase-by-phase progress','Photo & document logs']},
              {icon:'🤝',title:'Contractor Portal',desc:'Give your subs their own workspace. Send RFIs, approve bids, issue change orders, and track lien waivers — all in one place.',items:['RFI & change order management','Bid comparison tool','Contractor scorecards','Lien waiver tracking']},
              {icon:'🏗️',title:'Deal Pipeline',desc:'Never lose track of a deal. Move properties through every stage from identified to closed with full status visibility.',items:['Kanban & list views','Stage-based automations','Team assignment & notes','Pipeline ARV reporting']},
              {icon:'👥',title:'CRM & Contacts',desc:'Manage every relationship — sellers, buyers, investors, contractors. Your entire network, linked to the deals that matter.',items:['Seller & buyer tracking','Investor portal access','Activity timelines','Lead source attribution']},
              {icon:'📁',title:'Documents Hub',desc:'One organized home for every contract, inspection, title document, and permit — linked directly to the property it belongs to.',items:['Property-linked storage','eSign integrations','Version history','Shared access controls']},
            ].map((f) => (
              <div key={f.title} className="lp-feat-card">
                <div className="lp-feat-icon">{f.icon}</div>
                <div className="lp-feat-title">{f.title}</div>
                <div className="lp-feat-desc">{f.desc}</div>
                <ul className="lp-feat-list">{f.items.map(i => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section" id="how">
        <div className="lp-section-inner">
          <div className="lp-section-tag">How It Works</div>
          <div className="lp-section-h">From lead to close, <em>seamlessly connected</em></div>
          <div className="lp-how-grid">
            <div className="lp-steps">
              {[
                {n:'01',h:'Identify & Underwrite',p:'Add a property to your pipeline and run a full underwrite — comps, rehab estimate, and projected returns — before making an offer.'},
                {n:'02',h:'Get Under Contract',p:'Move the deal through due diligence and contract stages. Store all documents, track deadlines, and loop in your team as needed.'},
                {n:'03',h:'Manage the Rehab',p:'Build your scope, assign trades, and track every line item of the budget. Communicate with contractors directly through the platform.'},
                {n:'04',h:'Market & Close',p:'List to your buyer network, collect offers, and close. Every step is logged so your team always knows exactly where things stand.'},
              ].map((s) => (
                <div key={s.n} className="lp-step">
                  <div className="lp-step-num">{s.n}</div>
                  <div><h3 className="lp-step-h">{s.h}</h3><p className="lp-step-p">{s.p}</p></div>
                </div>
              ))}
            </div>
            <div className="lp-how-vis">
              <div className="lp-how-vis-hd"><span>Scope of Work — 555 Beech St</span><span className="lp-how-vis-badge">Active Rehab</span></div>
              {[{n:'Kitchen Demo & Rebuild',t:'General Contractor',a:'$18,400',s:'lp-s-approved',sl:'Approved'},{n:'Roof Replacement',t:'Roofing',a:'$9,200',s:'lp-s-pending',sl:'Pending bid'},{n:'HVAC Full Replacement',t:'HVAC',a:'$7,800',s:'lp-s-approved',sl:'Approved'},{n:'Electrical Panel Upgrade',t:'Electrician',a:'$4,100',s:'lp-s-review',sl:'In review'},{n:'Full Interior Paint',t:'Painter',a:'$3,600',s:'lp-s-approved',sl:'Approved'},{n:'Flooring (LVP)',t:'Flooring',a:'$5,200',s:'lp-s-pending',sl:'Pending bid'}].map((r) => (
                <div key={r.n} className="lp-scope-row"><div><div className="lp-scope-name">{r.n}</div><div className="lp-scope-trade">{r.t}</div></div><div style={{textAlign:'right'}}><div className="lp-scope-amt">{r.a}</div><span className={`lp-scope-status ${r.s}`}>{r.sl}</span></div></div>
              ))}
              <div className="lp-scope-total"><span className="lp-scope-total-label">Total Rehab Budget</span><span className="lp-scope-total-num">$48,300</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="lp-section lp-mod-bg" id="modules">
        <div className="lp-section-inner">
          <div className="lp-section-tag">Platform Modules</div>
          <div className="lp-section-h">Everything your operation <em>needs to scale</em></div>
          <p className="lp-section-p">CHG is modular by design. Use what you need today, and activate more as your business grows.</p>
          <div className="lp-mod-grid">
            {[
              {icon:'📋',title:'Pipeline Management',desc:'A full deal pipeline with customizable stages, team assignments, and real-time status across every active property in your portfolio.'},
              {icon:'🧮',title:'Deal Analyzer',desc:'Pro forma underwriting with ARV comps, rehab cost inputs, financing scenarios, and projected investor returns — all exportable.'},
              {icon:'🏠',title:'Property Record',desc:'A single source of truth for every property — photos, docs, notes, timeline, contacts, and financials all linked in one place.'},
              {icon:'📦',title:'Warehouse & Materials',desc:'Track material orders, deliveries, and inventory across your active job sites so nothing falls through the cracks mid-project.'},
              {icon:'💼',title:'Investor Portal',desc:'Give capital partners secure, read-only access to project status, financials, and key milestones — without the endless update emails.'},
              {icon:'👨‍👩‍👧‍👦',title:'Team Management',desc:'Assign roles and permissions so acquisitions, project managers, and admin staff each see exactly what they need — nothing more.'},
            ].map((m) => (
              <div key={m.title} className="lp-mod-card">
                <div className="lp-mod-icon">{m.icon}</div>
                <div><div className="lp-mod-title">{m.title}</div><div className="lp-mod-desc">{m.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* METRICS */}
      <div className="lp-metrics-band">
        <div className="lp-metrics-inner">
          {[{n:'$2.4B+',l:'In rehab projects\ntracked on platform'},{n:'40K+',l:'RFIs & change orders\nprocessed'},{n:'98%',l:'Uptime SLA across\nenterprise clients'},{n:'3×',l:'Faster project close\nvs. spreadsheet ops'}].map((m) => (
            <div key={m.n} className="lp-metric-box"><div className="lp-metric-num">{m.n}</div><div className="lp-metric-label">{m.l}</div></div>
          ))}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <section className="lp-section" id="testimonials">
        <div className="lp-section-inner">
          <div className="lp-section-tag">Client Stories</div>
          <div className="lp-section-h">Trusted by operators who <em>move fast and build right</em></div>
          <div className="lp-testi-grid">
            {[
              {q:'"We went from managing 4 rehabs in spreadsheets to running 18 projects simultaneously with a team of 6. CHG made that possible."',n:'James M.',r:'Principal · Cleveland, OH',i:'JM'},
              {q:'"The contractor portal alone saved us 10 hours a week. No more texts, no more missed RFIs — everything lives in the project record."',n:'Tanya R.',r:'Project Manager · Dallas, TX',i:'TR'},
              {q:'"Our investors finally stopped calling asking for updates. We just point them to their portal and the numbers speak for themselves."',n:'Derek K.',r:'GP · Woodland Hills, CA',i:'DK'},
            ].map((t) => (
              <div key={t.n} className="lp-testi-card">
                <div className="lp-testi-stars">★★★★★</div>
                <div className="lp-testi-quote">{t.q}</div>
                <div className="lp-testi-author"><div className="lp-testi-avatar">{t.i}</div><div><div className="lp-testi-name">{t.n}</div><div className="lp-testi-role">{t.r}</div></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="lp-cta-band">
        <div className="lp-cta-h">Ready to run your rehab <em>business like a business?</em></div>
        <p className="lp-cta-p">Join operators across the country who use CHG to underwrite faster, build smarter, and close more deals.</p>
        <div className="lp-cta-btns">
          <a className="lp-btn-cta-lg" href="/login">Get started →</a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div><a className="lp-footer-logo" href="#">CHG</a><p className="lp-footer-tagline">The enterprise operating system for real estate rehab. Built for operators who take their business seriously.</p></div>
            <div className="lp-footer-col"><h4>Product</h4><ul><li><a href="#">Pipeline</a></li><li><a href="#">Underwriting</a></li><li><a href="#">Rehab Manager</a></li><li><a href="#">Contractor Portal</a></li><li><a href="#">Investor Portal</a></li></ul></div>
            <div className="lp-footer-col"><h4>Company</h4><ul><li><a href="#">About</a></li><li><a href="#">Careers</a></li><li><a href="#">Blog</a></li><li><a href="#">Contact</a></li></ul></div>
            <div className="lp-footer-col"><h4>Support</h4><ul><li><a href="#">Documentation</a></li><li><a href="#">Onboarding</a></li><li><a href="#">Privacy Policy</a></li><li><a href="#">Terms of Service</a></li></ul></div>
          </div>
          <div className="lp-footer-bottom"><p>© 2026 CHG Rehab. All rights reserved.</p><p>Built for real estate operators.</p></div>
        </div>
      </footer>
    </div>
  );
}

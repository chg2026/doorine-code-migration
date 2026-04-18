import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:3000';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const fmtMoney = (n) => `$${parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const getTimeline = (startStr, targetStr) => {
  if (!startStr || !targetStr) return null;
  const MS = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start  = new Date(startStr + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  const totalDays    = Math.max(1, Math.round((target - start) / MS));
  const daysActive   = Math.max(0, Math.round((today - start) / MS));
  const daysRemaining = Math.max(0, Math.round((target - today) / MS));
  const pct = Math.min(100, Math.round((daysActive / totalDays) * 100));
  return { totalDays, daysActive, daysRemaining, pct };
};

const phaseCompletion = (phases) => {
  if (!phases || phases.length === 0) return 0;
  return Math.round(phases.reduce((s, ph) => s + (ph.completion_pct || 0), 0) / phases.length);
};

const estimatedSpent = (phases) =>
  (phases || []).reduce((s, ph) => s + (parseFloat(ph.completion_pct || 0) / 100) * parseFloat(ph.budget || 0), 0);

const PROPERTY_TYPE_LABELS = {
  single_family: 'Single Family (1 unit)',
  duplex:        'Duplex (2 units)',
  triplex:       'Triplex (3 units)',
  multi_unit:    'Multi-unit (4+ units)',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Bar({ pct, color, height = 5 }) {
  return (
    <div style={{ height, background: '#252525', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color, borderRadius: 3, transition: 'width 0.4s',
      }} />
    </div>
  );
}

function Badge({ label, bg, color }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: bg, color, letterSpacing: '0.04em' }}>
      {label}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: '#5a5855', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, color = '#f0ede8' }) {
  return (
    <div style={{ background: '#111', borderRadius: 8, padding: '12px 14px', border: '0.5px solid #222' }}>
      <div style={{ fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 300, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9a9690', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── Project Dashboard Card ───────────────────────────────────────────────────

function ProjectCard({ project }) {
  const phases = project.construction_phases || [];
  const totalBudget = parseFloat(project.labor_budget || 0) + parseFloat(project.material_budget || 0);
  const spent       = estimatedSpent(phases);
  const budgetPct   = totalBudget > 0 ? Math.round(spent / totalBudget * 100) : 0;
  const completionPct = phaseCompletion(phases);
  const timeline    = getTimeline(project.start_date, project.target_completion);
  const onTime      = timeline ? completionPct >= timeline.pct : true;
  const phaseBudgetTotal = phases.reduce((s, ph) => s + parseFloat(ph.budget || 0), 0);

  const statusColor = project.status === 'active'
    ? { bg: '#0d2b1a', color: '#7ab88a' }
    : project.status === 'delayed'
    ? { bg: '#2b1a0d', color: '#c8a96e' }
    : { bg: '#1a1a1a', color: '#9a9690' };

  return (
    <div style={{ background: '#171717', border: '0.5px solid #2a2a2a', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 3 }}>{project.name || project.properties?.address}</div>
            <div style={{ fontSize: 12, color: '#9a9690' }}>
              {project.properties?.address}{project.properties?.city ? `, ${project.properties.city}` : ''}
              {project.contractors?.name && <> &nbsp;·&nbsp; {project.contractors.name}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
            <Badge label={project.status?.toUpperCase() || 'ACTIVE'} bg={statusColor.bg} color={statusColor.color} />
            {timeline && (
              <Badge
                label={onTime ? 'ON TIME' : 'BEHIND'}
                bg={onTime ? '#0a2e18' : '#2e0a0a'}
                color={onTime ? '#7ab88a' : '#c97b6e'}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px 20px', borderBottom: '0.5px solid #222' }}>
        <StatBox
          label="Completion"
          value={`${completionPct}%`}
          color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'}
        />
        <StatBox
          label="Budget spent"
          value={fmtMoney(spent)}
          sub={`of ${fmtMoney(totalBudget)} total`}
          color='#c8a96e'
        />
        {timeline && (
          <StatBox
            label="Days active"
            value={timeline.daysActive}
            sub={`${timeline.daysRemaining} days remaining`}
            color={onTime ? '#7ab88a' : '#c97b6e'}
          />
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>

        {/* ── Completion bar ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <SectionLabel>Project Completion</SectionLabel>
            <span style={{ fontSize: 11, color: '#9a9690' }}>{completionPct}% of phases done</span>
          </div>
          <Bar
            pct={completionPct}
            color={completionPct >= 70 ? '#7ab88a' : completionPct >= 40 ? '#c8a96e' : '#6e9ec9'}
            height={8}
          />
        </div>

        {/* ── Budget bar ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <SectionLabel>Budget Utilization</SectionLabel>
            <span style={{ fontSize: 11, color: '#9a9690' }}>
              {fmtMoney(spent)} spent &nbsp;/&nbsp; {fmtMoney(totalBudget)} total &nbsp;({budgetPct}%)
            </span>
          </div>
          <Bar
            pct={budgetPct}
            color={budgetPct > 90 ? '#c97b6e' : budgetPct > 70 ? '#c8a96e' : '#7ab88a'}
            height={8}
          />
        </div>

        {/* ── Timeline chart ── */}
        {timeline && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionLabel>Project Timeline</SectionLabel>
              <span style={{ fontSize: 11, color: onTime ? '#7ab88a' : '#c97b6e' }}>
                {timeline.pct}% of schedule elapsed
              </span>
            </div>

            {/* Date label row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <div>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Start</div>
                <div style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtDate(project.start_date)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Today</div>
                <div style={{ color: onTime ? '#7ab88a' : '#c97b6e', fontWeight: 500 }}>
                  Day {timeline.daysActive} of {timeline.totalDays}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#5a5855', marginBottom: 1 }}>Target</div>
                <div style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtDate(project.target_completion)}</div>
              </div>
            </div>

            {/* Timeline bar — shows both schedule elapsed and project completion overlaid */}
            <div style={{ position: 'relative', height: 16, background: '#252525', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
              {/* Timeline elapsed (schedule) */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                height: '100%', width: `${timeline.pct}%`,
                background: onTime ? '#0d3320' : '#2e1010',
                borderRadius: 8,
              }} />
              {/* Completion marker */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                height: '100%', width: `${completionPct}%`,
                background: onTime ? '#7ab88a' : '#c97b6e',
                borderRadius: 8, opacity: 0.85,
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a5855' }}>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7ab88a', marginRight: 4, verticalAlign: 'middle' }} />
                {completionPct}% complete
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#0d3320', border: '1px solid #1a5c34', marginRight: 4, verticalAlign: 'middle' }} />
                {timeline.pct}% of time elapsed
              </span>
            </div>
          </div>
        )}

        {/* ── Phases table ── */}
        {phases.length > 0 && (
          <div>
            <SectionLabel>Construction Phases</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 36px', gap: '0 8px', fontSize: 10, color: '#5a5855', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0', borderBottom: '0.5px solid #2a2a2a', marginBottom: 2 }}>
              <div>Phase</div>
              <div style={{ textAlign: 'right' }}>Budget</div>
              <div style={{ textAlign: 'center' }}>Progress</div>
              <div style={{ textAlign: 'right' }}>%</div>
            </div>

            {phases.map(ph => {
              const done = ph.completion_pct || 0;
              return (
                <div key={ph.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 36px', gap: '0 8px', padding: '7px 0', borderBottom: '0.5px solid #1e1e1e', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ color: done === 100 ? '#7ab88a' : '#9a9690' }}>
                    {done === 100 && <span style={{ marginRight: 5 }}>✓</span>}
                    {ph.name}
                  </div>
                  <div style={{ textAlign: 'right', color: '#c8a96e', fontSize: 11 }}>
                    {fmtMoney(ph.budget)}
                  </div>
                  <div>
                    <Bar pct={done} color={done === 100 ? '#7ab88a' : '#6e9ec9'} height={4} />
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 500, fontSize: 11, color: done === 100 ? '#7ab88a' : '#f0ede8' }}>
                    {done}%
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 10, fontSize: 11, color: '#9a9690' }}>
              <span>Phase budgets total: <span style={{ color: '#c8a96e', fontWeight: 500 }}>{fmtMoney(phaseBudgetTotal)}</span></span>
              <span>Project budget: <span style={{ color: '#f0ede8', fontWeight: 500 }}>{fmtMoney(totalBudget)}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [projects, setProjects]   = useState([]);
  const [tenants, setTenants]     = useState([]);
  const [deals, setDeals]         = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [invoices, setInvoices]   = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [p, t, d, tk, inv, props] = await Promise.all([
        axios.get(`${API}/api/projects`),
        axios.get(`${API}/api/tenants`),
        axios.get(`${API}/api/deals`),
        axios.get(`${API}/api/tasks`),
        axios.get(`${API}/api/invoices`),
        axios.get(`${API}/api/properties`),
      ]);
      setProjects(p.data);
      setTenants(t.data);
      setDeals(d.data);
      setTasks(tk.data);
      setInvoices(inv.data);
      setProperties(props.data);
    } catch (err) {
      console.error('API error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview',      label: 'Overview' },
    { id: 'construction',  label: 'Construction' },
    { id: 'pm',            label: 'Property Mgmt' },
    { id: 'acquisitions',  label: 'Acquisitions' },
    { id: 'finance',       label: 'Finance' },
    { id: 'tasks',         label: 'Tasks' },
  ];

  const lateCount      = tenants.filter(t => t.payment_status === 'late').length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const delayedProjects = projects.filter(p => p.status === 'delayed').length;
  const totalSpend     = invoices.reduce((a, i) => a + parseFloat(i.amount || 0), 0);
  const overdueTasks   = tasks.filter(t => t.status === 'pending').length;

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>Cleveland Holding Group</div>
          <div style={s.headerSub}>
            Operations CRM &nbsp;—&nbsp;
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div style={s.headerBadge}>CHG</div>
      </div>

      {/* Nav */}
      <div style={s.nav}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ ...s.navBtn, ...(activeTab === tab.id ? s.navBtnActive : {}) }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.loading}>Loading CHG data...</div>
      ) : (
        <div style={s.content}>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div>
              <div style={s.metricsGrid}>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Active projects</div>
                  <div style={{ ...s.metricValue, color: '#7ab88a' }}>{activeProjects}</div>
                  {delayedProjects > 0 && <div style={s.metricSub}>{delayedProjects} delayed</div>}
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Occupied units</div>
                  <div style={{ ...s.metricValue, color: '#6e9ec9' }}>{tenants.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Late payments</div>
                  <div style={{ ...s.metricValue, color: lateCount > 0 ? '#c97b6e' : '#7ab88a' }}>{lateCount}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total spend</div>
                  <div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Deals tracked</div>
                  <div style={{ ...s.metricValue, color: '#9b8ec4' }}>{deals.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Pending tasks</div>
                  <div style={{ ...s.metricValue, color: overdueTasks > 0 ? '#c97b6e' : '#7ab88a' }}>{overdueTasks}</div>
                </div>
              </div>

              {/* Properties */}
              {properties.length > 0 && (
                <div style={s.card}>
                  <div style={s.cardTitle}>Portfolio</div>
                  {properties.map(p => (
                    <div key={p.id} style={s.row}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.address}</div>
                        <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>
                          {p.city} &nbsp;·&nbsp; {PROPERTY_TYPE_LABELS[p.property_type] || p.property_type}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Badge
                          label={(p.status || 'vacant').replace('_', ' ').toUpperCase()}
                          bg={p.status === 'under_construction' ? '#1a2d3d' : p.status === 'occupied' ? '#0d2b1a' : '#222'}
                          color={p.status === 'under_construction' ? '#6e9ec9' : p.status === 'occupied' ? '#7ab88a' : '#9a9690'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Project summary */}
              <div style={s.card}>
                <div style={s.cardTitle}>Construction projects</div>
                {projects.length === 0 ? (
                  <div style={s.empty}>No projects yet</div>
                ) : projects.map(p => {
                  const phases = p.construction_phases || [];
                  const pct = phaseCompletion(phases);
                  const timeline = getTimeline(p.start_date, p.target_completion);
                  const onTime = timeline ? pct >= timeline.pct : true;
                  return (
                    <div key={p.id} style={s.row}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name || p.properties?.address}</div>
                        <div style={{ fontSize: 12, color: '#9a9690', marginTop: 2 }}>
                          {p.contractors?.name || '—'}
                          {timeline && <> &nbsp;·&nbsp; Day {timeline.daysActive} of {timeline.totalDays}</>}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <Bar pct={pct} color={pct >= 70 ? '#7ab88a' : pct >= 40 ? '#c8a96e' : '#6e9ec9'} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 4 }}>
                          <Badge label={p.status?.toUpperCase()} bg={p.status === 'active' ? '#0d2b1a' : '#2b1a0d'} color={p.status === 'active' ? '#7ab88a' : '#c8a96e'} />
                          {timeline && <Badge label={onTime ? 'ON TIME' : 'BEHIND'} bg={onTime ? '#0a2e18' : '#2e0a0a'} color={onTime ? '#7ab88a' : '#c97b6e'} />}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 400 }}>{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {lateCount > 0 && (
                <div style={{ ...s.card, borderColor: '#c97b6e33' }}>
                  <div style={{ ...s.cardTitle, color: '#c97b6e' }}>Late rent payments</div>
                  {tenants.filter(t => t.payment_status === 'late').map(t => (
                    <div key={t.id} style={s.row}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit} — ${t.rent_amount}/mo</div>
                      </div>
                      <Badge label="LATE" bg="#3d1a1a" color="#c97b6e" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Construction ── */}
          {activeTab === 'construction' && (
            <div>
              {projects.length === 0 ? (
                <div style={s.card}><div style={s.empty}>No projects yet</div></div>
              ) : projects.map(p => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {/* ── Property Mgmt ── */}
          {activeTab === 'pm' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Tenant tracker</div>
                <div style={{ display: 'flex', fontSize: 10, color: '#5a5855', fontWeight: 600, padding: '5px 0', borderBottom: '0.5px solid #2e2e2e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div style={{ flex: 2 }}>Tenant / Unit</div>
                  <div style={{ flex: 1 }}>Rent</div>
                  <div style={{ flex: 1 }}>Status</div>
                </div>
                {tenants.length === 0 ? (
                  <div style={s.empty}>No tenants yet</div>
                ) : tenants.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit}</div>
                    </div>
                    <div style={{ flex: 1 }}>${t.rent_amount}/mo</div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={t.payment_status?.toUpperCase()}
                        bg={t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a'}
                        color={t.payment_status === 'current' ? '#7ab88a' : '#c97b6e'}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Late fee policy</div>
                <div style={{ fontSize: 13, color: '#9a9690', lineHeight: 2 }}>
                  1st late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>$69 flat fee</span><br />
                  2nd+ late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>10% of monthly rent</span> (Ohio max)<br />
                  Partial payments: <span style={{ color: '#c97b6e', fontWeight: 500 }}>Not accepted</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Acquisitions ── */}
          {activeTab === 'acquisitions' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Deal pipeline</div>
                {deals.length === 0 ? (
                  <div style={s.empty}>No deals in pipeline yet</div>
                ) : deals.map(d => (
                  <div key={d.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{d.address}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>Source: {d.source} &nbsp;|&nbsp; ROI: {d.roi_estimate}%</div>
                    </div>
                    <div style={{ flex: 1 }}>${d.asking_price?.toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <Badge label={d.opportunity_level} bg="#1a2d3d" color="#6e9ec9" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Finance ── */}
          {activeTab === 'finance' && (
            <div>
              <div style={s.metricsGrid}>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total invoices</div>
                  <div style={s.metricValue}>{invoices.length}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Total spend</div>
                  <div style={{ ...s.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={s.metric}>
                  <div style={s.metricLabel}>Expenses</div>
                  <div style={s.metricValue}>
                    ${invoices.filter(i => i.classification === 'expense').reduce((a, i) => a + parseFloat(i.amount || 0), 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Invoice log</div>
                {invoices.length === 0 ? (
                  <div style={s.empty}>No invoices logged yet</div>
                ) : invoices.map(inv => (
                  <div key={inv.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{inv.vendor}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{inv.properties?.address}</div>
                    </div>
                    <div style={{ flex: 1, fontWeight: 500 }}>${parseFloat(inv.amount).toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={inv.classification}
                        bg={inv.classification === 'expense' ? '#2d2a1a' : '#1a3d2b'}
                        color={inv.classification === 'expense' ? '#c8a96e' : '#7ab88a'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tasks ── */}
          {activeTab === 'tasks' && (
            <div>
              <div style={s.card}>
                <div style={s.cardTitle}>Recurring tasks</div>
                {tasks.length === 0 ? (
                  <div style={s.empty}>No tasks yet</div>
                ) : tasks.map(t => (
                  <div key={t.id} style={s.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>
                        {t.properties?.address} — Due day: {t.due_day}
                      </div>
                      {t.confirmation_number && (
                        <div style={{ fontSize: 12, color: '#7ab88a', marginTop: 2 }}>
                          Confirmation: {t.confirmation_number}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <Badge
                        label={t.status}
                        bg={t.status === 'completed' ? '#1a3d2b' : '#3d2a1a'}
                        color={t.status === 'completed' ? '#7ab88a' : '#c8a96e'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  app:          { background: '#0f0f0f', minHeight: '100vh', color: '#f0ede8', fontFamily: "'DM Sans', -apple-system, sans-serif", paddingBottom: 60 },
  header:       { background: '#141414', borderBottom: '0.5px solid #242424', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:  { fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em' },
  headerSub:    { fontSize: 12, color: '#5a5855', marginTop: 4 },
  headerBadge:  { width: 40, height: 40, borderRadius: 8, background: '#c8a96e15', border: '0.5px solid #c8a96e33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#c8a96e' },
  nav:          { display: 'flex', gap: 6, padding: '14px 32px', borderBottom: '0.5px solid #242424', flexWrap: 'wrap' },
  navBtn:       { fontSize: 13, padding: '7px 16px', borderRadius: 20, border: '0.5px solid #2a2a2a', background: 'transparent', cursor: 'pointer', color: '#9a9690', fontFamily: 'inherit' },
  navBtnActive: { background: '#1e1e1e', color: '#f0ede8', fontWeight: 500, border: '0.5px solid #3a3a3a' },
  content:      { padding: '20px 32px 0' },
  loading:      { textAlign: 'center', padding: 60, color: '#5a5855' },
  metricsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 },
  metric:       { background: '#1a1a1a', borderRadius: 10, padding: '14px 16px', border: '0.5px solid #242424' },
  metricLabel:  { fontSize: 10, color: '#5a5855', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  metricValue:  { fontSize: 24, fontWeight: 300 },
  metricSub:    { fontSize: 11, color: '#c97b6e', marginTop: 3 },
  card:         { background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 12, padding: '16px 20px', marginBottom: 14 },
  cardTitle:    { fontSize: 14, fontWeight: 500, marginBottom: 14 },
  empty:        { textAlign: 'center', color: '#5a5855', fontSize: 13, padding: '20px 0' },
  row:          { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #222' },
  tableRow:     { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #222', fontSize: 13 },
};

export default App;

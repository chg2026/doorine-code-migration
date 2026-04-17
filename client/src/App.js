import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:3000';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [projects, setProjects] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [p, t, d, tk, inv] = await Promise.all([
        axios.get(`${API}/api/projects`),
        axios.get(`${API}/api/tenants`),
        axios.get(`${API}/api/deals`),
        axios.get(`${API}/api/tasks`),
        axios.get(`${API}/api/invoices`)
      ]);
      setProjects(p.data);
      setTenants(t.data);
      setDeals(d.data);
      setTasks(tk.data);
      setInvoices(inv.data);
    } catch (err) {
      console.error('API error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'construction', label: 'Construction' },
    { id: 'pm', label: 'Property Mgmt' },
    { id: 'acquisitions', label: 'Acquisitions' },
    { id: 'finance', label: 'Finance' },
    { id: 'tasks', label: 'Tasks' },
  ];

  const lateCount = tenants.filter(t => t.payment_status === 'late').length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const delayedProjects = projects.filter(p => p.status === 'delayed').length;
  const totalSpend = invoices.reduce((a, i) => a + parseFloat(i.amount || 0), 0);
  const overdueTasks = tasks.filter(t => t.status === 'pending').length;

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Cleveland Holding Group</div>
          <div style={styles.headerSub}>Operations CRM — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div style={styles.headerBadge}>CHG</div>
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...styles.navBtn, ...(activeTab === tab.id ? styles.navBtnActive : {}) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>Loading CHG data...</div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div style={styles.metricsGrid}>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Active projects</div>
                  <div style={{ ...styles.metricValue, color: '#7ab88a' }}>{activeProjects}</div>
                  {delayedProjects > 0 && <div style={styles.metricSub}>{delayedProjects} delayed</div>}
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Occupied units</div>
                  <div style={{ ...styles.metricValue, color: '#6e9ec9' }}>{tenants.length}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Late payments</div>
                  <div style={{ ...styles.metricValue, color: lateCount > 0 ? '#c97b6e' : '#7ab88a' }}>{lateCount}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Total spend</div>
                  <div style={{ ...styles.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Deals tracked</div>
                  <div style={{ ...styles.metricValue, color: '#9b8ec4' }}>{deals.length}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Pending tasks</div>
                  <div style={{ ...styles.metricValue, color: overdueTasks > 0 ? '#c97b6e' : '#7ab88a' }}>{overdueTasks}</div>
                </div>
              </div>

              {/* Project summary */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>Construction projects</div>
                {projects.length === 0 ? (
                  <div style={styles.empty}>No projects yet — add one in Construction tab</div>
                ) : projects.map(p => (
                  <div key={p.id} style={styles.projectRow}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.projectAddr}>{p.properties?.address || 'Unknown address'}</div>
                      <div style={styles.projectMeta}>Contractor: {p.contractors?.name || '—'}</div>
                      <div style={styles.progressBar}>
                        <div style={{ ...styles.progressFill, width: `${p.overall_pct || 0}%`, background: p.overall_pct >= 70 ? '#7ab88a' : p.overall_pct >= 40 ? '#c8a96e' : '#c97b6e' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 16 }}>
                      <div style={{ ...styles.statusBadge, background: p.status === 'active' ? '#1a3d2b' : '#3d1a1a', color: p.status === 'active' ? '#7ab88a' : '#c97b6e' }}>{p.status}</div>
                      <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6 }}>{p.overall_pct || 0}%</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Late tenants alert */}
              {lateCount > 0 && (
                <div style={{ ...styles.card, borderColor: '#c97b6e' }}>
                  <div style={{ ...styles.cardTitle, color: '#c97b6e' }}>Late rent payments</div>
                  {tenants.filter(t => t.payment_status === 'late').map(t => (
                    <div key={t.id} style={styles.projectRow}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.projectAddr}>{t.name}</div>
                        <div style={styles.projectMeta}>{t.unit} — ${t.rent_amount}/mo</div>
                      </div>
                      <div style={{ ...styles.statusBadge, background: '#3d1a1a', color: '#c97b6e' }}>LATE</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Construction Tab */}
          {activeTab === 'construction' && (
            <div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Active construction projects</div>
                {projects.length === 0 ? (
                  <div style={styles.empty}>No projects yet</div>
                ) : projects.map(p => (
                  <div key={p.id} style={{ ...styles.card, marginBottom: 12 }}>
                    <div style={styles.projectRow}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.projectAddr}>{p.properties?.address || 'Unknown'}</div>
                        <div style={styles.projectMeta}>
                          Contractor: {p.contractors?.name || '—'} &nbsp;|&nbsp;
                          Budget: ${(parseFloat(p.labor_budget || 0) + parseFloat(p.material_budget || 0)).toLocaleString()} &nbsp;|&nbsp;
                          Spent: ${(parseFloat(p.labor_spent || 0) + parseFloat(p.material_spent || 0)).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ ...styles.statusBadge, background: p.status === 'active' ? '#1a3d2b' : '#3d1a1a', color: p.status === 'active' ? '#7ab88a' : '#c97b6e' }}>{p.status}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, marginLeft: 12 }}>{p.overall_pct || 0}%</div>
                    </div>
                    <div style={styles.progressBar}>
                      <div style={{ ...styles.progressFill, width: `${p.overall_pct || 0}%`, background: p.overall_pct >= 70 ? '#7ab88a' : p.overall_pct >= 40 ? '#c8a96e' : '#c97b6e' }} />
                    </div>
                    {p.construction_phases && p.construction_phases.map(ph => (
                      <div key={ph.id} style={styles.phaseRow}>
                        <div style={{ width: 140, fontSize: 12, color: '#9a9690' }}>{ph.name}</div>
                        <div style={{ flex: 1, margin: '0 12px' }}>
                          <div style={styles.progressBar}>
                            <div style={{ ...styles.progressFill, width: `${ph.completion_pct || 0}%`, background: '#6e9ec9' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, width: 35 }}>{ph.completion_pct || 0}%</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Property Management Tab */}
          {activeTab === 'pm' && (
            <div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Tenant tracker</div>
                <div style={styles.tableHeader}>
                  <div style={{ flex: 2 }}>Tenant / Unit</div>
                  <div style={{ flex: 1 }}>Rent</div>
                  <div style={{ flex: 1 }}>Status</div>
                </div>
                {tenants.length === 0 ? (
                  <div style={styles.empty}>No tenants yet</div>
                ) : tenants.map(t => (
                  <div key={t.id} style={styles.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{t.unit}</div>
                    </div>
                    <div style={{ flex: 1 }}>${t.rent_amount}/mo</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...styles.statusBadge, background: t.payment_status === 'current' ? '#1a3d2b' : '#3d1a1a', color: t.payment_status === 'current' ? '#7ab88a' : '#c97b6e' }}>
                        {t.payment_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Late fee policy</div>
                <div style={{ fontSize: 13, color: '#9a9690', lineHeight: 2 }}>
                  1st late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>$69 flat fee</span><br />
                  2nd+ late payment: <span style={{ color: '#f0ede8', fontWeight: 500 }}>10% of monthly rent</span> (Ohio max)<br />
                  Partial payments: <span style={{ color: '#c97b6e', fontWeight: 500 }}>Not accepted</span>
                </div>
              </div>
            </div>
          )}

          {/* Acquisitions Tab */}
          {activeTab === 'acquisitions' && (
            <div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Deal pipeline</div>
                {deals.length === 0 ? (
                  <div style={styles.empty}>No deals in pipeline yet</div>
                ) : deals.map(d => (
                  <div key={d.id} style={styles.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{d.address}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>Source: {d.source} | ROI: {d.roi_estimate}%</div>
                    </div>
                    <div style={{ flex: 1 }}>${d.asking_price?.toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...styles.statusBadge, background: '#1a2d3d', color: '#6e9ec9' }}>{d.opportunity_level}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Finance Tab */}
          {activeTab === 'finance' && (
            <div>
              <div style={styles.metricsGrid}>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Total invoices</div>
                  <div style={styles.metricValue}>{invoices.length}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Total spend</div>
                  <div style={{ ...styles.metricValue, color: '#c8a96e' }}>${totalSpend.toLocaleString()}</div>
                </div>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Expenses</div>
                  <div style={styles.metricValue}>${invoices.filter(i => i.classification === 'expense').reduce((a, i) => a + parseFloat(i.amount || 0), 0).toLocaleString()}</div>
                </div>
              </div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Invoice log</div>
                {invoices.length === 0 ? (
                  <div style={styles.empty}>No invoices logged yet</div>
                ) : invoices.map(inv => (
                  <div key={inv.id} style={styles.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{inv.vendor}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{inv.properties?.address}</div>
                    </div>
                    <div style={{ flex: 1, fontWeight: 500 }}>${parseFloat(inv.amount).toLocaleString()}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...styles.statusBadge, background: inv.classification === 'expense' ? '#2d2a1a' : '#1a3d2b', color: inv.classification === 'expense' ? '#c8a96e' : '#7ab88a' }}>
                        {inv.classification}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Recurring tasks</div>
                {tasks.length === 0 ? (
                  <div style={styles.empty}>No tasks yet</div>
                ) : tasks.map(t => (
                  <div key={t.id} style={styles.tableRow}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#9a9690' }}>{t.properties?.address} — Due day: {t.due_day}</div>
                      {t.confirmation_number && <div style={{ fontSize: 12, color: '#7ab88a', marginTop: 2 }}>Confirmation: {t.confirmation_number}</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...styles.statusBadge, background: t.status === 'completed' ? '#1a3d2b' : '#3d2a1a', color: t.status === 'completed' ? '#7ab88a' : '#c8a96e' }}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  app: { background: '#0f0f0f', minHeight: '100vh', color: '#f0ede8', fontFamily: "'DM Sans', -apple-system, sans-serif", padding: '0 0 40px' },
  header: { background: '#1a1a1a', borderBottom: '0.5px solid #2e2e2e', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em' },
  headerSub: { fontSize: 12, color: '#5a5855', marginTop: 4 },
  headerBadge: { width: 40, height: 40, borderRadius: 8, background: '#c8a96e22', border: '0.5px solid #c8a96e44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#c8a96e' },
  nav: { display: 'flex', gap: 6, padding: '16px 32px', borderBottom: '0.5px solid #2e2e2e', flexWrap: 'wrap' },
  navBtn: { fontSize: 13, padding: '7px 16px', borderRadius: 20, border: '0.5px solid #2e2e2e', background: 'transparent', cursor: 'pointer', color: '#9a9690', fontFamily: 'inherit' },
  navBtnActive: { background: '#1a1a1a', color: '#f0ede8', fontWeight: 500, border: '0.5px solid #3a3a3a' },
  loading: { textAlign: 'center', padding: 60, color: '#5a5855' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '20px 32px' },
  metric: { background: '#1a1a1a', borderRadius: 8, padding: '14px 16px' },
  metricLabel: { fontSize: 11, color: '#5a5855', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' },
  metricValue: { fontSize: 24, fontWeight: 300 },
  metricSub: { fontSize: 11, color: '#c97b6e', marginTop: 3 },
  card: { background: '#1a1a1a', border: '0.5px solid #2e2e2e', borderRadius: 12, padding: '16px 20px', margin: '0 32px 14px' },
  cardTitle: { fontSize: 14, fontWeight: 500, marginBottom: 14, color: '#f0ede8' },
  empty: { textAlign: 'center', color: '#5a5855', fontSize: 13, padding: '20px 0' },
  projectRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #2e2e2e' },
  projectAddr: { fontSize: 14, fontWeight: 500 },
  projectMeta: { fontSize: 12, color: '#9a9690', marginTop: 3 },
  progressBar: { height: 4, background: '#2e2e2e', borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 2, transition: 'width 0.3s' },
  statusBadge: { fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 500 },
  phaseRow: { display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #1f1f1f' },
  tableHeader: { display: 'flex', fontSize: 11, color: '#5a5855', fontWeight: 500, padding: '6px 0', borderBottom: '0.5px solid #2e2e2e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  tableRow: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #2e2e2e', fontSize: 13 },
};

export default App;
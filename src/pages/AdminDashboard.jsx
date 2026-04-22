import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Status, Tag } from '../components/UI.jsx';

export default function AdminDashboard() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [menu, setMenu] = React.useState(null);

  const counts = state.deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const filtered = state.deals.filter(d => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${d.addr} ${d.zip} ${d.city}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <AdminShell tab="deals">
      <div style={{ padding: '24px 24px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Kicker>{state.deals.length} deals · {counts.active || 0} active · {counts.pending || 0} pending · {counts.sold || 0} sold</Kicker>
          <div className="serif" style={{ fontSize: 28, marginTop: 6 }}>Inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/import" className="btn sm">Import CSV</Link>
          <Link to="/admin/deal/new" className="btn sm solid">+ Add deal</Link>
        </div>
      </div>

      <div style={{ padding: '0 24px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['all', `All ${state.deals.length}`], ['active', `Active ${counts.active || 0}`], ['pending', `Pending ${counts.pending || 0}`], ['sold', `Sold ${counts.sold || 0}`]].map(([k, l]) => (
          <Tag key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Tag>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            placeholder="Search address, zip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240, fontSize: 12 }}
          />
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 60, textAlign: 'center' }}>
            <div className="serif" style={{ fontSize: 20 }}>{state.deals.length === 0 ? 'No deals yet' : 'Nothing matches'}</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>
              {state.deals.length === 0 ? 'Add your first deal to get started.' : 'Try a different filter or search.'}
            </div>
            {state.deals.length === 0 && (
              <div style={{ display: 'inline-flex', gap: 8, marginTop: 18 }}>
                <Link to="/admin/deal/new" className="btn sm solid">+ Add deal</Link>
                <Link to="/admin/import" className="btn sm">Import CSV</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="table" style={{ overflowX: 'auto' }}>
            <div className="row head" style={{ gridTemplateColumns: '2fr .8fr .6fr .8fr .8fr 1fr 60px', minWidth: 720 }}>
              <span>Address</span><span>ZIP</span><span>Type</span><span>Ask</span><span>ARV</span><span>Status</span><span></span>
            </div>
            {filtered.map(d => (
              <div key={d.id} className="row" style={{ gridTemplateColumns: '2fr .8fr .6fr .8fr .8fr 1fr 60px', minWidth: 720, position: 'relative' }}>
                <Link to={`/admin/deal/${d.id}`} className="ellipsis" style={{ fontWeight: 500, color: 'var(--ink)' }}>{d.addr}</Link>
                <span className="mono" style={{ color: 'var(--mute)' }}>{d.zip}</span>
                <span className="mono" style={{ color: 'var(--mute)' }}>{d.type}</span>
                <span className="mono">${d.ask}k</span>
                <span className="mono" style={{ color: 'var(--mute)' }}>${d.arv}k</span>
                <Status kind={d.status} />
                <div style={{ position: 'relative', textAlign: 'right' }}>
                  <button onClick={() => setMenu(menu === d.id ? null : d.id)} style={{ background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>⋯</button>
                  {menu === d.id && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--card)', border: '1px solid var(--line)', minWidth: 180, zIndex: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} onMouseLeave={() => setMenu(null)}>
                      <Link to={`/admin/deal/${d.id}`} style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>Edit</Link>
                      <Link to={`/p/${state.profile.handle}/${d.id}`} target="_blank" style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>View public ↗</Link>
                      <button onClick={() => { dispatch({ type: 'update_profile', patch: { featuredId: d.id } }); setMenu(null); show('Featured updated'); }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)' }}>Set as featured</button>
                      {['active', 'pending', 'sold'].filter(s => s !== d.status).map(s => (
                        <button key={s} onClick={() => { dispatch({ type: 'update_deal', id: d.id, patch: { status: s } }); setMenu(null); show(`Marked ${s}`); }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)' }}>Mark {s}</button>
                      ))}
                      <button onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: d.id }); setMenu(null); show('Deal deleted'); } }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--err)' }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {node}
    </AdminShell>
  );
}

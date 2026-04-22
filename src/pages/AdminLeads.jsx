import React from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { useStore } from '../store.jsx';
import { Kicker } from '../components/UI.jsx';

export default function AdminLeads() {
  const { state } = useStore();
  const leads = state.leads;
  const dealMap = Object.fromEntries(state.deals.map(d => [d.id, d]));

  return (
    <AdminShell tab="leads">
      <div style={{ padding: '24px 24px 14px' }}>
        <Kicker>{leads.length} total · {leads.filter(l => l.kind === 'deal-interest').length} deal interest · {leads.filter(l => l.kind === 'buyer-list').length} buyer list</Kicker>
        <div className="serif" style={{ fontSize: 28, marginTop: 6 }}>Leads</div>
      </div>

      <div style={{ padding: '0 24px 24px', flex: 1 }}>
        {leads.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 60, textAlign: 'center' }}>
            <div className="serif" style={{ fontSize: 20 }}>No leads yet</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>
              Share your link — buyers who tap "I'm interested" land here.
            </div>
            <Link to={`/p/${state.profile.handle}`} className="btn sm" style={{ marginTop: 18 }} target="_blank">Open public profile ↗</Link>
          </div>
        ) : (
          <div className="table" style={{ overflowX: 'auto' }}>
            <div className="row head" style={{ gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr 1.6fr 1fr', minWidth: 760 }}>
              <span>Name</span><span>Email</span><span>Phone</span><span>Type</span><span>Deal</span><span>When</span>
            </div>
            {leads.map(l => {
              const deal = l.dealId ? dealMap[l.dealId] : null;
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr 1.6fr 1fr', minWidth: 760 }}>
                  <span>{[l.first, l.last].filter(Boolean).join(' ') || '—'}</span>
                  <span className="mono" style={{ fontSize: 12 }}>{l.email}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{l.phone || '—'}</span>
                  <span style={{ fontSize: 12 }}>{l.buyerType || '—'}</span>
                  <span className="ellipsis">{deal ? <Link to={`/admin/deal/${deal.id}`}>{deal.addr}</Link> : <span style={{ color: 'var(--mute)' }}>Buyer list</span>}</span>
                  <span style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>{relTime(l.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function relTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

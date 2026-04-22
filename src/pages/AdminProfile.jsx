import React from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Avatar, Field } from '../components/UI.jsx';
import { Link } from 'react-router-dom';

export default function AdminProfile() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [form, setForm] = React.useState(state.profile);

  function save(e) {
    e.preventDefault();
    dispatch({ type: 'update_profile', patch: form });
    show('Profile saved');
  }

  return (
    <AdminShell tab="profile">
      <div style={{ padding: '24px 24px 14px' }}>
        <Kicker>Public profile</Kicker>
        <div className="serif" style={{ fontSize: 28, marginTop: 6 }}>How buyers see you</div>
      </div>

      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, alignItems: 'start' }}>
        <form onSubmit={save} style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Avatar size={56} initials={form.initials} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>@{form.handle}</div>
              <Link to={`/p/${state.profile.handle}`} target="_blank" style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--mono)' }}>deallink.io/{state.profile.handle} ↗</Link>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Display name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Initials"><input value={form.initials} maxLength={3} onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })} /></Field>
            <Field label="Handle"><input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="City / region"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Featured deal">
              <select value={form.featuredId || ''} onChange={(e) => setForm({ ...form, featuredId: e.target.value || null })}>
                <option value="">Auto · first active</option>
                {state.deals.filter(d => d.status !== 'sold').map(d => <option key={d.id} value={d.id}>{d.addr}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Bio (single line)"><input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => setForm(state.profile)}>Reset</button>
            <button type="submit" className="btn sm solid">Save changes</button>
          </div>
        </form>

        <aside style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 16 }}>
          <Kicker>This month</Kicker>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--mono)', fontSize: 12 }}>
            <Row l="Active deals" v={state.deals.filter(d => d.status === 'active').length} />
            <Row l="Pending" v={state.deals.filter(d => d.status === 'pending').length} />
            <Row l="Sold" v={state.deals.filter(d => d.status === 'sold').length} />
            <Row l="Leads" v={state.leads.length} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn sm full" onClick={() => { navigator.clipboard?.writeText(`https://deallink.io/${state.profile.handle}`); show('Link copied'); }}>Copy public link</button>
          </div>
        </aside>
      </div>
      {node}
    </AdminShell>
  );
}

function Row({ l, v }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--mute)' }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
}

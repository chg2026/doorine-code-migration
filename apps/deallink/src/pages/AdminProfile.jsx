import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Copy } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Select, Textarea, Field, PageHeader } from '../components/ui.jsx';
import { initialsOf } from '../lib/utils.js';

export default function AdminProfile() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [form, setForm] = React.useState(state.profile);

  React.useEffect(() => { if (state.loaded) setForm(state.profile); }, [state.loaded, state.profile]);

  function save(e) {
    e.preventDefault();
    dispatch({ type: 'update_profile', patch: form });
    show('Profile saved');
  }

  if (!state.loaded) {
    return <Layout><div className="py-32 text-center text-slate-400 text-xs font-mono">Loading profile…</div></Layout>;
  }

  const counts = state.deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});

  return (
    <Layout>
      <PageHeader title="Public profile" subtitle="How buyers see you" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <form onSubmit={save}>
            <CardHeader><CardTitle>Profile details</CardTitle></CardHeader>
            <CardBody>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 font-bold text-lg">{form.initials || initialsOf(form.name || form.handle)}</div>
                <div>
                  <p className="text-white text-sm font-semibold">@{form.handle || 'unclaimed'}</p>
                  {form.handle && (
                    <a href={`/p/${form.handle}`} target="_blank" rel="noreferrer" className="text-amber-400 text-xs hover:underline flex items-center gap-1">
                      deallink.io/{form.handle} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Display name"><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Initials"><Input value={form.initials || ''} maxLength={3} onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })} /></Field>
                <Field label="Handle"><Input value={form.handle || ''} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '') })} /></Field>
                <Field label="Email"><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="City / region"><Input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                <Field label="Featured deal">
                  <Select value={form.featuredId || ''} onChange={(e) => setForm({ ...form, featuredId: e.target.value || null })}>
                    <option value="">Auto · first active</option>
                    {state.deals.filter((d) => !['Closed', 'Dead'].includes(d.status)).map((d) => <option key={d.id} value={d.id}>{d.addr}</option>)}
                  </Select>
                </Field>
                <div className="md:col-span-2"><Field label="Bio"><Textarea rows={3} value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field></div>
                <div className="md:col-span-2 flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <input id="optin" type="checkbox" checked={!!form.marketplaceOptIn} onChange={(e) => setForm({ ...form, marketplaceOptIn: e.target.checked })} className="w-4 h-4 accent-amber-400" />
                  <label htmlFor="optin" className="text-sm text-slate-300">List my deals on the cross-wholesaler <Link to="/marketplace" className="text-amber-400 hover:underline">Marketplace</Link></label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="secondary" onClick={() => setForm(state.profile)}>Reset</Button>
                <Button type="submit">Save changes</Button>
              </div>
            </CardBody>
          </form>
        </Card>

        <Card>
          <CardHeader><CardTitle>This month</CardTitle></CardHeader>
          <CardBody>
            <div className="space-y-2 text-sm">
              <Row l="New" v={counts['New'] || 0} />
              <Row l="Marketed" v={counts['Marketed'] || 0} />
              <Row l="Under Contract" v={counts['Under Contract'] || 0} />
              <Row l="Closed" v={counts['Closed'] || 0} />
              <Row l="Dead" v={counts['Dead'] || 0} />
              <Row l="Leads" v={state.leads.length} />
              <Row l="Buyers" v={state.buyers.length} />
              <Row l="Offers" v={state.offers.length} />
            </div>
            {state.profile.handle && (
              <Button variant="secondary" className="w-full mt-4" onClick={() => { navigator.clipboard?.writeText(`https://deallink.io/${state.profile.handle}`); show('Link copied'); }}>
                <Copy className="w-4 h-4" /> Copy public link
              </Button>
            )}
          </CardBody>
        </Card>
      </div>
      {node}
    </Layout>
  );
}

function Row({ l, v }) {
  return <div className="flex justify-between"><span className="text-slate-400">{l}</span><span className="text-white font-semibold">{v}</span></div>;
}

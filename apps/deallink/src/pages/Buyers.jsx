import React from 'react';
import { Plus, Search, Mail, Phone, MapPin, Send, Trash2 } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, Input, Modal, Field, Select, Textarea, PageHeader } from '../components/ui.jsx';
import { initialsOf } from '../lib/utils.js';

const TYPE_COLORS = {
  'Cash Buyer': 'bg-green-400/20 text-green-300',
  'Wholesaler': 'bg-blue-400/20 text-blue-300',
  'Flipper':    'bg-[rgba(184,134,11,0.10)] text-[#b8860b]',
  'Landlord':   'bg-purple-400/20 text-purple-300',
  'Developer':  'bg-rose-400/20 text-rose-300',
  'Agent':      'bg-cyan-400/20 text-cyan-300',
};
const TYPES = Object.keys(TYPE_COLORS);

export default function Buyers() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('All');
  const [showModal, setShowModal] = React.useState(false);

  const buyers = state.buyers;
  const filtered = buyers.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.name.toLowerCase().includes(q) || (b.email || '').toLowerCase().includes(q);
    const matchType = typeFilter === 'All' || b.buyerType === typeFilter;
    return matchSearch && matchType;
  });

  // dedupe-from-leads helper
  const leadEmails = new Set(buyers.map((b) => (b.email || '').toLowerCase()));
  const dedupableLeads = state.leads.filter((l) => l.email && !leadEmails.has(l.email.toLowerCase()));

  function importFromLeads() {
    if (!dedupableLeads.length) return;
    dedupableLeads.forEach((l) => {
      dispatch({ type: 'add_buyer', buyer: {
        name: [l.first, l.last].filter(Boolean).join(' ') || l.email,
        email: l.email,
        phone: l.phone || '',
        buyerType: l.buyerType === 'Cash' ? 'Cash Buyer' : (l.buyerType || 'Cash Buyer'),
        source: 'lead',
      }});
    });
    show(`${dedupableLeads.length} buyers imported from leads`);
  }

  return (
    <Layout>
      <PageHeader
        title="Buyers List"
        subtitle={`${buyers.length} buyer${buyers.length === 1 ? '' : 's'} in your network`}
        actions={<>
          {dedupableLeads.length > 0 && <Button variant="secondary" onClick={importFromLeads}>Import {dedupableLeads.length} from leads</Button>}
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add buyer</Button>
        </>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e6e73]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyers..." className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...TYPES].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-[#b8860b] text-white' : 'bg-[rgba(0,0,0,0.06)] text-[#6e6e73] border border-[rgba(0,0,0,0.08)] hover:text-[#1d1d1f]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-16 px-6">
          <p className="text-[#1d1d1f] font-semibold">{buyers.length === 0 ? 'No buyers yet' : 'No matches'}</p>
          <p className="text-[#6e6e73] text-sm mt-2">{buyers.length === 0 ? 'Add buyers manually or import from your leads.' : 'Try a different filter.'}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <Card key={b.id} className="p-5 hover:border-[rgba(0,0,0,0.12)] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.06)] flex items-center justify-center text-[#1d1d1f] font-bold text-sm flex-shrink-0">{initialsOf(b.name)}</div>
                  <div className="min-w-0">
                    <p className="text-[#1d1d1f] font-semibold text-sm truncate">{b.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[b.buyerType] || 'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c]'}`}>{b.buyerType}</span>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${b.status === 'Active' ? 'bg-green-400' : 'bg-[#86868b]'}`} title={b.status} />
              </div>
              <div className="space-y-2">
                {b.email && <div className="flex items-center gap-2 text-[#6e6e73] text-xs"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{b.email}</span></div>}
                {b.phone && <div className="flex items-center gap-2 text-[#6e6e73] text-xs"><Phone className="w-3 h-3 flex-shrink-0" /><span>{b.phone}</span></div>}
                {b.markets?.length > 0 && <div className="flex items-center gap-2 text-[#6e6e73] text-xs"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{b.markets.join(', ')}</span></div>}
              </div>
              <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <div>
                  <p className="text-[#86868b] text-xs">Budget</p>
                  <p className="text-[#1d1d1f] text-xs font-semibold">{(b.minPrice || b.maxPrice) ? `$${Number(b.minPrice).toLocaleString()} – $${Number(b.maxPrice).toLocaleString()}` : '—'}</p>
                </div>
                <div className="flex gap-1">
                  <button title="Send deal" className="text-xs bg-[rgba(0,0,0,0.06)] hover:bg-[#b8860b] hover:text-[#1d1d1f] text-white p-2 rounded-lg transition-colors"><Send className="w-3 h-3" /></button>
                  <button onClick={() => { if (confirm(`Delete ${b.name}?`)) { dispatch({ type: 'remove_buyer', id: b.id }); show('Buyer deleted'); } }} title="Delete" className="text-xs bg-[rgba(0,0,0,0.06)] hover:bg-red-500 text-white p-2 rounded-lg transition-colors"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddBuyerModal open={showModal} onClose={() => setShowModal(false)} onSave={(b) => { dispatch({ type: 'add_buyer', buyer: b }); show('Buyer added'); setShowModal(false); }} />
      {node}
    </Layout>
  );
}

function AddBuyerModal({ open, onClose, onSave }) {
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', buyerType: 'Cash Buyer', markets: '', minPrice: '', maxPrice: '', notes: '' });
  React.useEffect(() => { if (open) setForm({ name: '', email: '', phone: '', buyerType: 'Cash Buyer', markets: '', minPrice: '', maxPrice: '', notes: '' }); }, [open]);

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      markets: form.markets ? form.markets.split(',').map((s) => s.trim()).filter(Boolean) : [],
      minPrice: Number(form.minPrice) || 0,
      maxPrice: Number(form.maxPrice) || 0,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add new buyer">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Full name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></Field></div>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Buyer type"><Select value={form.buyerType} onChange={(e) => setForm({ ...form, buyerType: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Markets (comma-sep)"><Input value={form.markets} onChange={(e) => setForm({ ...form, markets: e.target.value })} placeholder="Atlanta, GA" /></Field>
          <Field label="Min budget"><Input type="number" value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: e.target.value })} /></Field>
          <Field label="Max budget"><Input type="number" value={form.maxPrice} onChange={(e) => setForm({ ...form, maxPrice: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1">Save buyer</Button>
        </div>
      </form>
    </Modal>
  );
}

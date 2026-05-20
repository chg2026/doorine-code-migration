import React from 'react';
import { Plus, Building2, User, CheckCircle2, XCircle, Clock, MessageSquare, Trash2 } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore, useToast } from '../store.jsx';
import { Card, CardHeader, CardTitle, Button, Input, Modal, Field, Select, Textarea, PageHeader } from '../components/ui.jsx';
import { formatRelTime } from '../lib/utils.js';

const STATUS_CFG = {
  Pending:   { color: 'bg-[rgba(184,134,11,0.10)] text-[#b8860b]', icon: Clock },
  Accepted:  { color: 'bg-green-400/20 text-green-300', icon: CheckCircle2 },
  Rejected:  { color: 'bg-red-400/20 text-red-300',     icon: XCircle },
  Countered: { color: 'bg-blue-400/20 text-blue-300',   icon: MessageSquare },
};
const STATUSES = Object.keys(STATUS_CFG);

export default function Offers() {
  const { state, dispatch } = useStore();
  const { show, node } = useToast();
  const [showModal, setShowModal] = React.useState(false);

  const offers = state.offers;
  const dealMap = Object.fromEntries(state.deals.map((d) => [d.id, d]));
  const counts = { Pending: 0, Accepted: 0, Rejected: 0, Countered: 0 };
  offers.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });

  return (
    <Layout>
      <PageHeader
        title="Offers"
        subtitle={`${offers.length} total · ${counts.Pending} pending`}
        actions={<Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New offer</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATUSES.map((s) => {
          const Icon = STATUS_CFG[s].icon;
          return (
            <Card key={s} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#6e6e73] text-xs">{s}</p>
                  <p className="text-[#1d1d1f] text-2xl font-bold mt-1">{counts[s] || 0}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${STATUS_CFG[s].color}`}><Icon className="w-4 h-4" /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>All offers</CardTitle></CardHeader>
        {offers.length === 0 ? (
          <div className="px-5 py-12 text-center text-[#86868b] text-sm">No offers yet.</div>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.08)]">
            {offers.map((o) => {
              const deal = o.dealId ? dealMap[o.dealId] : null;
              const cfg = STATUS_CFG[o.status] || STATUS_CFG.Pending;
              const Icon = cfg.icon;
              return (
                <div key={o.id} className="px-5 py-4 hover:bg-[rgba(0,0,0,0.03)] transition-colors flex items-center gap-4">
                  <div className="w-10 h-10 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-[#6e6e73]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[#1d1d1f] text-sm font-medium truncate">{deal ? deal.addr : '— deal removed —'}</p>
                    <p className="text-[#6e6e73] text-xs truncate flex items-center gap-1.5"><User className="w-3 h-3" /> {o.buyerName || 'Anonymous buyer'}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-[#1d1d1f] text-sm font-semibold">${Number(o.amount).toLocaleString()}</p>
                    {deal && <p className="text-[#86868b] text-xs">vs ${Number(deal.ask || 0).toLocaleString()} ask</p>}
                  </div>
                  <Select value={o.status} onChange={(e) => dispatch({ type: 'update_offer', id: o.id, patch: { status: e.target.value } })} className="w-32">
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                  <div className={`text-xs px-2 py-1 rounded-full font-medium hidden lg:flex items-center gap-1 ${cfg.color}`}><Icon className="w-3 h-3" />{o.status}</div>
                  <span className="text-[#86868b] text-xs hidden xl:block">{formatRelTime(o.createdAt)}</span>
                  <button onClick={() => { if (confirm('Delete this offer?')) { dispatch({ type: 'remove_offer', id: o.id }); show('Offer deleted'); } }} className="text-[#6e6e73] hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <NewOfferModal open={showModal} onClose={() => setShowModal(false)} deals={state.deals} buyers={state.buyers} onSave={(o) => { dispatch({ type: 'add_offer', offer: o }); show('Offer added'); setShowModal(false); }} />
      {node}
    </Layout>
  );
}

function NewOfferModal({ open, onClose, deals, buyers, onSave }) {
  const [form, setForm] = React.useState({ dealId: '', buyerId: '', buyerName: '', amount: '', status: 'Pending', notes: '' });
  React.useEffect(() => { if (open) setForm({ dealId: deals[0]?.id || '', buyerId: '', buyerName: '', amount: '', status: 'Pending', notes: '' }); }, [open, deals]);

  function submit(e) {
    e.preventDefault();
    if (!form.dealId || !form.amount) return;
    const buyer = buyers.find((b) => b.id === form.buyerId);
    onSave({
      dealId: form.dealId,
      buyerId: form.buyerId || null,
      buyerName: buyer?.name || form.buyerName,
      amount: Number(form.amount) || 0,
      status: form.status,
      notes: form.notes,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New offer">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Deal *">
          <Select value={form.dealId} onChange={(e) => setForm({ ...form, dealId: e.target.value })} required>
            <option value="">Select deal…</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.addr}</option>)}
          </Select>
        </Field>
        <Field label="Buyer (from list)">
          <Select value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })}>
            <option value="">— or type a name below —</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {!form.buyerId && <Field label="Buyer name"><Input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount *"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        </div>
        <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1">Save offer</Button>
        </div>
      </form>
    </Modal>
  );
}

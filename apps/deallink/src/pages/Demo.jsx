import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal, Input, Select, Field } from '../components/ui.jsx';
import PhoneInput, { normalizePhone } from '../components/PhoneInput.jsx';

const PROFILE = {
  handle: 'jrodriguez.deals',
  initials: 'JR',
  name: 'Jordan Rodriguez',
  bio: 'Cash buyer specialist · Cleveland, OH · Closing 3–5 deals/month.',
};

const DEALS = [
  {
    id: 'demo-1', featured: true,
    addr: '2841 W 58th St', city: 'Cleveland', zip: '44102',
    type: 'SFR', beds: 3, baths: 2, sqft: 1240,
    ask: 89000, arv: 145000, repair: 22000,
    occupancy: 'Vacant', status: 'New',
    notes: 'Brick bungalow on a quiet street. Roof 2021, mechanicals updated 2019. Owner motivated — needs cosmetic rehab and one bathroom refresh. Comps support $145k flip in 60 days.',
  },
  {
    id: 'demo-2', new: true,
    addr: '11204 Parkhill Dr', city: 'Garfield Heights', zip: '44125',
    type: 'SFR', beds: 4, baths: 2, sqft: 1580,
    ask: 72000, arv: 128000, repair: 28000,
    occupancy: 'Tenant MTM', status: 'New',
    notes: 'Tenant pays $1,150 month-to-month. Great BRRRR or rental hold. Light cosmetic + kitchen update gets you to ARV.',
  },
  {
    id: 'demo-3',
    addr: '3312 E 131st St', city: 'Cleveland', zip: '44120',
    type: 'MF', beds: 4, baths: 2, sqft: 2100,
    ask: 118000, arv: 195000, repair: 35000,
    occupancy: 'Vacant', status: 'New',
    notes: '2-unit side-by-side. Both units vacant — turn-key BRRRR opportunity. Each unit rents $850-$950.',
  },
  {
    id: 'demo-4',
    addr: '6614 Lansing Ave', city: 'Cleveland', zip: '44105',
    type: 'SFR', beds: 3, baths: 1, sqft: 980,
    ask: 54000, arv: 99000, repair: 18000,
    occupancy: 'Vacant', status: 'Pending',
    notes: 'Smaller SFR, easy flip. Pending — backup offers welcome.',
  },
];

const SEEDED_LEADS = [
  { id: 's-1', name: 'Marcus Webb',  email: 'mwebb@cashflowcle.com', phone: '(216) 555-0144', type: 'Cash',       dealId: 'demo-1', when: '2 days ago' },
  { id: 's-2', name: 'Tanya Liu',    email: 'tanya@stagcap.io',      phone: '(440) 555-0287', type: 'Hard money', dealId: 'demo-3', when: 'Yesterday'   },
  { id: 's-3', name: 'Devon Holt',   email: 'devon.holt@gmail.com',  phone: '(216) 555-0199', type: 'Agent',      dealId: null,     when: '4 days ago'  },
];

const TYPE_OPTS = ['Cash', 'Hard money', 'Agent', 'JV partner', 'Other'];

function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
function dealLabel(dealId) {
  if (!dealId) return 'Buyer list';
  const d = DEALS.find((x) => x.id === dealId);
  return d ? d.addr : dealId;
}

export default function Demo() {
  const [phase, setPhase] = React.useState('buyer'); // 'buyer' | 'leads'
  const [selectedDeal, setSelectedDeal] = React.useState(null);
  const [filter, setFilter] = React.useState('All');
  const [view, setView] = React.useState('cards'); // 'cards' | 'table'
  const [formOpen, setFormOpen] = React.useState(false);
  const [leads, setLeads] = React.useState(SEEDED_LEADS);
  const [newLeadId, setNewLeadId] = React.useState(null);

  const filteredDeals = DEALS.filter((d) => {
    if (filter === 'All') return true;
    if (filter === 'SFR') return d.type === 'SFR';
    if (filter === 'MF') return d.type === 'MF';
    if (filter === '<$100k') return d.ask < 100000;
    if (filter === 'Vacant') return d.occupancy === 'Vacant';
    return true;
  });

  function handleLeadSubmit(lead) {
    const id = 'new-' + Date.now();
    const enriched = {
      id, ...lead,
      dealId: selectedDeal?.id || null,
      when: 'Just now',
    };
    setLeads((cur) => [enriched, ...cur]);
    setNewLeadId(id);
    setFormOpen(false);
    // give the modal close animation a beat, then slide
    setTimeout(() => setPhase('leads'), 200);
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <DemoBanner phase={phase} setPhase={setPhase} />

      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            width: '200vw',
            transform: phase === 'buyer' ? 'translateX(0)' : 'translateX(-100vw)',
            transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div style={{ width: '100vw', flexShrink: 0 }}>
            <BuyerPanel
              selectedDeal={selectedDeal}
              setSelectedDeal={setSelectedDeal}
              filter={filter}
              setFilter={setFilter}
              filteredDeals={filteredDeals}
              view={view}
              setView={setView}
              onInterested={() => setFormOpen(true)}
            />
          </div>
          <div style={{ width: '100vw', flexShrink: 0 }}>
            <LeadsPanel leads={leads} newLeadId={newLeadId} onBack={() => setPhase('buyer')} />
          </div>
        </div>
      </div>

      <LeadFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        deal={selectedDeal}
        onSubmit={handleLeadSubmit}
      />
    </div>
  );
}

/* ───────── Demo banner ───────── */

function DemoBanner({ phase, setPhase }) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 border-b border-[rgba(0,0,0,0.08)]"
      style={{ height: 44, background: '#1c1c1c' }}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <span className="text-[#b8860b] text-[10px] sm:text-[11px] font-mono tracking-widest uppercase whitespace-nowrap">
          Interactive demo
        </span>
        <div className="hidden sm:flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] p-0.5 bg-white/60">
          <button
            type="button"
            onClick={() => setPhase('buyer')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              phase === 'buyer' ? 'bg-[#b8860b] text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Buyer view
          </button>
          <button
            type="button"
            onClick={() => setPhase('leads')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              phase === 'leads' ? 'bg-[#b8860b] text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Wholesaler view
          </button>
        </div>
      </div>
      <Link
        to="/onboarding"
        className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1d1d1f] hover:bg-slate-100"
      >
        Claim your handle →
      </Link>
    </div>
  );
}

/* ───────── Panel 1: Buyer view ───────── */

function BuyerPanel(props) {
  const { selectedDeal, setSelectedDeal } = props;
  if (selectedDeal) {
    return <DealDetailView deal={selectedDeal} onBack={() => setSelectedDeal(null)} onInterested={props.onInterested} />;
  }
  return <ProfileView {...props} />;
}

function ProfileView({ filter, setFilter, filteredDeals, view, setView, setSelectedDeal }) {
  const featured = DEALS.find((d) => d.featured);
  const nonFeatured = filteredDeals.filter((d) => !d.featured || filter !== 'All');
  return (
    <div className="min-h-[calc(100vh-44px)] bg-slate-50 text-[#1d1d1f] py-6 px-4 sm:py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Profile header */}
        <div className="px-6 pt-8 pb-6 text-center border-b border-slate-100">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#b8860b] flex items-center justify-center text-white font-bold text-2xl shadow">
            {PROFILE.initials}
          </div>
          <div className="text-xs font-mono text-[#86868b] mt-3">@{PROFILE.handle}</div>
          <div className="text-lg font-semibold text-[#1d1d1f] mt-1">{PROFILE.name}</div>
          <p className="text-sm text-[#6e6e73] mt-2 max-w-md mx-auto">{PROFILE.bio}</p>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-[#86868b]">
            <span><span className="font-semibold text-[#1d1d1f]">{DEALS.length}</span> active deals</span>
            <span className="text-[#3a3a3c]">·</span>
            <span>Cleveland, OH</span>
          </div>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-white text-[#1d1d1f] px-4 py-2 text-sm font-medium hover:bg-[rgba(0,0,0,0.06)]"
          >
            Join buyer list
          </button>
        </div>

        {/* Featured */}
        {featured && filter === 'All' && (
          <div className="px-6 pt-6">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#b8860b] mb-2">Featured</div>
            <DealCard deal={featured} onClick={() => setSelectedDeal(featured)} featured />
          </div>
        )}

        {/* Filter + view toggle */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {['All', 'SFR', 'MF', '<$100k', 'Vacant'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                  filter === t
                    ? 'bg-white text-[#1d1d1f] border-[rgba(0,0,0,0.10)]'
                    : 'bg-white text-[#6e6e73] border-slate-200 hover:border-[rgba(0,0,0,0.20)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border border-slate-200 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setView('cards')}
              className={`px-2 py-0.5 text-[11px] rounded ${view === 'cards' ? 'bg-slate-100 text-[#1d1d1f]' : 'text-[#86868b]'}`}
            >Cards</button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`px-2 py-0.5 text-[11px] rounded ${view === 'table' ? 'bg-slate-100 text-[#1d1d1f]' : 'text-[#86868b]'}`}
            >Table</button>
          </div>
        </div>

        {/* List */}
        <div className="px-6 pb-8">
          {view === 'cards' ? (
            <div className="space-y-3">
              {nonFeatured.map((d) => (
                <DealCard key={d.id} deal={d} onClick={() => setSelectedDeal(d)} />
              ))}
              {nonFeatured.length === 0 && (
                <p className="text-sm text-[#86868b] text-center py-6">No deals match this filter.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-[#86868b]">
                  <th className="text-left py-2 font-medium">Address</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-right py-2 font-medium">Ask</th>
                  <th className="text-right py-2 font-medium">ARV</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedDeal(d)}
                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="py-2.5">
                      <div className="font-medium text-[#1d1d1f]">{d.addr}</div>
                      <div className="text-xs text-[#86868b]">{d.city} {d.zip}</div>
                    </td>
                    <td className="py-2.5 text-[#6e6e73]">{d.type} {d.beds}/{d.baths}</td>
                    <td className="py-2.5 text-right font-semibold">{fmt(d.ask)}</td>
                    <td className="py-2.5 text-right text-emerald-700">{fmt(d.arv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-[#6e6e73] font-mono mt-6">
        doorine.com/r/{PROFILE.handle}
      </p>
    </div>
  );
}

function DealCard({ deal, onClick, featured }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border ${
        featured ? 'border-[#b8860b] bg-[rgba(184,134,11,0.06)]' : 'border-slate-200 bg-white hover:border-[rgba(0,0,0,0.20)]'
      } p-4 transition-colors`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#1d1d1f]">{deal.addr}</span>
            {deal.new && <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">New</span>}
            {deal.status === 'Pending' && <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Pending</span>}
          </div>
          <div className="text-xs text-[#86868b] mt-0.5">{deal.city}, OH {deal.zip}</div>
          <div className="text-xs text-[#6e6e73] mt-2">
            {deal.type} · {deal.beds}bd / {deal.baths}ba · {deal.sqft.toLocaleString()} sf · {deal.occupancy}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-[#6e6e73]">Ask</div>
          <div className="text-lg font-bold text-[#1d1d1f]">{fmt(deal.ask)}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">ARV {fmt(deal.arv)}</div>
        </div>
      </div>
    </button>
  );
}

function DealDetailView({ deal, onBack, onInterested }) {
  const spread = deal.arv - deal.ask - deal.repair;
  return (
    <div className="min-h-[calc(100vh-44px)] bg-slate-50 text-[#1d1d1f] pb-28">
      <div className="max-w-2xl mx-auto py-6 px-4 sm:py-10">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[#86868b] hover:text-[#1d1d1f] mb-4 inline-flex items-center gap-1"
        >
          ← Back to @{PROFILE.handle}
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-44 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[#6e6e73] text-sm">
            (property photo)
          </div>
          <div className="px-6 pt-5 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-[#1d1d1f]">{deal.addr}</h1>
                <p className="text-sm text-[#86868b] mt-0.5">{deal.city}, OH {deal.zip}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-[#6e6e73]">Asking</div>
                <div className="text-2xl font-bold text-[#1d1d1f]">{fmt(deal.ask)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">
              <Stat label="ARV"     value={fmt(deal.arv)}     accent="emerald" />
              <Stat label="Repair"  value={fmt(deal.repair)}  accent="slate" />
              <Stat label="Spread"  value={fmt(spread)}       accent="amber" />
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4 grid grid-cols-2 gap-y-2 text-sm">
              <SpecRow k="Type"      v={deal.type} />
              <SpecRow k="Beds/Baths" v={`${deal.beds} / ${deal.baths}`} />
              <SpecRow k="Sq ft"     v={deal.sqft.toLocaleString()} />
              <SpecRow k="Occupancy" v={deal.occupancy} />
              <SpecRow k="Status"    v={deal.status} />
              <SpecRow k="Zip"       v={deal.zip} />
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="text-[10px] uppercase tracking-wider text-[#6e6e73] mb-1.5">Notes</div>
              <p className="text-sm text-[#3a3a3c] leading-relaxed">{deal.notes}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-3 z-20">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={onInterested}
            className="w-full rounded-lg bg-[#b8860b] hover:opacity-90 text-white font-semibold py-3 text-sm shadow-sm"
          >
            I'm interested →
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const accentClass = {
    emerald: 'text-emerald-700',
    amber:   'text-[#b8860b]',
    slate:   'text-[#1d1d1f]',
  }[accent];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
      <div className="text-[10px] uppercase tracking-wider text-[#6e6e73]">{label}</div>
      <div className={`text-base font-bold ${accentClass}`}>{value}</div>
    </div>
  );
}

function SpecRow({ k, v }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[#86868b]">{k}</span>
      <span className="text-[#1d1d1f] font-medium">{v}</span>
    </div>
  );
}

/* ───────── Lead form modal ───────── */

function LeadFormModal({ open, onClose, deal, onSubmit }) {
  const [first, setFirst]   = React.useState('');
  const [last, setLast]     = React.useState('');
  const [email, setEmail]   = React.useState('');
  const [phone, setPhone]   = React.useState('');
  const [type, setType]     = React.useState('Cash');

  React.useEffect(() => {
    if (!open) {
      setFirst(''); setLast(''); setEmail(''); setPhone(''); setType('Cash');
    }
  }, [open]);

  function submit(e) {
    e.preventDefault();
    if (!email || !phone) return;
    onSubmit({
      name: `${first} ${last}`.trim() || '(no name)',
      email, phone: normalizePhone(phone), type,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={deal ? `Interested in ${deal.addr}` : "I'm interested"}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Jane" /></Field>
          <Field label="Last name"><Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Doe" /></Field>
        </div>
        <Field label="Email *"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
        <Field label="Phone *"><PhoneInput value={phone} onChange={setPhone} required /></Field>
        <Field label="Buyer type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Send interest →</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────── Panel 2: Wholesaler view (leads inbox) ───────── */

function LeadsPanel({ leads, newLeadId, onBack }) {
  return (
    <div className="min-h-[calc(100vh-44px)] bg-[#f5f5f7] text-[#1d1d1f] py-8 px-4 sm:py-12">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[#6e6e73] hover:text-[#b8860b] inline-flex items-center gap-1 mb-4"
        >
          ← Buyer view
        </button>

        <div className="rounded-2xl border border-[#b8860b]/30 bg-[#b8860b]/5 px-4 py-3 mb-6 text-sm text-[#b8860b]">
          That buyer just landed here. Every "I'm interested" submission shows up in this inbox — tied to the deal,
          with contact info ready to go.
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-[#1d1d1f]">Leads inbox</h2>
            <span className="text-xs text-[#86868b] font-mono">{leads.length} total</span>
          </div>
          <div className="bg-white/60 border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white text-[10px] uppercase tracking-wider text-[#6e6e73]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Deal</th>
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.08)]">
                {leads.map((l) => {
                  const isNew = l.id === newLeadId;
                  return (
                    <tr
                      key={l.id}
                      className={isNew
                        ? 'bg-[rgba(184,134,11,0.10)] border-l-4 border-l-[#b8860b]'
                        : 'hover:bg-white/40'}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1d1d1f]">{l.name}</span>
                          {isNew && <span className="text-[9px] font-bold uppercase tracking-wider bg-[#b8860b] text-white px-1.5 py-0.5 rounded">New</span>}
                        </div>
                        <div className="sm:hidden text-xs text-[#6e6e73] mt-0.5">{l.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[#3a3a3c] hidden sm:table-cell">{l.email}</td>
                      <td className="px-4 py-3 text-[#3a3a3c] font-mono text-xs hidden md:table-cell">{l.phone}</td>
                      <td className="px-4 py-3"><TypeChip type={l.type} /></td>
                      <td className="px-4 py-3 text-[#3a3a3c] text-xs">{dealLabel(l.dealId)}</td>
                      <td className="px-4 py-3 text-[#86868b] text-xs">{l.when}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6 text-center">
          <p className="text-[#b8860b] text-[10px] font-mono uppercase tracking-widest">Your turn</p>
          <h3 className="text-[#1d1d1f] text-2xl font-bold mt-2">Ready to start capturing your own leads?</h3>
          <p className="text-[#6e6e73] text-sm mt-2 max-w-md mx-auto">
            Claim your handle, post your inventory once, and every interested buyer lands in your inbox just like this.
          </p>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-2 mt-5 rounded-md bg-[#b8860b] hover:opacity-90 text-white font-semibold px-4 py-2 text-sm"
          >
            Claim your handle →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TypeChip({ type }) {
  const styles = {
    'Cash':       'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Hard money': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    'Agent':      'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'JV partner': 'bg-[rgba(184,134,11,0.10)] text-[#b8860b] border-[#b8860b]/30',
    'Other':      'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.12)]/30',
  }[type] || 'bg-[rgba(0,0,0,0.06)] text-[#3a3a3c] border-[rgba(0,0,0,0.12)]/30';
  return (
    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles}`}>
      {type}
    </span>
  );
}

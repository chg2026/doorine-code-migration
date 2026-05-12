import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Upload, Plus, Copy, Check } from 'lucide-react';
import { useStore, useToast } from '../store.jsx';
import { Card, Button, Input, Field, Modal } from '../components/ui.jsx';

export default function Onboarding() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [choiceOpen, setChoiceOpen] = React.useState(false);
  const [step, setStep] = React.useState(state.profile?.handle ? 'checklist' : 'claim');
  const [handle, setHandle] = React.useState((state.profile?.handle || '').replace(/\.deals$/, ''));
  const [email, setEmail] = React.useState(state.profile?.email || '');
  const [name, setName] = React.useState(state.profile?.name || '');

  React.useEffect(() => { if (state.profile?.handle && step === 'claim') setStep('checklist'); }, [state.profile?.handle, step]);

  async function claim(e) {
    e.preventDefault();
    if (!handle.trim()) return;
    const initials = (name || handle).split(/\s+|\./).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || handle[0].toUpperCase();
    await dispatch({
      type: 'update_profile',
      patch: {
        handle: handle.trim().toLowerCase() + '.deals',
        email: email.trim(),
        name: name.trim() || handle,
        initials,
        onboarding: { ...(state.profile?.onboarding || {}), claimed: true },
      },
    });
    setStep('checklist');
    show('Profile claimed');
  }

  if (step === 'claim') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <Link to="/" className="text-slate-400 text-xs uppercase tracking-widest mb-8 hover:text-amber-400">← DealLink</Link>
        <div className="w-full max-w-md">
          <p className="text-amber-400 text-xs uppercase tracking-widest text-center font-mono">Claim your handle</p>
          <h1 className="text-3xl text-white font-bold text-center mt-3">deallink.io/<span className="text-amber-400 border-b-2 border-dashed border-amber-400/40 pb-1">{handle || 'yourname'}</span></h1>
          <form onSubmit={claim} className="mt-8 space-y-4">
            <Field label="Your handle">
              <div className="flex border border-slate-700 rounded-lg overflow-hidden bg-slate-800">
                <span className="px-3 py-2 text-slate-400 font-mono text-xs border-r border-slate-700">deallink.io/</span>
                <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))} placeholder="yourname" className="flex-1 bg-transparent text-white text-sm px-3 outline-none" autoFocus />
              </div>
            </Field>
            <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="J Rodriguez" /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required /></Field>
            <Button type="submit" className="w-full">Create profile <ArrowRight className="w-4 h-4" /></Button>
            <p className="text-xs text-slate-400 text-center">Already have one? <Link to="/login" className="text-amber-400 hover:underline">Sign in</Link></p>
          </form>
        </div>
        {node}
      </div>
    );
  }

  const items = [
    ['01', 'Claim your handle', 'Done', state.onboarding.claimed],
    ['02', 'Add your first deal', 'Manual or CSV import', state.onboarding.addedDeal || state.deals.length > 0],
    ['03', 'Upload photos (optional)', 'Assign to deals', state.onboarding.uploadedPhotos],
    ['04', 'Share your link', `deallink.io/${state.profile.handle}`, state.onboarding.shared],
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center p-6">
      <Link to="/" className="self-start text-slate-400 text-xs uppercase tracking-widest mb-8 hover:text-amber-400">← DealLink</Link>
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 flex items-center justify-center mx-auto"><Building2 className="w-8 h-8 text-slate-900" /></div>
          <p className="text-white text-base font-semibold mt-4">@{state.profile.handle}</p>
          <p className="text-slate-400 text-xs mt-1">Let's get your profile live</p>
        </div>

        <Card className="mt-6">
          {items.map(([n, t, d, done], i) => (
            <div key={n} className={`flex items-center gap-4 p-4 ${i < items.length - 1 ? 'border-b border-slate-700' : ''}`}>
              <span className="font-mono text-xs text-slate-500">{n}</span>
              <div className="flex-1">
                <p className="text-white text-sm">{t}</p>
                <p className="text-slate-500 text-xs font-mono mt-0.5">{d}</p>
              </div>
              {done ? <Check className="w-4 h-4 text-green-400" /> : <ArrowRight className="w-4 h-4 text-slate-600" />}
            </div>
          ))}
        </Card>

        <div className="mt-4">
          {!(state.onboarding.addedDeal || state.deals.length > 0)
            ? <Button onClick={() => setChoiceOpen(true)} className="w-full">Add first deal</Button>
            : !state.onboarding.shared
              ? <Button className="w-full" onClick={() => { dispatch({ type: 'update_onboarding', patch: { shared: true } }); navigator.clipboard?.writeText(`https://deallink.io/${state.profile.handle}`); show('Link copied'); }}><Copy className="w-4 h-4" /> Copy your link</Button>
              : <Link to="/dashboard"><Button className="w-full">Open dashboard <ArrowRight className="w-4 h-4" /></Button></Link>}
        </div>
        <div className="mt-3 text-center"><Link to="/dashboard" className="text-xs text-slate-400 hover:underline">Skip to dashboard</Link></div>
      </div>

      <Modal open={choiceOpen} onClose={() => setChoiceOpen(false)} title="How do you want to start?">
        <div className="space-y-3">
          <button onClick={() => { setChoiceOpen(false); nav('/admin/import'); }} className="w-full bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-lg p-4 text-left flex justify-between items-center">
            <div><p className="font-semibold">Import from CSV</p><p className="text-xs opacity-70 mt-0.5">One click · auto-mapped columns</p></div>
            <Upload className="w-5 h-5" />
          </button>
          <button onClick={() => { setChoiceOpen(false); nav('/admin/deal/new'); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg p-4 text-left flex justify-between items-center">
            <div><p className="font-semibold">Add manually</p><p className="text-xs text-slate-400 mt-0.5">One deal at a time</p></div>
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </Modal>
      {node}
    </div>
  );
}

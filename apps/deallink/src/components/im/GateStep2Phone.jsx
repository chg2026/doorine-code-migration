import React from 'react';
import GateShell from './GateShell.jsx';
import { Button, Input, Field, Select } from '../ui.jsx';
import { ImAPI } from '../../lib/im-api.js';

const COUNTRY_CODES = [
  { code: '+1',  label: 'US/CA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+61', label: 'AU (+61)' },
  { code: '+52', label: 'MX (+52)' },
];

export default function GateStep2Phone({ summary, name, initialPhone = '', onNext, onBack }) {
  const [cc, setCc] = React.useState('+1');
  const [phone, setPhone] = React.useState(initialPhone || '');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(null);

  const digits = phone.replace(/\D/g, '');
  const valid = digits.length >= 7;
  const fullPhone = cc + digits;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSending(true); setError(null);
    try {
      const result = await ImAPI.sendCode(name, fullPhone);
      onNext(fullPhone, result.dev_code || null);
    } catch (err) {
      setError(err?.message || 'Failed to send code');
    } finally { setSending(false); }
  }

  return (
    <GateShell
      step={2}
      summary={summary}
      onBack={onBack}
      title={`Hi ${name.split(' ')[0]} — what's your number?`}
      subtitle="We'll text a 6-digit code. Standard rates may apply."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          <div className="w-32">
            <Field label="Country">
              <Select value={cc} onChange={(e) => setCc(e.target.value)}>
                {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Phone number">
              <Input
                autoFocus
                inputMode="tel"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="555 123 4567"
              />
            </Field>
          </div>
        </div>
        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{error}</div>}
        <Button type="submit" disabled={!valid || sending} className="w-full justify-center">
          {sending ? 'Sending…' : 'Send code'}
        </Button>
      </form>
    </GateShell>
  );
}

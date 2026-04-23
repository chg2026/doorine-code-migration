// Shared helpers for contractor compliance badges.
// Used in lists, detail pages, and anywhere a contractor is referenced.

export function w9Badge(contractor) {
  const status = contractor?.w9_status || (contractor?.w9_url ? 'on_file' : 'missing');
  if (status === 'on_file') return { tone: 'green', label: 'W9 On File' };
  if (status === 'expired') return { tone: 'red', label: 'W9 Expired' };
  return { tone: 'red', label: 'W9 Missing' };
}

export function insuranceBadge(contractor) {
  const expiry = contractor?.insurance_expiry;
  if (!expiry) return { tone: 'red', label: 'No Insurance' };
  const days = daysUntil(expiry);
  if (days < 0) return { tone: 'red', label: 'Insurance Expired' };
  if (days <= 30) return { tone: 'amber', label: `Insurance ${days}d left` };
  return { tone: 'green', label: 'Insured' };
}

export function agreementBadge(contractor) {
  return contractor?.agreement_signed
    ? { tone: 'green', label: 'Agreement Signed' }
    : { tone: 'amber', label: 'No Agreement' };
}

export function complianceSummary(contractor) {
  const w9 = w9Badge(contractor);
  const ins = insuranceBadge(contractor);
  if (w9.tone === 'red' || ins.tone === 'red') return { tone: 'red', label: 'Action Required' };
  if (ins.tone === 'amber') return { tone: 'amber', label: 'Expiring Soon' };
  return { tone: 'green', label: 'Compliant' };
}

export const TONE_CLASS = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red:   'bg-red-50 text-red-700 ring-red-600/20',
  gray:  'bg-gray-50 text-gray-600 ring-gray-500/20',
};

export function Badge({ tone = 'gray', label, size = 'sm' }) {
  const cls = TONE_CLASS[tone] || TONE_CLASS.gray;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${cls} ${sz}`}>
      {label}
    </span>
  );
}

function daysUntil(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

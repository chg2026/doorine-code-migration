import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n, opts = {}) {
  const { compact = false, prefix = '$' } = opts;
  const num = Number(n) || 0;
  if (compact && Math.abs(num) >= 1000) {
    return `${prefix}${(num / 1000).toFixed(num >= 100000 ? 0 : 1)}k`;
  }
  return `${prefix}${num.toLocaleString()}`;
}

export function formatRelTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function initialsOf(name) {
  if (!name) return '';
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

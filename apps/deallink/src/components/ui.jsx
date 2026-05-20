import React from 'react';
import { cn } from '../lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_14px_rgba(0,0,0,0.04)]', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('px-5 py-4 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-[#1d1d1f] font-semibold', className)} {...props} />;
}

export function CardBody({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}

const btnVariants = {
  primary:   'text-[#1d1d1f] hover:opacity-90 font-semibold',
  secondary: 'bg-white hover:bg-[rgba(0,0,0,0.04)] text-[#1d1d1f] border border-[rgba(0,0,0,0.12)]',
  ghost:     'text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[rgba(0,0,0,0.06)]',
  danger:    'bg-red-500/90 hover:bg-red-500 text-white',
};
const btnSizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-sm' };

export function Button({ variant = 'primary', size = 'md', className, asChild, style, ...props }) {
  const cls = cn('inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed', btnVariants[variant], btnSizes[size], className);
  const mergedStyle = variant === 'primary' ? { background: 'var(--accent-gradient)', ...style } : style;
  return <button className={cls} style={mergedStyle} {...props} />;
}

export function Input({ className, ...props }) {
  return <input className={cn('w-full bg-white border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b]', className)} {...props} />;
}

export function Select({ className, ...props }) {
  return <select className={cn('w-full bg-white border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('w-full bg-white border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#b8860b] min-h-[80px]', className)} {...props} />;
}

export function Label({ className, ...props }) {
  return <label className={cn('text-[#6e6e73] text-xs block mb-1', className)} {...props} />;
}

export function Field({ label, children }) {
  return <div><Label>{label}</Label>{children}</div>;
}

export const STATUS_STYLES = {
  'New':            { color: 'bg-[rgba(52,120,246,0.10)] text-[#3478f6]', dot: 'bg-[#3478f6]', border: 'border-[#3478f6]' },
  'Marketed':       { color: 'bg-[rgba(52,120,246,0.10)] text-[#3478f6]', dot: 'bg-[#3478f6]', border: 'border-[#3478f6]' },
  'Under Contract': { color: 'bg-[rgba(184,134,11,0.10)] text-[#b8860b]', dot: 'bg-[#b8860b]', border: 'border-[#b8860b]' },
  'Closed':         { color: 'bg-[rgba(34,160,107,0.10)] text-[#22a06b]', dot: 'bg-[#22a06b]', border: 'border-[#22a06b]' },
  'Dead':           { color: 'bg-[rgba(212,73,58,0.10)] text-[#d4493a]',  dot: 'bg-[#d4493a]', border: 'border-[#d4493a]' },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['New'];
  return <span className={cn('text-xs px-2 py-1 rounded-full font-medium', s.color)}>{status}</span>;
}

export function Modal({ open, onClose, children, title, maxWidth = 'max-w-lg' }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={cn('relative bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-6 w-full', maxWidth)}>
        {title && <h2 className="text-[#1d1d1f] font-bold text-lg mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d1d1f]">{title}</h1>
        {subtitle && <p className="text-[#6e6e73] text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Building2Icon, title, body, action }) {
  return (
    <Card className="text-center py-16 px-6">
      <div className="inline-flex w-12 h-12 rounded-full bg-[rgba(0,0,0,0.06)] items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-[#6e6e73]" />
      </div>
      <h3 className="text-[#1d1d1f] font-semibold text-lg">{title}</h3>
      {body && <p className="text-[#6e6e73] text-sm mt-2 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

function Building2Icon(props) {
  // tiny inline fallback to avoid an import cycle if lucide tree-shaken
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12h12"/></svg>;
}

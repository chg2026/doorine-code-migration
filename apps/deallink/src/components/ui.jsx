import React from 'react';
import { cn } from '../lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('bg-slate-900 border border-slate-700 rounded-xl', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('px-5 py-4 border-b border-slate-700 flex items-center justify-between', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-white font-semibold', className)} {...props} />;
}

export function CardBody({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}

const btnVariants = {
  primary:   'bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700',
  ghost:     'text-slate-400 hover:text-white hover:bg-slate-800',
  danger:    'bg-red-500/90 hover:bg-red-500 text-white',
};
const btnSizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-sm' };

export function Button({ variant = 'primary', size = 'md', className, asChild, ...props }) {
  const cls = cn('inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed', btnVariants[variant], btnSizes[size], className);
  return <button className={cls} {...props} />;
}

export function Input({ className, ...props }) {
  return <input className={cn('w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400', className)} {...props} />;
}

export function Select({ className, ...props }) {
  return <select className={cn('w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 min-h-[80px]', className)} {...props} />;
}

export function Label({ className, ...props }) {
  return <label className={cn('text-slate-400 text-xs block mb-1', className)} {...props} />;
}

export function Field({ label, children }) {
  return <div><Label>{label}</Label>{children}</div>;
}

export const STATUS_STYLES = {
  'New':            { color: 'bg-slate-400/20 text-slate-300',  dot: 'bg-slate-400',  border: 'border-slate-500' },
  'Marketed':       { color: 'bg-blue-400/20 text-blue-300',    dot: 'bg-blue-400',   border: 'border-blue-500' },
  'Under Contract': { color: 'bg-amber-400/20 text-amber-300',  dot: 'bg-amber-400',  border: 'border-amber-500' },
  'Closed':         { color: 'bg-green-400/20 text-green-300',  dot: 'bg-green-400',  border: 'border-green-500' },
  'Dead':           { color: 'bg-red-400/20 text-red-300',      dot: 'bg-red-400',    border: 'border-red-500' },
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
      <div className={cn('relative bg-slate-900 border border-slate-700 rounded-xl p-6 w-full', maxWidth)}>
        {title && <h2 className="text-white font-bold text-lg mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Building2Icon, title, body, action }) {
  return (
    <Card className="text-center py-16 px-6">
      <div className="inline-flex w-12 h-12 rounded-full bg-slate-800 items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-white font-semibold text-lg">{title}</h3>
      {body && <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

function Building2Icon(props) {
  // tiny inline fallback to avoid an import cycle if lucide tree-shaken
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12h12"/></svg>;
}

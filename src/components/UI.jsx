import React from 'react';

export function Kicker({ children, style }) {
  return <div className="kicker" style={style}>{children}</div>;
}

export function Avatar({ size = 56, initials = 'JR', style }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        fontSize: size * 0.32,
        ...style,
      }}
    >{initials}</span>
  );
}

export function Hairline({ vertical = false, style }) {
  return <div className={`hairline${vertical ? ' v' : ''}`} style={style} />;
}

export function Stripe({ height = 120, label = '', style }) {
  return <div className="stripe" style={{ height, ...style }}>{label}</div>;
}

export function Tag({ children, active, onClick, style }) {
  return (
    <button
      type="button"
      className={`tag${active ? ' active' : ''}`}
      onClick={onClick}
      style={style}
    >{children}</button>
  );
}

export function Status({ kind = 'active' }) {
  const labels = { active: 'Active', pending: 'Pending', sold: 'Sold', new: 'New' };
  return (
    <span className={`status ${kind}`}>
      <span className="dot" />
      {labels[kind] || kind}
    </span>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="field-label">{label}</div>
      {children}
    </label>
  );
}

export function Modal({ onClose, children, maxWidth = 420 }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={{ maxWidth }}>
        {onClose && <button aria-label="Close" className="close" onClick={onClose}>×</button>}
        {children}
      </div>
    </div>
  );
}

export function maskAddress(addr) {
  return addr.replace(/^\d+\s+/, '— ');
}

export function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return `$${Number(n).toLocaleString()}`;
}

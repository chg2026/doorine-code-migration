import React from 'react';

/**
 * US phone input. User types 10 digits only.
 * Renders a non-editable '+1' prefix badge next to the input.
 * normalizePhone() converts to E.164 (+1XXXXXXXXXX) for API calls.
 */
export function normalizePhone(raw = '') {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return '+1' + digits.slice(-10);
}

export default function PhoneInput({ value, onChange, placeholder = '(555) 123-4567', required, style, className, inputStyle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, ...style }} className={className}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 10px', background: '#f3f4f6',
        border: '1px solid #d1d5db', borderRight: 'none',
        borderRadius: '6px 0 0 6px', fontSize: 13, fontWeight: 500,
        color: '#374151', whiteSpace: 'nowrap', minHeight: 38,
      }}>
        +1
      </span>
      <input
        type='tel'
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder={placeholder}
        required={required}
        style={{
          flex: 1, borderRadius: '0 6px 6px 0',
          border: '1px solid #d1d5db', padding: '8px 10px',
          fontSize: 13, minHeight: 38, outline: 'none',
          ...inputStyle,
        }}
      />
    </div>
  );
}

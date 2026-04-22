import React from 'react';
import { Link } from 'react-router-dom';
import { Kicker } from '../components/UI.jsx';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <Kicker>404</Kicker>
      <div className="serif" style={{ fontSize: 32, marginTop: 12 }}>Page not found</div>
      <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>The page you're looking for doesn't exist.</div>
      <Link to="/" className="btn sm" style={{ marginTop: 20 }}>Back home</Link>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <p className="text-amber-400 text-xs uppercase tracking-widest font-mono">404</p>
      <h1 className="text-3xl text-white font-bold mt-3">Page not found</h1>
      <p className="text-slate-400 text-sm mt-2">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-6"><Button>Back home</Button></Link>
    </div>
  );
}

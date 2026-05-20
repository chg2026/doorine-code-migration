import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center p-6 text-center">
      <p className="text-[#b8860b] text-xs uppercase tracking-widest font-mono">404</p>
      <h1 className="text-3xl text-[#1d1d1f] font-bold mt-3">Page not found</h1>
      <p className="text-[#6e6e73] text-sm mt-2">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-6"><Button>Back home</Button></Link>
    </div>
  );
}

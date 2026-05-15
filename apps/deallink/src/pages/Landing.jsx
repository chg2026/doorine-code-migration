import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, ArrowRight, Globe, Users, FileText, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui.jsx';

const EXAMPLE_HANDLE = 'jrodriguez.deals';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
            <span className="text-white font-bold text-lg">Deal<span className="text-amber-400">Link</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/signup"><Button>Claim your handle <ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-amber-400 text-xs uppercase tracking-widest font-mono">For real estate wholesalers</p>
        <h1 className="text-5xl md:text-7xl font-bold text-white mt-6 leading-tight">One link for every<br />deal you wholesale.</h1>
        <p className="text-slate-400 text-base mt-6 max-w-xl mx-auto">Share a public profile. Post inventory once. Capture buyers — without the spreadsheet shuffle.</p>
        <div className="flex justify-center gap-3 mt-8">
          <Link to="/signup"><Button size="lg">Claim your handle <ArrowRight className="w-4 h-4" /></Button></Link>
          <Link to={`/p/${EXAMPLE_HANDLE}`}><Button size="lg" variant="secondary">View example profile</Button></Link>
        </div>
        <p className="text-slate-500 text-xs font-mono mt-6">deallink.io/<u>yourname</u></p>
      </section>

      <section className="border-t border-slate-800 py-16">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            ['01', Globe, 'A public profile', 'Avatar, handle, bio. Buyers bookmark it.'],
            ['02', FileText, 'Bulk import deals', 'Drop a CSV. We auto-map columns and flag duplicates.'],
            ['03', Users, 'Capture lead intent', 'Buyers tap "I\'m interested." Name, email, phone.'],
            ['04', BarChart3, 'Pipeline & analytics', 'See offers, track stages, measure performance.'],
          ].map(([n, Icon, t, d]) => (
            <div key={n}>
              <p className="text-slate-500 text-xs font-mono">{n}</p>
              <Icon className="w-6 h-6 text-amber-400 mt-3" />
              <p className="text-white font-semibold mt-3">{t}</p>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-800 py-6">
        <div className="max-w-6xl mx-auto px-6 flex justify-between text-xs text-slate-500 font-mono">
          <span>© 2026 · BuildFlow</span>
          <Link to="/login" className="hover:text-amber-400">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}

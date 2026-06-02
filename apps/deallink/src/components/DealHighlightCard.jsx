import React from 'react';
import html2canvas from 'html2canvas';
import { Facebook, Linkedin, Link as LinkIcon, Download, Check, Home } from 'lucide-react';
import api from '../lib/api.js';

function fmtUsd(n) {
  const num = Number(n) || 0;
  return `$${num.toLocaleString()}`;
}

const TYPE_LABELS = { SFR: 'Single Family', MF: 'Multi Family', DUP: 'Duplex' };

export default function DealHighlightCard({ deal, profile, onClose }) {
  const cardRef = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [hint, setHint] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);

  const handle = profile?.handle || '';
  const base = import.meta.env.VITE_DEALLINK_URL || '';
  const shareUrl = `https://doorine.com/im/${deal?.id}`;
  const profileUrl = `${base}/p/${handle}`;

  const photo = (Array.isArray(deal?.photos) && deal.photos[0]) || deal?.photoUrl || '';
  const typeLabel = TYPE_LABELS[deal?.type] || deal?.type || '—';

  function logShare(platform) {
    api.post('/deallink/content-shares', {
      content_type: 'deal_card',
      deal_id: deal?.id,
      platform,
    }).catch(() => {});
  }

  function openShare(url, platform) {
    logShare(platform);
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=520');
  }

  async function copyLink() {
    logShare('copy_link');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setHint('Link copied to clipboard');
      setTimeout(() => { setCopied(false); setHint(''); }, 2000);
    } catch {
      setHint('Could not copy — please copy the link manually');
    }
  }

  async function downloadCard() {
    if (!cardRef.current) return;
    setDownloading(true);
    logShare('download');
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      const slug = (deal?.addr || 'deal').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
      link.download = `rei-flywheel-${slug || 'deal'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setHint('Card downloaded');
      setTimeout(() => setHint(''), 2000);
    } catch {
      setHint('Could not generate the image');
    } finally {
      setDownloading(false);
    }
  }

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-white border border-[rgba(0,0,0,0.08)] rounded-2xl p-6 w-full max-w-sm shadow-2xl my-8">
        <h2 className="text-[#1d1d1f] font-bold text-lg mb-1 text-center">Share this deal</h2>
        <p className="text-xs text-[#6e6e73] mb-4 text-center">Post your deal card or share the link.</p>

        {/* ── The shareable card ── */}
        <div
          ref={cardRef}
          className="rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white"
        >
          <div className="relative w-full aspect-[4/3] bg-[#b8860b]">
            {photo ? (
              <img src={photo} alt={deal?.addr || 'Property'} className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#b8860b] to-[#9a7209]">
                <Home className="w-14 h-14 text-white/80" />
              </div>
            )}
          </div>

          <div className="p-4">
            <p className="text-[#1d1d1f] font-bold text-base leading-snug mb-3 truncate" title={deal?.addr}>
              {deal?.addr || 'Property'}
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <CardStat label="Asking" value={fmtUsd(deal?.ask)} accent />
              <CardStat label="ARV" value={fmtUsd(deal?.arv)} />
              <CardStat label="Type" value={typeLabel} />
            </div>

            <div className="border-t border-[rgba(0,0,0,0.08)] pt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#6e6e73] truncate">
                Listed on REI Flywheel by <span className="text-[#b8860b] font-semibold">@{handle || 'wholesaler'}</span>
              </span>
              <span className="text-[10px] text-[#86868b] font-mono truncate max-w-[42%]">{profileUrl.replace(/^https?:\/\//, '')}</span>
            </div>
          </div>
        </div>

        {/* ── Share buttons ── */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          <ShareButton label="Facebook" onClick={() => openShare(fbUrl, 'facebook')}>
            <Facebook className="w-5 h-5" />
          </ShareButton>
          <ShareButton label="LinkedIn" onClick={() => openShare(liUrl, 'linkedin')}>
            <Linkedin className="w-5 h-5" />
          </ShareButton>
          <ShareButton label="Copy link" onClick={copyLink}>
            {copied ? <Check className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
          </ShareButton>
          <ShareButton label={downloading ? 'Saving…' : 'Download card'} onClick={downloadCard} disabled={downloading}>
            <Download className="w-5 h-5" />
          </ShareButton>
        </div>

        <div className="h-4 mt-2 mb-1 text-center">
          {hint && <p className="text-[#b8860b] text-xs">{hint}</p>}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-lg bg-[rgba(0,0,0,0.06)] hover:bg-[rgba(0,0,0,0.1)] text-[#1d1d1f] font-semibold transition-colors mt-1"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CardStat({ label, value, accent }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-[#86868b] mb-0.5">{label}</p>
      <p className={`text-sm font-bold truncate ${accent ? 'text-[#b8860b]' : 'text-[#1d1d1f]'}`} title={value}>{value}</p>
    </div>
  );
}

function ShareButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-[rgba(0,0,0,0.04)] hover:bg-[rgba(184,134,11,0.12)] text-[#3a3a3c] hover:text-[#b8860b] border border-[rgba(0,0,0,0.06)] transition-colors disabled:opacity-50"
    >
      {children}
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

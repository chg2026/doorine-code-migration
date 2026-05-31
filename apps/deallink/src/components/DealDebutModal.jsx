import React from 'react';
import { Trophy, Facebook, Instagram, Linkedin, Link as LinkIcon, Check } from 'lucide-react';

export default function DealDebutModal({ open, onClose, handle, address }) {
  const [copied, setCopied] = React.useState(false);
  const [copyHint, setCopyHint] = React.useState('');

  React.useEffect(() => {
    if (!open) { setCopied(false); setCopyHint(''); }
  }, [open]);

  if (!open) return null;

  const base = import.meta.env.VITE_DEALLINK_URL || '';
  const shareUrl = `${base}/p/${handle}`;

  async function copyLink(hint) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setCopyHint(hint || 'Link copied to clipboard');
      setTimeout(() => { setCopied(false); setCopyHint(''); }, 2000);
    } catch {
      setCopyHint('Could not copy — please copy the link manually');
    }
  }

  function openShare(url) {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=520');
  }

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-white border border-[rgba(0,0,0,0.08)] rounded-2xl p-8 w-full max-w-md text-center shadow-2xl">
        <div className="inline-flex w-16 h-16 rounded-full bg-[rgba(184,134,11,0.15)] items-center justify-center mb-5">
          <Trophy className="w-8 h-8 text-[#b8860b]" />
        </div>

        <h2 className="text-[#1d1d1f] font-bold text-xl leading-snug mb-3">
          You just listed your first deal on REI Flywheel! 🎉
        </h2>

        {handle && (
          <p className="text-[#b8860b] font-semibold text-sm mb-1">@{handle}</p>
        )}
        {address && (
          <p className="text-[#6e6e73] text-sm mb-6 truncate">{address}</p>
        )}

        {handle && (
          <>
            <p className="text-[#86868b] text-xs uppercase tracking-wide mb-3">Share your page</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              <ShareButton label="Facebook" onClick={() => openShare(fbUrl)}>
                <Facebook className="w-5 h-5" />
              </ShareButton>
              <ShareButton label="Instagram" onClick={() => copyLink('Link copied — paste it into your Instagram bio or story')}>
                <Instagram className="w-5 h-5" />
              </ShareButton>
              <ShareButton label="LinkedIn" onClick={() => openShare(liUrl)}>
                <Linkedin className="w-5 h-5" />
              </ShareButton>
              <ShareButton label="Copy link" onClick={() => copyLink()}>
                {copied ? <Check className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
              </ShareButton>
            </div>
          </>
        )}

        <div className="h-4 mb-2">
          {copyHint && <p className="text-[#b8860b] text-xs">{copyHint}</p>}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ShareButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-[rgba(0,0,0,0.04)] hover:bg-[rgba(184,134,11,0.12)] text-[#3a3a3c] hover:text-[#b8860b] border border-[rgba(0,0,0,0.06)] transition-colors"
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

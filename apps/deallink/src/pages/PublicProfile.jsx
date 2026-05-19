import React from 'react';
import { useParams } from 'react-router-dom';
import { Instagram, Facebook, MessageCircle, X } from 'lucide-react';
import { PublicAPI } from '../lib/deallink-api.js';
import { initialsOf } from '../lib/utils.js';
import {
  NEU_FONT, TONES, neuOut, neuIn, neuBg, shade, hex, resolveTheme,
} from '../lib/neu.js';

const SOCIAL_DEFS = [
  { key: 'instagram', Icon: Instagram,     label: 'Instagram' },
  { key: 'facebook',  Icon: Facebook,      label: 'Facebook' },
  { key: 'whatsapp',  Icon: MessageCircle, label: 'WhatsApp' },
];

export default function PublicProfile() {
  const { handle } = useParams();
  const [data, setData] = React.useState({ profile: null, deals: [] });
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [openDealId, setOpenDealId] = React.useState(null);
  const [leadDealId, setLeadDealId] = React.useState(null);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotFound(false);
    PublicAPI.getProfile(handle).then((res) => {
      if (cancelled) return;
      if (!res) { setNotFound(true); setLoading(false); return; }
      setData(res); setLoading(false);
    }).catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [handle]);

  // Resolve theme from profile (or defaults during loading / 404)
  const theme = resolveTheme(data.profile);
  const { tone, accent, radius, gradient } = theme;

  const pageStyle = {
    minHeight: '100vh',
    background: shade(tone.base, -0.06),
    fontFamily: NEU_FONT,
    color: tone.ink,
    padding: '24px 14px 60px',
  };

  const frameStyle = {
    width: '100%',
    maxWidth: 420,
    margin: '0 auto',
    borderRadius: 32,
    boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
    overflow: 'hidden',
    background: neuBg(tone.base, tone.dark, gradient),
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <Centered theme={theme} text="Loading…" />
      </div>
    );
  }

  if (notFound || !data.profile) {
    return (
      <div style={pageStyle}>
        <Centered theme={theme} title={`@${handle}`} text="This profile doesn't exist." />
      </div>
    );
  }

  const profile = data.profile;
  const visible = data.deals;
  const featured = visible.find((d) => d.id === profile.featuredId) || null;
  const others = featured ? visible.filter((d) => d.id !== featured.id) : visible;
  const displayInitials = profile.initials || initialsOf(profile.name || profile.handle || 'A');
  const links = profile.social_links || profile.socialLinks || {};
  const socialEntries = SOCIAL_DEFS
    .filter((s) => (links[s.key] || '').trim())
    .slice(0, 3);

  const openDeal = openDealId ? visible.find((d) => d.id === openDealId) : null;
  const leadDeal = leadDealId ? visible.find((d) => d.id === leadDealId) : null;

  return (
    <div style={pageStyle}>
      <div style={frameStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px 14px 32px' }}>
        {/* Identity */}
        <section style={{ padding: '8px 22px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Avatar tone={tone} size={84} src={profile.avatarUrl} initials={displayInitials} accent={accent} />
          <div style={{ fontSize: 18, fontWeight: 700, color: tone.ink, letterSpacing: -0.2 }}>@{profile.handle}</div>
          {profile.name && profile.name !== profile.handle && (
            <div style={{ fontSize: 12, color: tone.mute, marginTop: -6 }}>{profile.name}</div>
          )}
          {profile.bio && (
            <div style={{ fontSize: 12, color: tone.mute, textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
              {profile.bio}
            </div>
          )}

          {/* Active deals pill (inset) */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: 999,
            background: tone.base, boxShadow: neuIn(tone.base, tone.dark, 0.9, 8),
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 11, color: tone.ink, fontWeight: 600, letterSpacing: 0.4,
            marginTop: 4,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 999,
              background: accent,
              boxShadow: `0 0 10px ${accent}, 0 0 4px ${accent}`,
            }} />
            {visible.length} active deal{visible.length === 1 ? '' : 's'}
          </div>

          {/* Social dots */}
          {socialEntries.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {socialEntries.map(({ key, Icon, label }) => (
                <a key={key} href={links[key]} target="_blank" rel="noreferrer noopener" title={label} style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.9, 10),
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: tone.ink, textDecoration: 'none',
                }}>
                  <Icon size={15} />
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Featured deal */}
        {featured && (
          <FeaturedCard
            deal={featured}
            theme={theme}
            onOpen={() => setOpenDealId(featured.id)}
          />
        )}

        {/* Deal rows */}
        {others.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {others.map((d) => (
              <DealRow key={d.id} deal={d} theme={theme} onOpen={() => setOpenDealId(d.id)} />
            ))}
          </div>
        )}

        {visible.length === 0 && (
          <div style={{
            padding: 28, borderRadius: radius, background: tone.base,
            boxShadow: neuIn(tone.base, tone.dark, 0.8, 12),
            textAlign: 'center', color: tone.mute,
          }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, color: tone.dim }}>∅</div>
            <div style={{ fontSize: 14, marginTop: 8, color: tone.ink, fontWeight: 600 }}>No active deals</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Check back next Monday.</div>
          </div>
        )}

        {/* Footer pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            style={{
              padding: '10px 18px', borderRadius: 999,
              background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.85, 10),
              fontSize: 12, color: tone.ink, fontWeight: 600, letterSpacing: 0.4,
              border: 'none', cursor: 'pointer', fontFamily: NEU_FONT,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: 999, background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }} />
            Join buyer list
          </button>
          <div style={{
            padding: '10px 18px', borderRadius: 999,
            background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.85, 10),
            fontSize: 12, color: tone.mute, letterSpacing: 0.4,
          }}>
            Join <span style={{ color: tone.ink, fontWeight: 600 }}>@{profile.handle}</span> on REI Flywheel
          </div>
        </div>
        </div>
      </div>

      {openDeal && (
        <DealDetailModal
          deal={openDeal}
          theme={theme}
          onClose={() => setOpenDealId(null)}
          onInterested={() => { setOpenDealId(null); setLeadDealId(openDeal.id); }}
        />
      )}
      {leadDeal && (
        <LeadCaptureModal
          deal={leadDeal}
          handle={profile.handle}
          theme={theme}
          onClose={() => setLeadDealId(null)}
          onSubmitted={() => { setLeadDealId(null); showToast("Sent — you're on the list"); }}
        />
      )}
      {joinOpen && (
        <LeadCaptureModal
          deal={null}
          handle={profile.handle}
          theme={theme}
          onClose={() => setJoinOpen(false)}
          onSubmitted={() => { setJoinOpen(false); showToast("You're on the buyer list"); }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', borderRadius: 14,
          background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.9, 14),
          color: tone.ink, fontSize: 13, fontWeight: 500, zIndex: 100,
        }}>{toast}</div>
      )}
    </div>
  );
}

/* ────────────────────────── building blocks ────────────────────────── */

function Centered({ theme, title, text }) {
  const { tone } = theme;
  return (
    <div style={{
      maxWidth: 360, margin: '120px auto 0', textAlign: 'center',
      padding: 28, borderRadius: 24,
      background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.9, 14),
    }}>
      {title && <div style={{ fontSize: 20, fontWeight: 700, color: tone.ink, marginBottom: 8 }}>{title}</div>}
      <div style={{ fontSize: 13, color: tone.mute }}>{text}</div>
    </div>
  );
}

function Avatar({ tone, size, src, initials, accent }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: src ? `center/cover no-repeat url(${src})` : tone.base,
      boxShadow: neuIn(tone.base, tone.dark, 0.95, 12),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: tone.ink, fontWeight: 800, fontSize: size * 0.32,
      overflow: 'hidden', flexShrink: 0,
      letterSpacing: -0.5,
    }}>
      {!src && (
        <span style={{
          color: tone.dark ? '#fff' : tone.ink,
          textShadow: tone.dark ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
        }}>{initials}</span>
      )}
    </div>
  );
}

function FeaturedCard({ deal, theme, onOpen }) {
  const { tone, accent, radius } = theme;
  const [accR, accG, accB] = hex(accent);
  const heroBg = `linear-gradient(155deg, ${shade(accent, 0.4)} 0%, rgba(${accR},${accG},${accB},0.25) 100%)`;
  const spread = (Number(deal.arv) || 0) - (Number(deal.ask) || 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: 'left',
        background: tone.base,
        borderRadius: radius,
        border: 'none', padding: 0, cursor: 'pointer',
        boxShadow: neuOut(tone.base, tone.dark, 0.95, 16),
        overflow: 'hidden',
        fontFamily: 'inherit',
        color: tone.ink,
      }}
    >
      <div style={{ height: 110, background: heroBg, position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 14, bottom: 12,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)',
          padding: '5px 12px', borderRadius: 999,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700,
          color: '#1a1208',
        }}>Featured</span>
      </div>
      <div style={{ padding: '14px 18px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tone.ink }}>{deal.addr || 'Untitled deal'}</div>
        <div style={{ fontSize: 11, color: tone.mute, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
          {[deal.city, deal.units && `${deal.units}-unit`, deal.sqft && `${Number(deal.sqft).toLocaleString()}sf`]
            .filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, flexWrap: 'wrap' }}>
          <span><span style={{ color: tone.mute }}>Ask </span><b style={{ color: tone.ink }}>${Number(deal.ask || 0).toLocaleString()}</b></span>
          <span><span style={{ color: tone.mute }}>ARV </span><b style={{ color: tone.ink }}>${Number(deal.arv || 0).toLocaleString()}</b></span>
          <span><span style={{ color: tone.mute }}>Spread </span><b style={{ color: accent }}>${spread.toLocaleString()}</b></span>
        </div>
      </div>
    </button>
  );
}

function DealRow({ deal, theme, onOpen }) {
  const { tone, radius } = theme;
  const typeCode = (deal.type || '—').toUpperCase().slice(0, 4);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        background: tone.base,
        borderRadius: radius * 0.7,
        border: 'none', cursor: 'pointer',
        boxShadow: neuOut(tone.base, tone.dark, 0.85, 12),
        textAlign: 'left',
        fontFamily: 'inherit',
        color: tone.ink,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: tone.base, boxShadow: neuIn(tone.base, tone.dark, 0.85, 8),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
        color: tone.ink, letterSpacing: 0.6, flexShrink: 0,
      }}>{typeCode}</div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: tone.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{deal.addr || 'Untitled deal'}</div>
          {deal.new && (
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
              padding: '2px 6px', borderRadius: 999,
              background: tone.base, boxShadow: neuIn(tone.base, tone.dark, 0.7, 5),
              color: tone.mute, letterSpacing: 0.6, flexShrink: 0,
            }}>NEW</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: tone.mute, marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
          {[deal.zip, deal.beds && `${deal.beds}/${deal.baths}`, deal.sqft && `${deal.sqft}sf`]
            .filter(Boolean).join(' · ')}
        </div>
      </div>

      <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tone.ink }}>
          ${Number(deal.ask || 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: tone.mute, marginTop: 2 }}>
          ARV ${Number(deal.arv || 0).toLocaleString()}
        </div>
      </div>
    </button>
  );
}

/* ────────────────────────── modals ────────────────────────── */

function ModalShell({ theme, onClose, children, maxWidth = 380 }) {
  const { tone } = theme;
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(20,22,30,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth,
          background: tone.base, borderRadius: 24,
          boxShadow: `${neuOut(tone.base, tone.dark, 1, 18)}, 0 24px 60px rgba(0,0,0,0.35)`,
          padding: 22, color: tone.ink, fontFamily: NEU_FONT,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalClose({ theme, onClose }) {
  const { tone } = theme;
  return (
    <button onClick={onClose} aria-label="Close" style={{
      position: 'absolute', top: 14, right: 14,
      width: 32, height: 32, borderRadius: '50%',
      background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.85, 8),
      border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: tone.mute,
    }}>
      <X size={14} />
    </button>
  );
}

function Kicker({ theme, children }) {
  const { tone } = theme;
  return (
    <div style={{
      fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
      color: tone.mute, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
    }}>{children}</div>
  );
}

function DealDetailModal({ deal, theme, onClose, onInterested }) {
  const { tone, accent, radius } = theme;
  const spread = (Number(deal.arv) || 0) - (Number(deal.ask) || 0);
  const specs = [
    ['Type', deal.type || '—'],
    ['Beds / Baths', deal.beds ? `${deal.beds} / ${deal.baths || '—'}` : '—'],
    ['Sq Ft', deal.sqft ? Number(deal.sqft).toLocaleString() : '—'],
    ['Year', deal.year || '—'],
    ['Lot', deal.lot || '—'],
    ['Occupancy', deal.occ || '—'],
  ];

  return (
    <ModalShell theme={theme} onClose={onClose} maxWidth={400}>
      <div style={{ position: 'relative' }}>
        <ModalClose theme={theme} onClose={onClose} />
        <Kicker theme={theme}>Deal · {deal.zip || deal.city || ''}</Kicker>
        <div style={{ fontSize: 18, fontWeight: 700, color: tone.ink, marginTop: 8, paddingRight: 32 }}>
          {deal.addr || 'Untitled deal'}
        </div>
        {deal.city && (
          <div style={{ fontSize: 12, color: tone.mute, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
            {deal.city}
          </div>
        )}

        {/* Photos — up to 3 thumbnails, +N overlay on the third when more exist */}
        {Array.isArray(deal.photos) && deal.photos.length > 0 && (() => {
          const visible = deal.photos.slice(0, 3);
          const overflow = deal.photos.length - visible.length;
          return (
            <div style={{
              marginTop: 16, display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            }}>
              {visible.map((url, i) => {
                const isOverflow = i === 2 && overflow > 0;
                return (
                  <div
                    key={i}
                    onClick={isOverflow ? onInterested : undefined}
                    role={isOverflow ? 'button' : undefined}
                    tabIndex={isOverflow ? 0 : undefined}
                    onKeyDown={isOverflow ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInterested?.(); }
                    } : undefined}
                    title={isOverflow ? 'Register to see all photos' : undefined}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      borderRadius: radius,
                      overflow: 'hidden',
                      background: tone.dark,
                      boxShadow: neuOut(tone.base, tone.dark, 0.7, 8),
                      cursor: isOverflow ? 'pointer' : 'default',
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {isOverflow && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 14,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>
                        +{overflow + 1} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Price tile */}
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: tone.base, borderRadius: 16,
          boxShadow: neuIn(tone.base, tone.dark, 0.9, 10),
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          <PriceCol theme={theme} label="Ask" value={`$${Number(deal.ask || 0).toLocaleString()}`} />
          <PriceCol theme={theme} label="ARV" value={`$${Number(deal.arv || 0).toLocaleString()}`} />
          <PriceCol theme={theme} label="Spread" value={`$${spread.toLocaleString()}`} accentColor={accent} />
        </div>

        {/* Specs grid */}
        <div style={{
          marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {specs.map(([k, v]) => (
            <div key={k} style={{
              padding: '10px 12px', borderRadius: 12,
              background: tone.base, boxShadow: neuOut(tone.base, tone.dark, 0.7, 8),
            }}>
              <div style={{
                fontSize: 8, letterSpacing: 1, textTransform: 'uppercase',
                color: tone.mute, fontFamily: 'JetBrains Mono, monospace',
              }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: tone.ink, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>

        {deal.description && (
          <div style={{ fontSize: 12, color: tone.mute, marginTop: 14, lineHeight: 1.5 }}>
            {deal.description}
          </div>
        )}

        <AccentButton theme={theme} onClick={onInterested} style={{ marginTop: 18 }}>
          I'm interested
        </AccentButton>
      </div>
    </ModalShell>
  );
}

function PriceCol({ theme, label, value, accentColor }) {
  const { tone } = theme;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 8, letterSpacing: 1, textTransform: 'uppercase',
        color: tone.mute, fontFamily: 'JetBrains Mono, monospace',
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 700, marginTop: 4,
        fontFamily: 'JetBrains Mono, monospace',
        color: accentColor || tone.ink,
      }}>{value}</div>
    </div>
  );
}

function AccentButton({ theme, onClick, disabled, children, style, type = 'button' }) {
  const { tone, accent } = theme;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 20px',
        background: accent, color: '#fff',
        border: 'none', borderRadius: 14,
        fontSize: 13, fontWeight: 700, letterSpacing: 0.4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: `0 6px 18px ${shade(accent, -0.3).replace('rgba(', 'rgba(').replace(/,1\)$/, ',0.4)')}`,
        opacity: disabled ? 0.6 : 1,
        fontFamily: NEU_FONT,
        ...style,
      }}
    >{children}</button>
  );
}

function LeadCaptureModal({ deal, handle, theme, onClose, onSubmitted }) {
  const { tone } = theme;
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [buyerType, setBuyerType] = React.useState('Cash');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const isJoin = !deal;

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !first.trim()) { setError('First name and email are required.'); return; }
    setSubmitting(true); setError(null);
    try {
      await PublicAPI.submitLead(handle, {
        first, last, email, phone, buyerType,
        kind: isJoin ? 'buyer-list' : 'deal-interest',
        dealId: deal?.id || null,
      });
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell theme={theme} onClose={onClose} maxWidth={400}>
      <div style={{ position: 'relative' }}>
        <ModalClose theme={theme} onClose={onClose} />
        <Kicker theme={theme}>{isJoin ? 'Buyer list' : 'Request info'}</Kicker>
        <div style={{ fontSize: 16, fontWeight: 700, color: tone.ink, marginTop: 8, paddingRight: 32 }}>
          {isJoin ? `Join @${handle}'s buyer list` : (deal.addr || 'Untitled deal')}
        </div>
        {!isJoin && (
          <div style={{ fontSize: 12, color: tone.mute, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
            Ask ${Number(deal.ask || 0).toLocaleString()}
          </div>
        )}
        {isJoin && (
          <div style={{ fontSize: 12, color: tone.mute, marginTop: 4 }}>
            Get new off-market deals every Monday.
          </div>
        )}

        <form onSubmit={submit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <NeuField theme={theme} label="First name">
              <NeuInput theme={theme} value={first} onChange={(e) => setFirst(e.target.value)} required />
            </NeuField>
            <NeuField theme={theme} label="Last name">
              <NeuInput theme={theme} value={last} onChange={(e) => setLast(e.target.value)} />
            </NeuField>
          </div>
          <NeuField theme={theme} label="Email">
            <NeuInput theme={theme} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </NeuField>
          <NeuField theme={theme} label="Phone">
            <NeuInput theme={theme} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </NeuField>
          <NeuField theme={theme} label="Buyer type">
            <NeuSelect
              theme={theme}
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value)}
              options={['Cash', 'Hard Money', 'Conventional', 'Wholesaler', 'Owner-Occupant']}
            />
          </NeuField>

          {error && <div style={{ fontSize: 12, color: '#d63a6e' }}>{error}</div>}

          <AccentButton theme={theme} type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </AccentButton>
          <div style={{ fontSize: 11, color: tone.mute, textAlign: 'center', marginTop: 2 }}>
            You'll also join the weekly buyer list.
          </div>
        </form>
      </div>
    </ModalShell>
  );
}

function NeuField({ theme, label, children }) {
  const { tone } = theme;
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
        color: tone.mute, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
        marginBottom: 6,
      }}>{label}</div>
      {children}
    </label>
  );
}

function NeuInput({ theme, ...props }) {
  const { tone } = theme;
  return (
    <div style={{
      height: 42, padding: '0 14px',
      borderRadius: 12,
      background: tone.base,
      boxShadow: neuIn(tone.base, tone.dark, 0.85, 8),
      display: 'flex', alignItems: 'center',
    }}>
      <input
        {...props}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          color: tone.ink, fontSize: 13, fontFamily: NEU_FONT,
        }}
      />
    </div>
  );
}

function NeuSelect({ theme, options, ...props }) {
  const { tone } = theme;
  return (
    <div style={{
      height: 42, padding: '0 14px',
      borderRadius: 12,
      background: tone.base,
      boxShadow: neuIn(tone.base, tone.dark, 0.85, 8),
      display: 'flex', alignItems: 'center',
    }}>
      <select
        {...props}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          color: tone.ink, fontSize: 13, fontFamily: NEU_FONT,
          appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

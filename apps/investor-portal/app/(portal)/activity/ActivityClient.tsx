"use client";

import { useMemo, useState } from "react";

type ActivityRow = {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  createdAt: string;
  readAt: string | null;
  link: string | null;
};

type Pref = { event: string; email: boolean; inApp: boolean };

const ACTIVITY_DOT: Record<string, string> = {
  Distribution: "#1D9E75",
  Document: "#378ADD",
  Update: "#7F77DD",
  CapitalCall: "#BA7517",
  Other: "#A09E99",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Distribution", label: "Distributions" },
  { key: "Document", label: "Documents" },
  { key: "Update", label: "Updates" },
  { key: "CapitalCall", label: "Capital calls" },
];

const PREF_EVENTS: { key: string; label: string; desc: string }[] = [
  {
    key: "distribution",
    label: "Distributions",
    desc: "When a distribution is paid to one of your subscriptions.",
  },
  {
    key: "document",
    label: "New documents",
    desc: "When the operator uploads a document to your vault.",
  },
  {
    key: "update",
    label: "Deal updates",
    desc: "Quarterly, annual, and operations updates from operators.",
  },
  {
    key: "newdeal",
    label: "New deals",
    desc: "When a new offering opens that matches your investor profile.",
  },
  {
    key: "captable",
    label: "Capital calls",
    desc: "When a capital call is opened on a deal you're invested in.",
  },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const ms = now - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function ActivityClient({
  activities,
  initialPrefs,
  mtd,
}: {
  activities: ActivityRow[];
  initialPrefs: Pref[];
  mtd: { distributionsAmount: number; newDocuments: number; updatesPosted: number };
}) {
  const [filter, setFilter] = useState("all");
  const [prefs, setPrefs] = useState<Record<string, Pref>>(() => {
    const map: Record<string, Pref> = {};
    for (const p of initialPrefs) map[p.event] = p;
    for (const e of PREF_EVENTS) {
      if (!map[e.key]) map[e.key] = { event: e.key, email: true, inApp: true };
    }
    return map;
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? activities : activities.filter((a) => a.eventType === filter)),
    [activities, filter]
  );

  async function updatePref(event: string, channel: "email" | "inApp", next: boolean) {
    const prev = prefs[event] || { event, email: true, inApp: true };
    const updated: Pref = { ...prev, [channel]: next };
    setPrefs((p) => ({ ...p, [event]: updated }));
    setSavingKey(`${event}:${channel}`);
    try {
      const res = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, email: updated.email, inApp: updated.inApp }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedKey(`${event}:${channel}`);
      setTimeout(() => setSavedKey(null), 1200);
    } catch {
      // revert on failure
      setPrefs((p) => ({ ...p, [event]: prev }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="g2" style={{ gridTemplateColumns: "1fr 320px" }}>
      <div className="card">
        <div className="card-hd">
          <div className="card-title">Recent activity</div>
          <span className="card-sub">{filtered.length} {filtered.length === 1 ? "event" : "events"}</span>
        </div>
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`chip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">No activity matches that filter.</div>
        ) : (
          <div className="feed-list">
            {filtered.map((a) => {
              const isUnread = a.readAt === null;
              return (
                <div key={a.id} className={`feed-row${isUnread ? " unread" : ""}`}>
                  <div
                    className="feed-dot"
                    style={{ background: ACTIVITY_DOT[a.eventType] || "#A09E99" }}
                  />
                  <div className="feed-body">
                    <div className="feed-title">{a.title}</div>
                    {a.description ? (
                      <div className="feed-desc">{a.description}</div>
                    ) : null}
                    <div className="feed-time">{formatTime(a.createdAt)}</div>
                  </div>
                  {a.link ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <a className="feed-link" href={a.link}>View →</a>
                      {a.eventType === "Distribution" ? (
                        <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                          Finance hub coming soon
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Month to date</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="kpi">
              <div className="kpi-l">Distributions received</div>
              <div className="kpi-v green">{fmtMoney(mtd.distributionsAmount)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">New documents</div>
              <div className="kpi-v">{mtd.newDocuments}</div>
            </div>
            <div className="kpi">
              <div className="kpi-l">Updates posted</div>
              <div className="kpi-v">{mtd.updatesPosted}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <div>
              <div className="card-title">Notification preferences</div>
              <div className="card-sub">Choose which channels deliver each event.</div>
            </div>
          </div>
          <div className="pref-row" style={{ borderBottom: "0.5px solid var(--border-light)", paddingBottom: 4 }}>
            <div></div>
            <div className="pref-cell">Email</div>
            <div className="pref-cell">In-app</div>
          </div>
          {PREF_EVENTS.map((ev) => {
            const p = prefs[ev.key] || { event: ev.key, email: true, inApp: true };
            const savingEmail = savingKey === `${ev.key}:email`;
            const savingApp = savingKey === `${ev.key}:inApp`;
            return (
              <div key={ev.key} className="pref-row">
                <div>
                  <div className="pref-lbl">{ev.label}</div>
                  <div className="pref-desc">{ev.desc}</div>
                </div>
                <div className="pref-cell">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={p.email}
                      disabled={savingEmail}
                      onChange={(e) => updatePref(ev.key, "email", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  {savedKey === `${ev.key}:email` ? <span style={{ fontSize: 9, color: "var(--teal)" }}>✓</span> : null}
                </div>
                <div className="pref-cell">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={p.inApp}
                      disabled={savingApp}
                      onChange={(e) => updatePref(ev.key, "inApp", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  {savedKey === `${ev.key}:inApp` ? <span style={{ fontSize: 9, color: "var(--teal)" }}>✓</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

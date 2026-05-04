"use client";

import { useMemo, useState } from "react";
import {
  NOTIFY_EVENT_KEYS,
  type EventChannels,
  type NotifyEvent,
} from "@/lib/notifications/events";

export type CompanyDefaults = {
  channels: Record<NotifyEvent, EventChannels>;
  quiet: { start: string; end: string };
};

export type EventOverride = {
  override: boolean;
  email: boolean;
  inApp: boolean;
};

export type QuietOverride = {
  override: boolean;
  start: string;
  end: string;
};

const NOTIFY_EVENT_LABELS: Record<NotifyEvent, { lbl: string; desc: string }> = {
  drawApprovals: {
    lbl: "Draw approvals",
    desc: "When a draw request is approved, rejected, or returned for revisions.",
  },
  docExpiry: {
    lbl: "Document expiry alerts",
    desc: "When a tracked document enters the expiry threshold window or lapses.",
  },
  allocations: {
    lbl: "Warehouse allocations",
    desc: "When items are allocated to or returned from a project.",
  },
  missingUpdates: {
    lbl: "Missing contractor updates",
    desc: "Based on the cadence configured in Contractor portal.",
  },
  exceptions: {
    lbl: "Filed exceptions",
    desc: "When a checklist exception is filed on an active project.",
  },
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="toggle-slider"></span>
    </label>
  );
}

export default function AccountClient({
  userName,
  userEmail,
  role,
  companyDefaults,
  initialOverrides,
  initialQuiet,
  hideHeader = false,
}: {
  userName: string;
  userEmail: string | null;
  role: string;
  companyDefaults: CompanyDefaults;
  initialOverrides: Partial<Record<NotifyEvent, EventOverride>>;
  initialQuiet: QuietOverride;
  /** When true, render the bare notifications panel without the page-level
   *  Account header — used inside the tabbed /account page so the tabs
   *  client owns the chrome and we don't get a duplicate header. */
  hideHeader?: boolean;
}) {
  const [overrides, setOverrides] = useState(() => {
    const o: Record<NotifyEvent, EventOverride> = {} as Record<
      NotifyEvent,
      EventOverride
    >;
    for (const k of NOTIFY_EVENT_KEYS) {
      o[k] = initialOverrides[k] ?? {
        override: false,
        email: companyDefaults.channels[k].email,
        inApp: companyDefaults.channels[k].inApp,
      };
    }
    return o;
  });
  const [quiet, setQuiet] = useState<QuietOverride>(initialQuiet);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingEvent, setTestingEvent] = useState<NotifyEvent | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2200);
  };

  function effectiveChannels(ev: NotifyEvent): EventChannels {
    const company = companyDefaults.channels[ev];
    const o = overrides[ev];
    if (!o.override) return company;
    return {
      email: company.email && o.email,
      inApp: company.inApp && o.inApp,
    };
  }

  async function persistEvent(ev: NotifyEvent, next: EventOverride) {
    setSaving(true);
    try {
      const body = {
        events: {
          [ev]: next.override
            ? { email: next.email, inApp: next.inApp }
            : null,
        },
      };
      const res = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      showToast("Saved");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function persistQuiet(next: QuietOverride) {
    setSaving(true);
    try {
      const res = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quietHours: next.override
            ? { override: true, start: next.start, end: next.end }
            : { override: false },
        }),
      });
      if (!res.ok) throw new Error();
      showToast("Saved");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const updateOverrideToggle = (ev: NotifyEvent, on: boolean) => {
    setOverrides((cur) => {
      const next = { ...cur, [ev]: { ...cur[ev], override: on } };
      void persistEvent(ev, next[ev]);
      return next;
    });
  };
  const updateChannel = (
    ev: NotifyEvent,
    channel: "email" | "inApp",
    v: boolean
  ) => {
    setOverrides((cur) => {
      const next = { ...cur, [ev]: { ...cur[ev], [channel]: v, override: true } };
      void persistEvent(ev, next[ev]);
      return next;
    });
  };

  const updateQuietToggle = (on: boolean) => {
    setQuiet((cur) => {
      const next = { ...cur, override: on };
      void persistQuiet(next);
      return next;
    });
  };
  const updateQuietTime = (which: "start" | "end", val: string) => {
    setQuiet((cur) => {
      const next = { ...cur, [which]: val };
      void persistQuiet(next);
      return next;
    });
  };

  async function sendTest(ev: NotifyEvent) {
    setTestingEvent(ev);
    try {
      const res = await fetch("/api/account/notification-preferences/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: ev }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { sent: boolean; channels?: string[]; reason?: string };
      if (data.sent && data.channels) {
        showToast(`Test sent via ${data.channels.join(" + ")}`);
      } else {
        showToast(data.reason ?? "Could not send test");
      }
    } catch {
      showToast("Test failed");
    } finally {
      setTestingEvent(null);
    }
  }

  const eventRows = useMemo(
    () =>
      NOTIFY_EVENT_KEYS.map((ev) => {
        const o = overrides[ev];
        const company = companyDefaults.channels[ev];
        const eff = effectiveChannels(ev);
        return { ev, o, company, eff };
      }),
    // effectiveChannels is pure of overrides + companyDefaults
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overrides, companyDefaults]
  );

  const body = (
    <>
      <div className="admin-panel active">
        <div className="admin-group">
          <div className="admin-group-title">Notification preferences</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Admins decide which events are sent company-wide. You can mute the
            events you don&apos;t want to receive personally — your overrides
            never re-enable an event your admin has turned off, but they can
            silence one for you.
          </div>

          <div
            className="admin-row"
            style={{ borderBottom: "0.5px solid var(--border-mid)", paddingBottom: 6 }}
          >
            <div className="admin-info">
              <div
                className="admin-lbl"
                style={{
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                Event
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                alignItems: "center",
              }}
            >
              <span style={{ width: 70, textAlign: "center" }}>Customize</span>
              <span style={{ minWidth: 70, textAlign: "center" }}>Email</span>
              <span style={{ minWidth: 70, textAlign: "center" }}>In-app</span>
              <span style={{ width: 72, textAlign: "center" }}>Test</span>
            </div>
          </div>

          {eventRows.map(({ ev, o, company, eff }) => {
            const channelDisabled = !o.override;
            const isTesting = testingEvent === ev;
            const emailMutedByAdmin = !company.email;
            const inAppMutedByAdmin = !company.inApp;
            const adminMutedAny = emailMutedByAdmin || inAppMutedByAdmin;
            const adminMutedAll = emailMutedByAdmin && inAppMutedByAdmin;

            const effectiveLabel =
              eff.email || eff.inApp
                ? [eff.email ? "email" : null, eff.inApp ? "in-app" : null]
                    .filter(Boolean)
                    .join(" + ")
                : "muted";
            return (
              <div className="admin-row" key={ev}>
                <div className="admin-info">
                  <div className="admin-lbl">{NOTIFY_EVENT_LABELS[ev].lbl}</div>
                  <div className="admin-desc">{NOTIFY_EVENT_LABELS[ev].desc}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 4,
                    }}
                  >
                    Currently: {effectiveLabel}
                    {adminMutedAll && (
                      <> · muted company-wide by admin</>
                    )}
                    {!adminMutedAll && adminMutedAny && (
                      <>
                        {" · "}
                        {emailMutedByAdmin ? "email" : "in-app"} muted by admin
                      </>
                    )}
                    {!adminMutedAny && !o.override && (
                      <> · following company default</>
                    )}
                    {o.override && !adminMutedAll && !company.email && o.email && (
                      <> · email blocked by company setting</>
                    )}
                    {o.override && !adminMutedAll && !company.inApp && o.inApp && (
                      <> · in-app blocked by company setting</>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ width: 70, display: "flex", justifyContent: "center" }}>
                    <Toggle
                      checked={o.override}
                      onChange={(v) => updateOverrideToggle(ev, v)}
                    />
                  </div>
                  <div style={{ minWidth: 70, display: "flex", justifyContent: "center" }}>
                    {emailMutedByAdmin ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                          background: "var(--bg-mid, #f0f0f0)",
                          border: "1px solid var(--border-mid)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Muted by admin
                      </span>
                    ) : (
                      <Toggle
                        checked={o.email}
                        disabled={channelDisabled}
                        onChange={(v) => updateChannel(ev, "email", v)}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 70, display: "flex", justifyContent: "center" }}>
                    {inAppMutedByAdmin ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                          background: "var(--bg-mid, #f0f0f0)",
                          border: "1px solid var(--border-mid)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Muted by admin
                      </span>
                    ) : (
                      <Toggle
                        checked={o.inApp}
                        disabled={channelDisabled}
                        onChange={(v) => updateChannel(ev, "inApp", v)}
                      />
                    )}
                  </div>
                  <div style={{ width: 72, display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => void sendTest(ev)}
                      disabled={isTesting || testingEvent !== null}
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid)",
                        background: "transparent",
                        color: isTesting ? "var(--text-tertiary)" : "var(--text-primary)",
                        cursor: isTesting || testingEvent !== null ? "not-allowed" : "pointer",
                        opacity: testingEvent !== null && !isTesting ? 0.5 : 1,
                      }}
                    >
                      {isTesting ? "Sending…" : "Send test"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="admin-group">
          <div className="admin-group-title">Quiet hours</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginBottom: 8,
              lineHeight: 1.5,
            }}
          >
            Hold non-urgent emails for you outside this window. Urgent payment
            and compliance alerts always go through. Company default is{" "}
            <strong>
              {companyDefaults.quiet.start} – {companyDefaults.quiet.end}
            </strong>
            .
          </div>

          <div className="admin-row">
            <div className="admin-info">
              <div className="admin-lbl">Use my own quiet hours</div>
              <div className="admin-desc">
                When off, your emails follow the company quiet hours.
              </div>
            </div>
            <Toggle
              checked={quiet.override}
              onChange={(v) => updateQuietToggle(v)}
            />
          </div>

          <div className="admin-row">
            <div className="admin-info">
              <div className="admin-lbl">My quiet window</div>
              <div className="admin-desc">
                Suppress non-urgent emails outside this window.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="admin-input"
                style={{ width: 90 }}
                type="time"
                value={quiet.start}
                disabled={!quiet.override}
                onChange={(e) => updateQuietTime("start", e.target.value)}
              />
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                to
              </span>
              <input
                className="admin-input"
                style={{ width: 90 }}
                type="time"
                value={quiet.end}
                disabled={!quiet.override}
                onChange={(e) => updateQuietTime("end", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="save-bar">
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {saving ? "Saving…" : "Changes save automatically"}
          </span>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#111",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 4,
            fontSize: 12,
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );

  if (hideHeader) {
    return body;
  }

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Account</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        {userName}
        {userEmail ? ` · ${userEmail}` : ""} · {role}
      </div>
      {body}
    </div>
  );
}

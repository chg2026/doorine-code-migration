"use client";

import { useMemo, useState, useTransition } from "react";
import { postNote, approveChangeOrder, rejectChangeOrder } from "@/lib/rehab/actions";
import { formatET } from "@/lib/datetime";
import type { CoStatus } from "@/lib/rehab/types";

export type FeedEntry = {
  id: string;
  type: "system" | "note" | "payment" | "document" | "task" | "flag" | "changeOrder";
  who: string;
  action: string;
  message: string;
  createdAt: string; // ISO
  projectCode?: string;
  phaseNumber?: number | null;
  coStatus?: CoStatus | null;
};

const TYPE_META: Record<FeedEntry["type"], { label: string; bg: string; color: string; dot: string; icon: string; iconBg: string }> = {
  system:      { label: "System log",        bg: "var(--blue-bg)",  color: "var(--blue-txt)",  dot: "#185FA5", icon: "🕐", iconBg: "var(--blue-bg)" },
  note:        { label: "Note",              bg: "var(--green-bg)", color: "var(--green-txt)", dot: "#3B6D11", icon: "📝", iconBg: "var(--green-bg)" },
  payment:     { label: "Payment",           bg: "var(--amber-bg)", color: "var(--amber-txt)", dot: "#854F0B", icon: "💳", iconBg: "var(--amber-bg)" },
  document:    { label: "Document",          bg: "#FBEAF0",         color: "#72243E",          dot: "#993856", icon: "📄", iconBg: "#FBEAF0" },
  task:        { label: "Task",              bg: "var(--purple-bg)",color: "var(--purple-txt)",dot: "#534AB7", icon: "✅", iconBg: "var(--purple-bg)" },
  flag:        { label: "Exception / flag",  bg: "var(--red-bg)",   color: "var(--red-txt)",   dot: "#E24B4A", icon: "🚩", iconBg: "var(--red-bg)" },
  changeOrder: { label: "Change order",      bg: "#E8F0FB",         color: "#1F4FA8",          dot: "#2A6CD0", icon: "🔁", iconBg: "#E8F0FB" },
};

const ALL_TYPES: FeedEntry["type"][] = ["system", "note", "payment", "document", "task", "flag", "changeOrder"];

const FILTER_LABEL: Record<FeedEntry["type"], string> = {
  system: "System log",
  note: "Notes",
  payment: "Payments",
  document: "Documents",
  task: "Tasks",
  flag: "Flags / exceptions",
  changeOrder: "Change orders",
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return fmt;
}

function dayLabel(iso: string, today: string, yesterday: string): string {
  const k = dayKey(iso);
  if (k === today) return `Today — ${formatET(iso, false)}`;
  if (k === yesterday) return `Yesterday — ${formatET(iso, false)}`;
  return formatET(iso, false);
}

export default function ActivityFeed({
  projectCode,
  entries,
  canPost,
  canApprove,
}: {
  projectCode: string;
  entries: FeedEntry[];
  canPost: boolean;
  canApprove: boolean;
}) {
  const [filter, setFilter] = useState<"all" | FeedEntry["type"]>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<"note" | "task">("note");
  const [pending, startTransition] = useTransition();
  const [, startCoTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [coAction, setCoAction] = useState<Record<string, "rejecting" | "busy" | null>>({});
  const [coRejectReason, setCoRejectReason] = useState<Record<string, string>>({});
  const [coError, setCoError] = useState<Record<string, string | null>>({});

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: entries.length };
    for (const t of ALL_TYPES) out[t] = 0;
    for (const e of entries) out[e.type] = (out[e.type] || 0) + 1;
    return out;
  }, [entries]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.type !== filter) return false;
      if (s && !(e.message.toLowerCase().includes(s) || e.who.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [entries, filter, search]);

  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());

  const grouped = useMemo(() => {
    const byKey: Record<string, FeedEntry[]> = {};
    for (const e of filtered) {
      const k = dayKey(e.createdAt);
      (byKey[k] ||= []).push(e);
    }
    return Object.entries(byKey).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  function submit() {
    if (!draft.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await postNote(projectCode, draft, kind);
        setDraft("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to post");
      }
    });
  }

  function handleApprove(entryId: string) {
    setCoAction((p) => ({ ...p, [entryId]: "busy" }));
    setCoError((p) => ({ ...p, [entryId]: null }));
    startCoTransition(async () => {
      try {
        await approveChangeOrder(entryId, projectCode);
        setCoAction((p) => ({ ...p, [entryId]: null }));
      } catch (e: unknown) {
        setCoError((p) => ({ ...p, [entryId]: e instanceof Error ? e.message : "Failed to approve" }));
        setCoAction((p) => ({ ...p, [entryId]: null }));
      }
    });
  }

  function handleRejectStart(entryId: string) {
    setCoAction((p) => ({ ...p, [entryId]: "rejecting" }));
    setCoError((p) => ({ ...p, [entryId]: null }));
    setCoRejectReason((p) => ({ ...p, [entryId]: "" }));
  }

  function handleRejectCancel(entryId: string) {
    setCoAction((p) => ({ ...p, [entryId]: null }));
    setCoError((p) => ({ ...p, [entryId]: null }));
  }

  function handleRejectSubmit(entryId: string) {
    const reason = (coRejectReason[entryId] ?? "").trim();
    if (!reason) {
      setCoError((p) => ({ ...p, [entryId]: "Reason required" }));
      return;
    }
    setCoAction((p) => ({ ...p, [entryId]: "busy" }));
    setCoError((p) => ({ ...p, [entryId]: null }));
    startCoTransition(async () => {
      try {
        await rejectChangeOrder(entryId, projectCode, reason);
        setCoAction((p) => ({ ...p, [entryId]: null }));
      } catch (e: unknown) {
        setCoError((p) => ({ ...p, [entryId]: e instanceof Error ? e.message : "Failed to reject" }));
        setCoAction((p) => ({ ...p, [entryId]: "rejecting" }));
      }
    });
  }

  return (
    <div className="act-layout">
      <div className="act-left">
        <div className="act-left-hd">
          <div className="act-left-lbl">Filter by type</div>
          <button
            className={`filt-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            <span className="filt-dot" style={{ background: "#888" }} />All activity
            <span className="filt-ct">{counts.all || 0}</span>
          </button>
          {ALL_TYPES.map((t) => {
            const meta = TYPE_META[t];
            return (
              <button
                key={t}
                className={`filt-btn ${filter === t ? "active" : ""}`}
                onClick={() => setFilter(t)}
              >
                <span className="filt-dot" style={{ background: meta.dot }} />
                {FILTER_LABEL[t]}
                <span className="filt-ct">{counts[t] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="act-main">
        <div className="act-main-hd" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Activity log</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {projectCode} · newest first
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="ro-badge">🔒 System log is read-only</span>
            <button className="btn">Export</button>
          </div>
        </div>
        <div className="search-bar" style={{ padding: "7px 12px" }}>
          <input
            className="search-input"
            placeholder="Search activity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="act-feed" id="act-feed">
          {grouped.length === 0 && (
            <div style={{ padding: 14, fontSize: 11, color: "var(--text-tertiary)" }}>
              No matching entries.
            </div>
          )}
          {grouped.map(([key, items]) => (
            <div key={key}>
              <div className="day-label">{dayLabel(items[0].createdAt, today, yesterday)}</div>
              {items.map((e) => {
                const meta = TYPE_META[e.type];
                const sowHref =
                  e.type === "changeOrder" && e.projectCode && e.phaseNumber
                    ? `/rehab/${e.projectCode}/sow?phase=${e.phaseNumber}#sow-phase-${e.phaseNumber}`
                    : null;
                const isCo = e.type === "changeOrder";
                const coStatus = isCo ? (e.coStatus ?? "pending") : null;
                const coAct = coAction[e.id] ?? null;
                const isBusy = coAct === "busy";
                const isRejecting = coAct === "rejecting";
                const showApproveReject =
                  canApprove && isCo && coStatus === "pending" && !isBusy;
                return (
                  <div className="act-entry" data-type={e.type} key={e.id}>
                    <div className="act-icon" style={{ background: meta.iconBg }}>{meta.icon}</div>
                    <div className="act-body">
                      <div className="act-meta">
                        <span className="act-who">{e.who}</span>
                        <span className="act-action">— {e.action}</span>
                        <span className="act-time">
                          {new Intl.DateTimeFormat("en-US", {
                            timeZone: "America/New_York",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          }).format(new Date(e.createdAt))} ET
                        </span>
                      </div>
                      {e.type === "note" ? (
                        <div className="note-block">{e.message}</div>
                      ) : isCo ? (
                        <div
                          className="act-content"
                          style={{
                            borderLeft: `3px solid ${
                              coStatus === "approved"
                                ? "#2E7D32"
                                : coStatus === "rejected"
                                ? "#C62828"
                                : meta.dot
                            }`,
                            background:
                              coStatus === "approved"
                                ? "#F1F8F1"
                                : coStatus === "rejected"
                                ? "#FEF2F2"
                                : meta.iconBg,
                            padding: "6px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {e.message}
                        </div>
                      ) : (
                        <div className="act-content">{e.message}</div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="act-tag" style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                        {isCo && coStatus === "pending" && !isBusy && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#854F0B",
                              background: "var(--amber-bg)",
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            Pending
                          </span>
                        )}
                        {isCo && coStatus === "approved" && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#2E7D32",
                              background: "#F1F8F1",
                              border: "1px solid #A5D6A7",
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            ✓ Approved
                          </span>
                        )}
                        {isCo && coStatus === "rejected" && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#C62828",
                              background: "#FEF2F2",
                              border: "1px solid #FFCDD2",
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            ✗ Rejected
                          </span>
                        )}
                        {sowHref && (
                          <a
                            href={sowHref}
                            style={{
                              fontSize: 10,
                              color: meta.color,
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            {e.phaseNumber ? `View Phase ${e.phaseNumber} in SOW →` : "View in SOW →"}
                          </a>
                        )}
                      </div>
                      {isCo && isBusy && !isRejecting && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                          Processing…
                        </div>
                      )}
                      {showApproveReject && !isRejecting && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleApprove(e.id)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: "4px 10px", color: "var(--red-txt)" }}
                            onClick={() => handleRejectStart(e.id)}
                          >
                            Reject
                          </button>
                          {coError[e.id] && (
                            <span style={{ fontSize: 11, color: "var(--red-txt)", alignSelf: "center" }}>
                              {coError[e.id]}
                            </span>
                          )}
                        </div>
                      )}
                      {isCo && isRejecting && (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            className="compose-ta"
                            style={{ minHeight: 48, fontSize: 11, marginBottom: 4 }}
                            placeholder="Rejection reason (required)…"
                            value={coRejectReason[e.id] ?? ""}
                            onChange={(ev) =>
                              setCoRejectReason((p) => ({ ...p, [e.id]: ev.target.value }))
                            }
                          />
                          {coError[e.id] && (
                            <div style={{ fontSize: 11, color: "var(--red-txt)", marginBottom: 4 }}>
                              {coError[e.id]}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn"
                              style={{ fontSize: 11, padding: "4px 10px", color: "var(--red-txt)" }}
                              disabled={isBusy}
                              onClick={() => handleRejectSubmit(e.id)}
                            >
                              Confirm Reject
                            </button>
                            <button
                              className="btn-sm"
                              style={{ fontSize: 11 }}
                              onClick={() => handleRejectCancel(e.id)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {canPost && (
          <div className="compose-area">
            <div className="compose-hd">
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>New entry</span>
              <select
                className="compose-sel"
                value={kind}
                onChange={(e) => setKind(e.target.value as "note" | "task")}
              >
                <option value="note">Note</option>
                <option value="task">Task</option>
              </select>
            </div>
            <textarea
              className="compose-ta"
              id="compose-ta"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note or task... Type @ to mention a team member"
            />
            <div className="compose-ft">
              <span className="compose-hint">
                {error ? <span style={{ color: "var(--red-txt)" }}>{error}</span> : "Posted with your account + timestamp (ET)"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn-sm" onClick={() => setDraft("")} disabled={pending}>Cancel</button>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending || !draft.trim()}>
                  {pending ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

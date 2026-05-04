"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type UpdateRow = {
  id: string;
  offeringId: string;
  offeringName: string;
  title: string;
  updateType: string;
  postedAt: string;
  postedBy: string | null;
  metrics: { label: string; value: string }[];
  bodyHtml: string;
  isUnread: boolean;
};

const UPDATE_TYPE_LABEL: Record<string, string> = {
  Quarterly: "Quarterly",
  Annual: "Annual",
  Distribution: "Distribution",
  Operations: "Operations",
  Other: "Update",
};

const UPDATE_PILL: Record<string, string> = {
  Quarterly: "pill-b",
  Annual: "pill-p",
  Distribution: "pill-g",
  Operations: "pill-a",
  Other: "pill-gray",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UpdatesClient({
  updates,
  initialId,
  initialDeal,
}: {
  updates: UpdateRow[];
  initialId?: string | null;
  initialDeal?: string | null;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [dealFilter, setDealFilter] = useState<string>(initialDeal || "all");
  // Local "now-read" tracking so the dot disappears the moment you open the
  // update, even before the API round-trip completes.
  const [readLocally, setReadLocally] = useState<Set<string>>(() => new Set());

  // Default selection: the requested ID (if visible), otherwise the most
  // recent UNREAD update, otherwise the most recent update.
  const defaultId =
    (initialId && updates.find((u) => u.id === initialId)?.id) ||
    updates.find((u) => u.isUnread)?.id ||
    updates[0]?.id ||
    null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultId);

  const deals = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of updates) m.set(u.offeringId, u.offeringName);
    return Array.from(m.entries());
  }, [updates]);

  const filtered = useMemo(() => {
    return updates.filter((u) => {
      if (filter !== "all" && u.updateType !== filter) return false;
      if (dealFilter !== "all" && u.offeringId !== dealFilter) return false;
      return true;
    });
  }, [updates, filter, dealFilter]);

  useEffect(() => {
    if (selectedId && !filtered.find((u) => u.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null);
    } else if (!selectedId && filtered[0]) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Mark related InvestorActivity rows read whenever a new update is opened.
  useEffect(() => {
    if (!selectedId) return;
    const sel = updates.find((u) => u.id === selectedId);
    if (!sel || (!sel.isUnread && readLocally.has(selectedId))) return;
    setReadLocally((prev) => {
      if (prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.add(selectedId);
      return next;
    });
    fetch(`/api/updates/${selectedId}/read`, { method: "POST" }).catch(() => {});
  }, [selectedId, updates, readLocally]);

  const selected = filtered.find((u) => u.id === selectedId) || null;

  return (
    <div>
      <div className="chip-row">
        {["all", "Quarterly", "Annual", "Distribution", "Operations", "Other"].map((k) => (
          <button
            key={k}
            type="button"
            className={`chip${filter === k ? " on" : ""}`}
            onClick={() => setFilter(k)}
          >
            {k === "all" ? "All types" : UPDATE_TYPE_LABEL[k]}
          </button>
        ))}
        {deals.length > 1 ? (
          <select
            className="chip-input"
            value={dealFilter}
            onChange={(e) => setDealFilter(e.target.value)}
          >
            <option value="all">All deals</option>
            {deals.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="two-pane">
        <div className="list-pane">
          {filtered.length === 0 ? (
            <div className="list-empty">No updates match those filters.</div>
          ) : (
            filtered.map((u) => {
              const stillUnread = u.isUnread && !readLocally.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`list-row${selectedId === u.id ? " on" : ""}`}
                  onClick={() => setSelectedId(u.id)}
                >
                  <div className="list-row-title">
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                      {stillUnread ? <span className="unread-dot" title="Unread" /> : null}
                      {u.title}
                    </span>
                    <span className={`pill ${UPDATE_PILL[u.updateType] || "pill-gray"}`}>
                      {UPDATE_TYPE_LABEL[u.updateType] || u.updateType}
                    </span>
                  </div>
                  <div className="list-row-sub">
                    {u.offeringName} · {formatDate(u.postedAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="detail-pane">
          {!selected ? (
            <div className="list-empty">Select an update to read.</div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{selected.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  <span className={`pill ${UPDATE_PILL[selected.updateType] || "pill-gray"}`}>
                    {UPDATE_TYPE_LABEL[selected.updateType] || selected.updateType}
                  </span>
                  {" · "}
                  <Link href={`/investments/${selected.offeringId}`} style={{ color: "var(--blue)" }}>
                    {selected.offeringName}
                  </Link>
                  {" · posted "}{formatDate(selected.postedAt)}
                  {selected.postedBy ? <> {" · by "}<strong style={{ color: "var(--text-primary)" }}>{selected.postedBy}</strong></> : null}
                </div>
                {selected.metrics.length > 0 ? (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    {selected.metrics.map((m) => (
                      <span key={m.label} className="metric-chip">
                        <span className="metric-chip-l">{m.label}</span>
                        <span className="metric-chip-v">{m.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className="md"
                dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
              />
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "0.5px solid var(--border-light)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href={`/investments/${selected.offeringId}`} className="btn btn-sm">
                  View deal detail
                </Link>
                <Link
                  href={`/documents?deal=${selected.offeringId}`}
                  className="btn btn-sm"
                >
                  View all documents for this deal
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

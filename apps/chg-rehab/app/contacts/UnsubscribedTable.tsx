"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReEnableEmailsButton } from "./UnsubscribedRowActions";

export type UnsubscribedRow = {
  id: string;
  name: string;
  company: string | null;
  typeLabel: string;
  email: string | null;
  emailOptOutAtLabel: string;
  href: string;
  linkTitle: string;
};

const GRID_COLS = "28px minmax(0,1.4fr) 110px minmax(0,1fr) 110px 110px";

/**
 * Client-side table for the admin-only Unsubscribed sub-tab on the Contacts
 * page. Lets an admin tick rows (or use the header checkbox to select all) and
 * re-enable notification emails for the entire selection in one call to the
 * `POST /api/contacts/email-opt-out/bulk` endpoint.
 */
export function UnsubscribedTable({ rows }: { rows: UnsubscribedRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const visibleSelectedCount = allIds.reduce(
    (n, id) => (selected.has(id) ? n + 1 : n),
    0
  );
  const allSelected =
    allIds.length > 0 && visibleSelectedCount === allIds.length;
  const someSelected = visibleSelectedCount > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      // Deselect everything that's currently visible.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of allIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of allIds) next.add(id);
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkReEnable() {
    if (busy) return;
    const ids = allIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    const confirmMsg =
      ids.length === 1
        ? "Re-enable notification emails for 1 contact?"
        : `Re-enable notification emails for ${ids.length} contacts?`;
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/contacts/email-opt-out/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j: {
        error?: string;
        succeeded?: number;
        failed?: number;
      } = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const succeeded = typeof j.succeeded === "number" ? j.succeeded : 0;
      const failed = typeof j.failed === "number" ? j.failed : 0;
      const parts: string[] = [
        `${succeeded} re-enabled`,
      ];
      if (failed > 0) parts.push(`${failed} failed`);
      setStatusMsg(parts.join(" · "));
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Bulk-action toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 12px",
            borderBottom: "0.5px solid var(--border-lo)",
            background: visibleSelectedCount > 0 ? "#EBF5FE" : "var(--bg-secondary)",
            flexShrink: 0,
            minHeight: 30,
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {visibleSelectedCount > 0
              ? `${visibleSelectedCount} selected`
              : "Tick rows to re-enable emails in bulk"}
          </span>
          {visibleSelectedCount > 0 && (
            <>
              <button
                type="button"
                className="btn-sm"
                disabled={busy}
                onClick={bulkReEnable}
                title="Restore notification emails for all selected contacts"
              >
                {busy ? "Working…" : `↺ Re-enable emails (${visibleSelectedCount})`}
              </button>
              <button
                type="button"
                className="btn-sm"
                disabled={busy}
                onClick={() => setSelected(new Set())}
                title="Clear selection"
                style={{ fontSize: 9, color: "var(--text-tertiary)" }}
              >
                Clear
              </button>
            </>
          )}
          {statusMsg && (
            <span style={{ fontSize: 10, color: "#0C447C" }}>{statusMsg}</span>
          )}
          {error && (
            <span style={{ fontSize: 10, color: "#791F1F" }}>{error}</span>
          )}
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLS,
            padding: "5px 12px",
            background: "var(--bg-secondary)",
            borderBottom: "0.5px solid var(--border-lo)",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            disabled={rows.length === 0 || busy}
            aria-label="Select all unsubscribed contacts on this page"
            title={allSelected ? "Deselect all" : "Select all"}
            style={{ margin: 0, cursor: rows.length === 0 ? "default" : "pointer" }}
          />
          <span className="col-lbl">Name</span>
          <span className="col-lbl">Type</span>
          <span className="col-lbl">Email</span>
          <span className="col-lbl">Unsubscribed</span>
          <span className="col-lbl" style={{ textAlign: "right" }}>Action</span>
        </div>

        {/* Rows */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {rows.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>
              No contacts have unsubscribed from emails.
            </div>
          )}
          {rows.map((c) => {
            const isChecked = selected.has(c.id);
            return (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  padding: "9px 12px",
                  borderBottom: "0.5px solid var(--border-lo)",
                  alignItems: "center",
                  background: isChecked ? "#F5FAFE" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={busy}
                  onChange={() => toggleOne(c.id)}
                  aria-label={`Select ${c.name}`}
                  style={{ margin: 0, cursor: "pointer" }}
                />
                <Link
                  href={c.href}
                  title={c.linkTitle}
                  style={{
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </div>
                  {c.company && (
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.company}</div>
                  )}
                </Link>
                <div>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                    }}
                  >
                    {c.typeLabel}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.email ?? "—"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {c.emailOptOutAtLabel}
                </div>
                <ReEnableEmailsButton contactId={c.id} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

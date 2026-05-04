"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DocRow = {
  id: string;
  name: string;
  docType: string;
  offeringId: string | null;
  offeringName: string | null;
  uploadedAt: string;
  sizeBytes: number | null;
  taxYear: number | null;
  isNew: boolean;
};

const DOC_TYPE_LABEL: Record<string, string> = {
  PPM: "PPM",
  Subscription: "Subscription",
  Operating: "Operating",
  K1: "K-1",
  Statement: "Statement",
  Tax: "Tax",
  Other: "Other",
};

const DOC_TYPE_PILL: Record<string, string> = {
  PPM: "pill-b",
  Subscription: "pill-p",
  Operating: "pill-p",
  K1: "pill-a",
  Statement: "pill-g",
  Tax: "pill-a",
  Other: "pill-gray",
};

const TYPE_ORDER = ["PPM", "Subscription", "Operating", "K1", "Statement", "Tax", "Other"];

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DocumentsClient({
  docs,
  initialDeal,
  initialType,
  focusDocId,
}: {
  docs: DocRow[];
  initialDeal?: string | null;
  initialType?: string | null;
  focusDocId?: string | null;
}) {
  const [dealFilter, setDealFilter] = useState<string>(initialDeal || "all");
  const [typeFilter, setTypeFilter] = useState<string>(initialType || "all");
  const [query, setQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<{ id: string; name: string; url: string } | null>(null);
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(focusDocId || null);

  // Deep-link focus: when arriving via ?doc=ID (from Activity feed), clear
  // narrowing filters so the doc is visible, then scroll the row into view
  // and pulse it briefly so the user can spot it.
  useEffect(() => {
    if (!focusDocId) return;
    const target = docs.find((d) => d.id === focusDocId);
    if (!target) return;
    // Make sure the doc isn't filtered out.
    setDealFilter("all");
    setTypeFilter("all");
    setQuery("");
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    const t2 = window.setTimeout(() => setPulseId(null), 2400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [focusDocId, docs]);

  // Build filter facets with stable counts (count is the # of docs that
  // would match if THIS facet alone were applied — i.e. independent from
  // the other filter — so the left-rail totals don't disappear as you
  // narrow). We also expose the "fully filtered" count as the badge on
  // the active row.
  const deals = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const d of docs) {
      if (typeFilter !== "all" && d.docType !== typeFilter) continue;
      if (!d.offeringId) continue;
      const k = d.offeringId;
      const cur = m.get(k);
      if (cur) cur.count += 1;
      else m.set(k, { name: d.offeringName || "—", count: 1 });
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }));
  }, [docs, typeFilter]);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) {
      if (dealFilter !== "all" && d.offeringId !== dealFilter) continue;
      m.set(d.docType, (m.get(d.docType) || 0) + 1);
    }
    return TYPE_ORDER.filter((t) => m.has(t)).map((t) => ({
      key: t,
      label: DOC_TYPE_LABEL[t] || t,
      count: m.get(t) || 0,
    }));
  }, [docs, dealFilter]);

  // The fully-filtered row set for the right-pane table. The left-rail
  // count for the *currently selected* facet equals filtered.length, which
  // satisfies the reviewer's "counts match table rows" acceptance.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (dealFilter !== "all" && d.offeringId !== dealFilter) return false;
      if (typeFilter !== "all" && d.docType !== typeFilter) return false;
      if (q) {
        const hay =
          `${d.name} ${d.offeringName || ""} ${d.taxYear || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, dealFilter, typeFilter, query]);

  // If the deal facet drops to 0, snap back to "all" so the table isn't empty.
  useEffect(() => {
    if (dealFilter !== "all" && !deals.find((d) => d.id === dealFilter)) {
      setDealFilter("all");
    }
  }, [dealFilter, deals]);
  useEffect(() => {
    if (typeFilter !== "all" && !types.find((t) => t.key === typeFilter)) {
      setTypeFilter("all");
    }
  }, [typeFilter, types]);

  function isPdf(name: string): boolean {
    return /\.pdf$/i.test(name.trim());
  }

  async function fetchSignedUrl(id: string): Promise<string> {
    const res = await fetch(`/api/documents/${id}/url`, { method: "GET" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `request failed (${res.status})`);
    }
    const { url } = (await res.json()) as { url: string };
    return url;
  }

  function markOpened(id: string) {
    setOpenedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  async function handleOpen(doc: DocRow) {
    setError(null);
    setDownloadingId(doc.id);
    try {
      const url = await fetchSignedUrl(doc.id);
      markOpened(doc.id);
      if (isPdf(doc.name)) {
        setPreview({ id: doc.id, name: doc.name, url });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "open failed");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownload(doc: DocRow) {
    setError(null);
    setDownloadingId(doc.id);
    try {
      const url = await fetchSignedUrl(doc.id);
      markOpened(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  const allCount = useMemo(() => {
    if (typeFilter === "all" && dealFilter === "all") return docs.length;
    return docs.filter(
      (d) =>
        (typeFilter === "all" || d.docType === typeFilter) &&
        (dealFilter === "all" || d.offeringId === dealFilter)
    ).length;
  }, [docs, typeFilter, dealFilter]);

  return (
    <div className="vault-pane">
      <div className="vault-rail">
        <div className="rail-section">
          <div className="rail-title">Filter by deal</div>
          <button
            type="button"
            className={`rail-row${dealFilter === "all" ? " on" : ""}`}
            onClick={() => setDealFilter("all")}
          >
            <span>All deals</span>
            <span className="rail-count">{allCount}</span>
          </button>
          {deals.map((d) => {
            const isOn = dealFilter === d.id;
            const count = isOn ? filtered.length : d.count;
            return (
              <button
                key={d.id}
                type="button"
                className={`rail-row${isOn ? " on" : ""}`}
                onClick={() => setDealFilter(d.id)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </span>
                <span className="rail-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="rail-section">
          <div className="rail-title">Filter by type</div>
          <button
            type="button"
            className={`rail-row${typeFilter === "all" ? " on" : ""}`}
            onClick={() => setTypeFilter("all")}
          >
            <span>All types</span>
            <span className="rail-count">{allCount}</span>
          </button>
          {types.map((t) => {
            const isOn = typeFilter === t.key;
            const count = isOn ? filtered.length : t.count;
            return (
              <button
                key={t.key}
                type="button"
                className={`rail-row${isOn ? " on" : ""}`}
                onClick={() => setTypeFilter(t.key)}
              >
                <span>{t.label}</span>
                <span className="rail-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="vault-table">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <input
            className="chip-input"
            type="search"
            placeholder="Search documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <span className="card-sub">{filtered.length} {filtered.length === 1 ? "file" : "files"}</span>
        </div>

        {error ? (
          <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11, marginBottom: 8 }}>
            {error}
          </div>
        ) : null}

        {preview ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 12,
              background: "var(--surface, #fff)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface-2, #f7f7f8)",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview.name}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <a
                  className="btn btn-sm"
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPreview(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              key={preview.url}
              src={preview.url}
              title={preview.name}
              style={{ width: "100%", height: "70vh", border: 0, display: "block", background: "#525659" }}
            />
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="empty-state">No documents match those filters.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "38%" }}>Document</th>
                <th style={{ width: "16%" }}>Type</th>
                <th style={{ width: "22%" }}>Deal</th>
                <th style={{ width: "12%" }}>Uploaded</th>
                <th style={{ width: "8%" }}>Size</th>
                <th style={{ width: "4%" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isNew = d.isNew && !openedIds.has(d.id);
                const isFocused = d.id === focusDocId;
                const pdf = isPdf(d.name);
                return (
                  <tr
                    key={d.id}
                    ref={isFocused ? focusRef : undefined}
                    className={`clickable${isFocused && pulseId === d.id ? " row-pulse" : ""}${preview?.id === d.id ? " selected" : ""}`}
                    onClick={() => handleOpen(d)}
                  >
                    <td>
                      <div className="row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {d.name}
                        {isNew ? <span className="new-pill">New</span> : null}
                      </div>
                      {d.taxYear ? <div className="row-sub">Tax year {d.taxYear}</div> : null}
                    </td>
                    <td>
                      <span className={`pill ${DOC_TYPE_PILL[d.docType] || "pill-gray"}`}>
                        {DOC_TYPE_LABEL[d.docType] || d.docType}
                      </span>
                    </td>
                    <td>{d.offeringName || "—"}</td>
                    <td>{formatDate(d.uploadedAt)}</td>
                    <td>{formatBytes(d.sizeBytes)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={downloadingId === d.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(d);
                        }}
                      >
                        {downloadingId === d.id ? "…" : pdf ? "Download" : "Open"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          PDFs preview inline; other files open in a new tab. Signed links expire in
          5 minutes — click a row again any time to mint a fresh one.
        </div>
      </div>
    </div>
  );
}

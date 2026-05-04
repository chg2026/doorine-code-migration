"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  offeringId: string | null;
  offeringName: string | null;
  taxYear: number | null;
  uploadedAt: string;
  sizeBytes: number | null;
  isNew: boolean;
};

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function TaxCenterClient({ rows }: { rows: Row[] }) {
  const years = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const r of rows) {
      const y = r.taxYear ?? 0;
      const arr = m.get(y) || [];
      arr.push(r);
      m.set(y, arr);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({ year, items }));
  }, [rows]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [zippingYear, setZippingYear] = useState<number | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadOne(id: string) {
    setError(null);
    setDownloadingId(id);
    try {
      const r = await fetch(`/api/documents/${id}/url`);
      if (!r.ok) throw new Error(`download failed (${r.status})`);
      const { url } = (await r.json()) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  function downloadZip(year: number | "all") {
    setZippingYear(year);
    const url =
      year === "all" ? "/api/documents/tax-zip" : `/api/documents/tax-zip?year=${year}`;
    // Use a temp anchor so the browser handles the streaming download.
    const a = document.createElement("a");
    a.href = url;
    a.download = year === "all" ? "K-1s.zip" : `K-1s-${year}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setZippingYear(null), 1500);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {rows.length} K-1{rows.length === 1 ? "" : "s"} across {years.length} tax year{years.length === 1 ? "" : "s"}.
        </div>
        <button
          type="button"
          onClick={() => downloadZip("all")}
          disabled={zippingYear !== null}
          className="btn btn-sm btn-p"
        >
          {zippingYear === "all" ? "Preparing…" : "Download all as ZIP"}
        </button>
      </div>

      {error ? (
        <div style={{ background: "var(--red-light)", color: "var(--red)", padding: 8, borderRadius: 6, fontSize: 11 }}>
          {error}
        </div>
      ) : null}

      {years.map(({ year, items }) => (
        <div key={year} className="card">
          <div className="card-hd">
            <div className="card-title">{year ? `Tax year ${year}` : "Untagged"}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="card-sub">{items.length} document{items.length === 1 ? "" : "s"}</span>
              {year ? (
                <button
                  type="button"
                  onClick={() => downloadZip(year)}
                  disabled={zippingYear !== null}
                  className="btn btn-sm"
                >
                  {zippingYear === year ? "Preparing…" : "ZIP this year"}
                </button>
              ) : null}
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Document</th>
                <th>Deal</th>
                <th>Uploaded</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="row-title" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {r.name}
                      {r.isNew ? <span className="new-pill">New</span> : null}
                    </div>
                  </td>
                  <td>{r.offeringName || "—"}</td>
                  <td>{new Date(r.uploadedAt).toLocaleDateString()}</td>
                  <td>{formatBytes(r.sizeBytes)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => downloadOne(r.id)}
                      disabled={downloadingId === r.id}
                      className="btn btn-sm"
                    >
                      {downloadingId === r.id ? "…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

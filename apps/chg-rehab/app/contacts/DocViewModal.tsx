"use client";

import { useState } from "react";

type DocLite = {
  type: string;
  label: string;
  name?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  fileKey?: string | null;
};

export function DocViewButton({ doc }: { doc: DocLite }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-xs"
        onClick={() => setOpen(true)}
        style={{ marginLeft: "auto" }}
      >
        View
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 8, width: 420, maxWidth: "92vw",
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{
              padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.label}</div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-tertiary)" }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16, fontSize: 11, lineHeight: 1.7 }}>
              <Row k="Document name" v={doc.name ?? "—"} />
              <Row k="Status" v={doc.status ?? "—"} />
              <Row k="Expires" v={doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : "—"} />
              {doc.fileKey ? (
                <div style={{ marginTop: 12 }}>
                  <a
                    className="btn-sm btn-primary"
                    href={`/api/objects/${doc.fileKey.replace(/^\/?objects\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download file
                  </a>
                </div>
              ) : (
                <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-tertiary)" }}>
                  No file uploaded yet — only metadata is on file.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

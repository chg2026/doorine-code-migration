"use client";
import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";

type Property = { id: string; code: string; address: string; city: string | null; state: string | null };

export default function AddProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/properties?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setProperties(Array.isArray(data) ? data : []))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectProperty(p: Property) {
    setSelected(p);
    setQuery(p.address);
    setDropOpen(false);
    if (!name) setName(`${p.address} — Rehab project`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!selected) { setErr("Please select a property."); return; }
    const res = await fetch(`/api/properties/${selected.id}/start-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || `${selected.address} — Rehab project`,
        budget: budget ? Number(budget) : undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(billingAwareErrorMessage(res.status, j, j.error || `Failed (${res.status})`));
      return;
    }
    const { code } = await res.json();
    onClose();
    startTransition(() => router.push(`/rehab/${encodeURIComponent(code)}/overview`));
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-primary)", borderRadius: 10,
        padding: 24, width: 480, maxWidth: "95vw",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Create rehab project</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-tertiary)", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Property <span style={{ color: "#c0392b" }}>*</span>
            </label>
            <div ref={dropRef} style={{ position: "relative" }}>
              <input
                className="search-input"
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Search by address…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setDropOpen(true);
                }}
                onFocus={() => setDropOpen(true)}
              />
              {dropOpen && properties.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "var(--bg-primary)", border: "0.5px solid var(--border-mid)",
                  borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  maxHeight: 200, overflowY: "auto", marginTop: 2,
                }}>
                  {properties.map((p) => (
                    <div
                      key={p.id}
                      onMouseDown={() => selectProperty(p)}
                      style={{
                        padding: "8px 10px", cursor: "pointer", fontSize: 12,
                        borderBottom: "0.5px solid var(--border-lo)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <div style={{ fontWeight: 500 }}>{p.address}</div>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {[p.city, p.state].filter(Boolean).join(", ")} · {p.code}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {dropOpen && query.length > 0 && properties.length === 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "var(--bg-primary)", border: "0.5px solid var(--border-mid)",
                  borderRadius: 6, padding: "10px 12px", fontSize: 11,
                  color: "var(--text-tertiary)", marginTop: 2,
                }}>
                  No properties found — add one in Property Records first.
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Project name
            </label>
            <input
              className="search-input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="e.g. 514 Lakewood Ave — Rehab project"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Rehab budget ($)
            </label>
            <input
              className="search-input"
              style={{ width: "100%", boxSizing: "border-box" }}
              type="number"
              min="0"
              placeholder="Optional"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          {err && (
            <div style={{ fontSize: 11, color: "#791F1F", background: "#FEF2F2", borderRadius: 4, padding: "6px 10px" }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={pending || !selected}
              style={{ opacity: !selected ? 0.5 : 1 }}
            >
              {pending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

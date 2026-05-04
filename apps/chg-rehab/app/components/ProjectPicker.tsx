"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  address: string;
};

type Props = {
  value: string;
  onChange: (id: string, option: ProjectOption | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  autoFocus?: boolean;
};

function statusChipStyle(status: string): CSSProperties {
  switch (status) {
    case "Active":
      return { background: "var(--green-bg, #EAF3DE)", color: "var(--green-txt, #27500A)", borderColor: "rgba(39,80,10,0.25)" };
    case "Planning":
      return { background: "#EEF2FF", color: "#3730A3", borderColor: "rgba(55,48,163,0.25)" };
    case "Paused":
      return { background: "#FFFBEB", color: "#92400E", borderColor: "rgba(146,64,14,0.25)" };
    default:
      return {};
  }
}

/**
 * Searchable project picker backed by /api/projects/list.
 * Displays each option as `code · address` with a status chip.
 * Pass allowNone=true to include a "no project" option at the top of the list.
 */
export function ProjectPicker({
  value,
  onChange,
  disabled,
  allowNone,
  noneLabel = "General stock (no project)",
  autoFocus,
}: Props) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const attemptedTokenRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (attemptedTokenRef.current === reloadToken) return;
    attemptedTokenRef.current = reloadToken;

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/projects/list", { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `Failed to load projects (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProjects(Array.isArray(data?.projects) ? data.projects : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [autoFocus]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const selected = useMemo(
    () => projects?.find((p) => p.id === value) ?? null,
    [projects, value]
  );

  function retry() {
    setProjects(null);
    setError(null);
    setReloadToken((t) => t + 1);
  }

  const showNoneOption = allowNone && !search.trim();

  return (
    <div>
      <input
        ref={searchRef}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (value) onChange("", null);
        }}
        placeholder="Search by code, address, or name…"
        disabled={disabled || loading}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 12,
          border: "0.5px solid var(--border-lo)",
          borderRadius: 5,
          boxSizing: "border-box",
        }}
      />

      <div
        role="listbox"
        aria-label="Projects"
        style={{
          marginTop: 8,
          maxHeight: 220,
          overflowY: "auto",
          border: "0.5px solid var(--border-lo)",
          borderRadius: 5,
          background: "#fff",
        }}
      >
        {loading && (
          <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>
            Loading projects…
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: "10px 12px",
              fontSize: 11,
              color: "#791F1F",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={retry}
              disabled={disabled}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                border: "0.5px solid rgba(121,31,31,0.4)",
                borderRadius: 4,
                background: "#fff",
                color: "#791F1F",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && projects && projects.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>
            No active projects found.
          </div>
        )}

        {!loading && !error && projects && projects.length > 0 && filtered.length === 0 && !showNoneOption && (
          <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>
            No projects match &ldquo;{search}&rdquo;.
          </div>
        )}

        {!loading && !error && showNoneOption && (
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => onChange("", null)}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              background: value === "" ? "var(--bg-selected, #EEF2FF)" : "transparent",
              border: "none",
              borderBottom: "0.5px solid var(--border-lo)",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            {noneLabel}
          </button>
        )}

        {!loading &&
          !error &&
          filtered.map((p) => {
            const isSelected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setSearch("");
                  onChange(p.id, p);
                }}
                disabled={disabled}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  background: isSelected ? "var(--bg-selected, #EEF2FF)" : "transparent",
                  border: "none",
                  borderBottom: "0.5px solid var(--border-lo)",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{p.code}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 3,
                      border: "0.5px solid var(--border-mid)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      ...statusChipStyle(p.status),
                    }}
                  >
                    {p.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary, #475569)",
                    marginTop: 2,
                  }}
                >
                  {p.address || p.name}
                </div>
              </button>
            );
          })}
      </div>

      {selected && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary, #475569)" }}>
          Selected: <strong>{selected.code}</strong>
          {selected.address ? ` · ${selected.address}` : ""}
        </div>
      )}
    </div>
  );
}

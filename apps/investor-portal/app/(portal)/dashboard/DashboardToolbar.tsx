"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DashboardToolbar({
  deals,
  selectedDeal,
}: {
  deals: { id: string; name: string }[];
  selectedDeal: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  function onDealChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const qs = v === "all" ? "" : `?deal=${encodeURIComponent(v)}`;
    router.push(`/dashboard${qs}`);
  }

  function onExport() {
    setToast("PDF export coming soon");
    window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 10,
        position: "relative",
      }}
    >
      <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Deal:</label>
      <select
        className="chip-input"
        value={selectedDeal}
        onChange={onDealChange}
        style={{ minWidth: 200 }}
      >
        <option value="all">All deals</option>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm"
        onClick={onExport}
        style={{ marginLeft: "auto" }}
      >
        Export PDF
      </button>
      {toast ? (
        <div
          role="status"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#1a1916",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 11,
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            zIndex: 10,
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

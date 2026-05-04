"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ReEnableEmailsButton({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function reEnable(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/email-opt-out`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        type="button"
        className="btn-sm"
        disabled={busy}
        onClick={reEnable}
        title="Restore notification emails for this contact"
        style={{ fontSize: 9, padding: "2px 6px" }}
      >
        {busy ? "Working…" : "↺ Re-enable"}
      </button>
      {err && (
        <span style={{ fontSize: 9, color: "#791F1F" }}>{err}</span>
      )}
    </div>
  );
}

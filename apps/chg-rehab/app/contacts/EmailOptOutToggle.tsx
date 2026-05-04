"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  contactId: string;
  contactName: string;
  emailOptOut: boolean;
  emailOptOutAt: string | null;
};

/**
 * Admin-only control rendered inside the contractor detail panel. Lets an
 * admin re-enable a contact who unsubscribed via the link in an outbound
 * email (or proactively opt one out).
 */
export function EmailOptOutToggle({ contactId, contactName, emailOptOut, emailOptOutAt }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/email-opt-out`, {
        method: emailOptOut ? "DELETE" : "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (emailOptOut) {
    const optOutDate = emailOptOutAt
      ? new Date(emailOptOutAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
    return (
      <div
        style={{
          padding: "8px 10px",
          background: "#FFFBEB",
          border: "0.5px solid rgba(186,117,23,0.4)",
          borderRadius: 6,
          marginBottom: 10,
          fontSize: 10,
          color: "#633806",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <strong>Unsubscribed{optOutDate ? ` ${optOutDate}` : ""}.</strong> {contactName} won&apos;t receive
          notification emails until re-enabled.
          {err && <div style={{ color: "#791F1F", marginTop: 4 }}>{err}</div>}
        </div>
        <button
          type="button"
          className="btn-sm"
          disabled={busy}
          onClick={toggle}
          title="Restore notification emails for this contact"
        >
          {busy ? "Working…" : "Re-enable emails"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        className="btn-sm"
        disabled={busy}
        onClick={toggle}
        title="Stop sending notification emails to this contact"
        style={{ fontSize: 9, color: "var(--text-tertiary)" }}
      >
        {busy ? "Working…" : "✕ Disable emails"}
      </button>
      {err && <div style={{ color: "#791F1F", fontSize: 10, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

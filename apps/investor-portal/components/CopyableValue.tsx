"use client";

import { useState } from "react";

/**
 * Tiny inline value + copy-to-clipboard button used by the wire/ACH
 * instruction tables on the funding and capital call pages so investors
 * can paste account/routing/SWIFT/memo values into their bank UI without
 * retyping (and without copy errors).
 */
export default function CopyableValue({
  value,
  mono = true,
}: {
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <>—</>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={
          mono
            ? { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }
            : undefined
        }
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => undefined);
          }
        }}
        title={copied ? "Copied!" : "Copy"}
        aria-label="Copy to clipboard"
        style={{
          background: "none",
          border: 0,
          cursor: "pointer",
          color: copied ? "var(--teal)" : "var(--text-tertiary)",
          fontSize: 12,
          padding: "0 4px",
          lineHeight: 1,
        }}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

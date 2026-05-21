"use client";

import { useState, useTransition } from "react";
import { setPmLed } from "@/lib/rehab/actions";

export default function PmLedToggle({
  projectCode,
  pmLed: initial,
}: {
  projectCode: string;
  pmLed: boolean;
}) {
  const [pmLed, setLocal] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    if (pending) return;
    const next = !pmLed;
    setLocal(next);
    setErr(null);
    startTransition(async () => {
      try {
        await setPmLed(projectCode, next);
      } catch (e) {
        setLocal(!next);
        setErr(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={pmLed ? "PM-Led — toggle off to switch to Contractor-Led" : "Contractor-Led — toggle on to switch to PM-Led"}
      className="pm-toggle"
      aria-pressed={pmLed}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        fontSize: 10,
        fontWeight: 500,
        borderRadius: 10,
        border: "0.5px solid",
        cursor: pending ? "wait" : "pointer",
        background: pmLed ? "var(--blue-bg)" : "var(--bg-secondary)",
        color: pmLed ? "var(--blue-txt)" : "var(--text-secondary)",
        borderColor: pmLed ? "rgba(31,77,92,0.4)" : "var(--border-mid)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: pmLed ? "var(--blue)" : "var(--text-tertiary)",
        }}
      />
      {pmLed ? "PM-Led" : "Contractor-Led"}
      {err && <span style={{ color: "var(--red-txt)", marginLeft: 4 }}>!</span>}
    </button>
  );
}

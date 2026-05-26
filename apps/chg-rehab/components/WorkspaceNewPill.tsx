"use client";

import { useEffect, useState } from "react";

const KEYS = ["command-center", "messages"];

/**
 * Renders a small "NEW" pill next to the Workspace sidebar label until the
 * user has visited both Workspace pages. Listens on the "workspace-new-seen"
 * window event so other components can trigger a re-check.
 */
export default function WorkspaceNewPill() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem("workspace_new_seen");
        const seen: string[] = raw ? JSON.parse(raw) : [];
        setShow(KEYS.some((k) => !seen.includes(k)));
      } catch {
        setShow(true);
      }
    };
    check();
    window.addEventListener("workspace-new-seen", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("workspace-new-seen", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  if (!show) return null;
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: 8,
        fontSize: 9,
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--brass, #B8895A)",
        color: "#fff",
        fontWeight: 600,
        letterSpacing: "0.05em",
        verticalAlign: "middle",
      }}
    >
      NEW
    </span>
  );
}

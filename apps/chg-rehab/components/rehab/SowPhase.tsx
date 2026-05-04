"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function SowPhase({
  header,
  children,
  defaultOpen = false,
  anchorId,
  forceOpen = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  anchorId?: string;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [forceOpen]);

  return (
    <>
      <div
        ref={ref}
        id={anchorId}
        className="sow-phase"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{ cursor: "pointer" }}
      >
        {header}
      </div>
      {open && <div className="sow-items">{children}</div>}
    </>
  );
}

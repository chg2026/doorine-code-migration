"use client";

import { useState } from "react";
import SubscribeModal from "./SubscribeModal";

export default function SubscribeButton({
  offeringId,
  offeringName,
  minInvestment,
  wireInstructions,
  className,
  label,
}: {
  offeringId: string;
  offeringName: string;
  minInvestment: number | null;
  wireInstructions?: Record<string, unknown> | null;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || "btn btn-sm btn-p"}
      >
        {label || "+ Subscribe to deal"}
      </button>
      {open ? (
        <SubscribeModal
          offeringId={offeringId}
          offeringName={offeringName}
          minInvestment={minInvestment}
          wireInstructions={wireInstructions ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

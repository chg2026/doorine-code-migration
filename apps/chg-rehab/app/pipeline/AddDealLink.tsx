"use client";
import { useRouter, useSearchParams } from "next/navigation";

export default function AddDealLink({ stage }: { stage?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("new", "1");
    next.set("view", "board");
    if (stage) next.set("stage", stage);
    router.push(`?${next.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: "block", width: "100%", padding: 8,
        border: "1px dashed var(--border-lo)",
        borderRadius: 6, textAlign: "center", fontSize: 10,
        color: "var(--text-tertiary)", cursor: "pointer",
        background: "none",
      }}
    >
      + Add deal
    </button>
  );
}

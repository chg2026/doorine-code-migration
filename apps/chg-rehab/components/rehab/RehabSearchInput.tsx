"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RehabSearchInput({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  function push(next: string) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next) sp.set("q", next);
    else sp.delete("q");
    router.replace(`/rehab${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }

  return (
    <input
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => push(v), 180);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          push(value);
        }
      }}
      className="search-input"
      placeholder="Search projects…"
      style={{ width: "100%", fontSize: 11 }}
    />
  );
}

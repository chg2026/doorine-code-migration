"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Live (debounced) search box for the Property sidebar.
 *
 * As the user types we update the `q=` URL param without forcing a full
 * form-submit / reload — matching the live filter behaviour the contacts
 * sidebar uses. Other params (id, filter, tab) are preserved.
 */
export default function PropertySearchInput({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if the user navigates (e.g. clicks a row).
  useEffect(() => { setValue(initialValue); }, [initialValue]);

  function push(next: string) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next) sp.set("q", next);
    else sp.delete("q");
    router.replace(`/property${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
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
      placeholder="Search address, city, ID..."
      style={{ width: "100%", fontSize: 11 }}
    />
  );
}

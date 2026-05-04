"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useTransition } from "react";

type Props = {
  tab: string;
  trades?: string[];
  categories?: string[];
  showTrade?: boolean;
  showCategory?: boolean;
  showStatus?: boolean;
  placeholder?: string;
};

export function FilterBar({ tab, trades = [], categories = [], showTrade, showCategory, showStatus, placeholder }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [trade, setTrade] = useState(sp.get("trade") ?? "");
  const [category, setCategory] = useState(sp.get("category") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setTrade(sp.get("trade") ?? "");
    setCategory(sp.get("category") ?? "");
    setStatus(sp.get("status") ?? "");
  }, [sp]);

  function push(next: { q?: string; trade?: string; category?: string; status?: string }) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab);
    const setOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length) params.set(k, v);
      else params.delete(k);
    };
    setOrDelete("q", next.q);
    setOrDelete("trade", next.trade);
    setOrDelete("category", next.category);
    setOrDelete("status", next.status);
    const id = sp.get("id");
    if (id) params.set("id", id);
    startTransition(() => router.replace(`/contacts?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="action-bar" style={{ flexShrink: 0 }}>
      <input
        className="search-input"
        placeholder={placeholder ?? "Search…"}
        style={{ flex: 1, fontSize: 11, maxWidth: 260 }}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          push({ q: e.target.value, trade, status });
        }}
      />
      {showTrade && (
        <select
          className="filter-sel"
          value={trade}
          onChange={(e) => {
            setTrade(e.target.value);
            push({ q, trade: e.target.value, category, status });
          }}
        >
          <option value="">All trades</option>
          {trades.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {showCategory && (
        <select
          className="filter-sel"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            push({ q, trade, category: e.target.value, status });
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {showStatus && (
        <select
          className="filter-sel"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            push({ q, trade, category, status: e.target.value });
          }}
        >
          <option value="">All statuses</option>
          <option value="Preferred">Preferred</option>
          <option value="Standard">Standard</option>
          <option value="DoNotUse">Do not use</option>
        </select>
      )}
    </div>
  );
}

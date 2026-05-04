"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Notice = {
  id: string;
  event: string;
  title: string;
  body: string | null;
  link: string | null;
  urgent: boolean;
  readAt: string | null;
  createdAt: string;
};

type FeedResponse = { unreadCount: number; items: Notice[] };

const POLL_MS = 60_000;

function formatRel(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as FeedResponse;
      setUnread(data.unreadCount);
      setItems(data.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  };

  const markAll = async () => {
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      setUnread(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", marginRight: 4 }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        title={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        style={{
          height: 32,
          width: 32,
          borderRadius: 4,
          background: "transparent",
          border: "1px solid var(--border-mid, #d0d4d9)",
          color: "var(--text-secondary, #444)",
          cursor: "pointer",
          position: "relative",
          padding: 0,
          fontSize: 16,
          lineHeight: "30px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              background: "#d92626",
              color: "#fff",
              borderRadius: 8,
              fontSize: 10,
              lineHeight: "16px",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={popRef}
          style={{
            position: "absolute",
            top: 38,
            right: 0,
            width: 360,
            maxHeight: 480,
            background: "#fff",
            border: "1px solid var(--border-mid, #d0d4d9)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border-mid, #d0d4d9)",
              background: "#fafbfc",
            }}
          >
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            <button
              type="button"
              onClick={markAll}
              disabled={loading || unread === 0}
              style={{
                background: "transparent",
                border: "none",
                color: unread === 0 ? "#999" : "#0f62fe",
                fontSize: 11,
                cursor: unread === 0 ? "default" : "pointer",
                padding: 0,
              }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {items.length === 0 ? (
              <div
                style={{ padding: "24px 12px", textAlign: "center", color: "#666", fontSize: 12 }}
              >
                No notifications yet.
              </div>
            ) : (
              items.map((n) => {
                const isUnread = !n.readAt;
                const inner = (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #eef0f2",
                      background: isUnread ? "#f0f7ff" : "#fff",
                      cursor: n.link ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 12, color: n.urgent ? "#a51b1b" : "#111" }}>
                        {n.title}
                      </strong>
                      <span style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>
                        {formatRel(n.createdAt)}
                      </span>
                    </div>
                    {n.body ? (
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{n.body}</div>
                    ) : null}
                  </div>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      if (isUnread) markRead(n.id);
                      setOpen(false);
                    }}
                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} onClick={() => isUnread && markRead(n.id)}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

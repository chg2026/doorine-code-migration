"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import s from "@/components/workspace/styles.module.css";
import CreateTaskModal from "@/components/workspace/CreateTaskModal";

type ChannelListItem = {
  id: string;
  kind: "team" | "contractor" | "investor";
  name: string;
  preview: string | null;
  previewAt: string | null;
  unread: number;
};
type Channels = { team: ChannelListItem[]; contractors: ChannelListItem[]; investors: ChannelListItem[] };

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  authorName: string;
  authorInitials: string;
  convertedTaskId: string | null;
  convertedTaskTitle: string | null;
};

const EMPTY: Channels = { team: [], contractors: [], investors: [] };

export default function MessagesPage() {
  const params = useSearchParams();
  const initialId = params.get("channel");
  const [channels, setChannels] = useState<Channels>(EMPTY);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [composer, setComposer] = useState("");
  const [taskModal, setTaskModal] = useState<{ open: boolean; initial: string; src: string | null }>({ open: false, initial: "", src: null });
  const [newChanOpen, setNewChanOpen] = useState(false);
  const [newChanName, setNewChanName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Dismiss NEW pill.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workspace_new_seen");
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (!seen.includes("messages")) {
        seen.push("messages");
        localStorage.setItem("workspace_new_seen", JSON.stringify(seen));
        window.dispatchEvent(new Event("workspace-new-seen"));
      }
    } catch { /* ignore */ }
  }, []);

  // Detect admin (best-effort, used to show + channel button).
  useEffect(() => {
    fetch("/api/auth/user").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.user?.role === "Admin" || d?.role === "Admin") setIsAdmin(true);
    }).catch(() => undefined);
  }, []);

  const loadChannels = useCallback(async () => {
    const r = await fetch("/api/workspace/channels", { cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as Channels;
    setChannels(data);
    if (!activeId && data.team[0]) setActiveId(data.team[0].id);
  }, [activeId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async (chId: string, opts?: { incremental?: boolean }) => {
    const after = opts?.incremental && messages.length ? `?after=${encodeURIComponent(messages[messages.length - 1].createdAt)}` : "";
    const r = await fetch(`/api/workspace/channels/${chId}/messages${after}`, { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    setMessages((prev) => opts?.incremental ? [...prev, ...(data.messages ?? [])] : (data.messages ?? []));
  }, [messages]);

  // Load messages on channel switch.
  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    loadMessages(activeId);
    // mark as read
    fetch(`/api/workspace/channels/${activeId}/read`, { method: "PATCH" }).then(loadChannels).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Poll for new messages every 3s when visible.
  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      await loadMessages(activeId, { incremental: true });
    };
    const id = window.setInterval(tick, 3000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [activeId, loadMessages]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length]);

  const activeChannel = useMemo(() => {
    const all = [...channels.team, ...channels.contractors, ...channels.investors];
    return all.find((c) => c.id === activeId) ?? null;
  }, [channels, activeId]);

  const send = async () => {
    const text = composer.trim();
    if (!text || !activeId) return;
    setComposer("");
    await fetch(`/api/workspace/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    await loadMessages(activeId, { incremental: true });
    loadChannels();
  };

  const createChannel = async () => {
    if (!newChanName.trim()) return;
    await fetch("/api/workspace/channels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newChanName.trim() }),
    });
    setNewChanName("");
    setNewChanOpen(false);
    loadChannels();
  };

  const openTaskFromMessage = (m: Msg) => {
    setTaskModal({ open: true, initial: m.body.slice(0, 200), src: m.id });
  };

  const renderListGroup = (title: string, items: ChannelListItem[], addBtn?: React.ReactNode) => (
    <>
      <div className={s.msgSection}>
        <span>{title}</span>
        {addBtn}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "8px 14px 14px", fontSize: 11, color: "var(--stone)" }}>
          None yet.
        </div>
      ) : items.map((c) => (
        <div
          key={c.id}
          className={`${s.msgListItem} ${activeId === c.id ? s.active : ""}`}
          onClick={() => setActiveId(c.id)}
        >
          <div className={s.msgListMain}>
            <div className={s.msgListTitle}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              {c.unread > 0 ? <span className={s.unreadDot} /> : null}
            </div>
            {c.preview ? <div className={s.msgListPreview}>{c.preview}</div> : null}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Messages</h1>
          <div className={s.subtitle}>Talk to your team, contractors and investors in one place.</div>
        </div>
      </div>
      <div className={s.msgWrap}>
        <div className={s.msgSidebar}>
          <div className={s.msgList}>
            {renderListGroup("Team", channels.team,
              isAdmin ? (
                <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => setNewChanOpen(true)}>+</button>
              ) : null
            )}
            {renderListGroup("Contractors", channels.contractors)}
            {renderListGroup("Investors", channels.investors)}
          </div>
        </div>
        <div className={s.threadPane}>
          {activeChannel ? (
            <>
              <div className={s.threadHead}>
                <div className={s.threadHeadTitle}>{activeChannel.name}</div>
                <div className={s.threadHeadSub}>
                  {activeChannel.kind === "team" ? "Team channel" :
                   activeChannel.kind === "contractor" ? "Direct message with contractor" :
                   "Direct message with investor"}
                </div>
              </div>
              <div className={s.threadBody} ref={threadRef}>
                {messages.length === 0 ? (
                  <div className={s.empty}>No messages yet. Say hi 👋</div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`${s.msgBubble} ${m.mine ? s.mine : s.theirs}`}>
                    {!m.mine ? (
                      <div className={s.msgMeta} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={s.avatar} style={{ width: 22, height: 22, fontSize: 10 }}>{m.authorInitials}</span>
                        <span>{m.authorName}</span>
                      </div>
                    ) : null}
                    <div className={s.msgText}>{m.body}</div>
                    <div className={s.msgMeta} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      {m.convertedTaskId ? (
                        <span className={s.convertedBadge}>✓ Converted to task</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openTaskFromMessage(m)}
                          style={{ background: "none", border: "none", color: "var(--marine)", fontSize: 10, cursor: "pointer", padding: 0 }}
                        >
                          Convert to task
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className={s.composer}>
                <textarea
                  className={s.composerInput}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Type a message — Shift+Enter for newline"
                  rows={1}
                />
                <button
                  type="button"
                  className={`${s.btn} ${s.ghost}`}
                  onClick={() => setTaskModal({ open: true, initial: composer, src: null })}
                  title="Create a task from this draft"
                >
                  Task
                </button>
                <button type="button" className={s.btn} onClick={send} disabled={!composer.trim()}>Send</button>
              </div>
            </>
          ) : (
            <div className={s.empty} style={{ alignSelf: "center", margin: "auto" }}>
              Pick a channel to start chatting.
            </div>
          )}
        </div>
      </div>

      <CreateTaskModal
        open={taskModal.open}
        onClose={() => setTaskModal({ open: false, initial: "", src: null })}
        initialTitle={taskModal.initial}
        sourceMessageId={taskModal.src}
        onCreated={() => { if (activeId) loadMessages(activeId); }}
      />

      {newChanOpen ? (
        <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setNewChanOpen(false); }}>
          <div className={s.modal} style={{ width: 380 }}>
            <div className={s.modalHead}>
              <div className={s.modalTitle}>New team channel</div>
              <button type="button" className={s.modalClose} onClick={() => setNewChanOpen(false)}>×</button>
            </div>
            <div className={s.modalBody}>
              <div className={s.field}>
                <label className={s.fieldLabel}>Channel name</label>
                <input
                  className={s.fieldInput}
                  value={newChanName}
                  onChange={(e) => setNewChanName(e.target.value)}
                  placeholder="e.g. underwriting"
                  autoFocus
                />
              </div>
            </div>
            <div className={s.modalFoot}>
              <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => setNewChanOpen(false)}>Cancel</button>
              <button type="button" className={s.btn} onClick={createChannel} disabled={!newChanName.trim()}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

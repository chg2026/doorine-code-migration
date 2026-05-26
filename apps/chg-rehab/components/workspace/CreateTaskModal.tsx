"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./styles.module.css";

export type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
  initialTitle?: string;
  sourceMessageId?: string | null;
};

type Mention = { id: string; name: string; initials: string; email: string | null };
type LinkItem = { id: string; label: string; sublabel: string };

const PRIORITIES = ["Urgent", "Medium", "Low"] as const;

export default function CreateTaskModal({
  open,
  onClose,
  onCreated,
  initialTitle = "",
  sourceMessageId = null,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Medium");
  const [dueDate, setDueDate] = useState<string>("");
  const [linkValue, setLinkValue] = useState<string>("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [links, setLinks] = useState<{ deals: LinkItem[]; projects: LinkItem[] }>({ deals: [], projects: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setAssigneeId("");
    setPriority("Medium");
    setDueDate("");
    setLinkValue("");
    setErr(null);
    Promise.all([
      fetch("/api/workspace/mentions").then((r) => r.json()).catch(() => ({ users: [] })),
      fetch("/api/workspace/links").then((r) => r.json()).catch(() => ({ deals: [], projects: [] })),
    ]).then(([m, l]) => {
      setMentions(m.users ?? []);
      setLinks({ deals: l.deals ?? [], projects: l.projects ?? [] });
    });
  }, [open, initialTitle]);

  const linkParts = useMemo(() => {
    if (!linkValue) return null;
    const [kind, id] = linkValue.split(":");
    const list = kind === "deal" ? links.deals : kind === "project" ? links.projects : [];
    const found = list.find((x) => x.id === id);
    if (!found) return null;
    return { type: kind, id, label: found.label };
  }, [linkValue, links]);

  const submit = useCallback(async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("Task name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          assigneeId: assigneeId || null,
          priority,
          dueDate: dueDate || null,
          linkType: linkParts?.type ?? null,
          linkId: linkParts?.id ?? null,
          linkLabel: linkParts?.label ?? null,
          sourceMessageId,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Failed to create task");
      onCreated?.(data.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, assigneeId, priority, dueDate, linkParts, sourceMessageId, onCreated, onClose]);

  if (!open) return null;

  return (
    <div className={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>New task</div>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.field}>
            <label className={s.fieldLabel}>Task name</label>
            <input
              className={s.fieldInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Follow up with seller on 210 Harbour Ln"
              autoFocus
            />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Assign to</label>
            <select className={s.fieldSelect} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {mentions.map((m) => (
                <option key={m.id} value={m.id}>@{m.name}</option>
              ))}
            </select>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.fieldLabel}>Due date</label>
              <input
                type="date"
                className={s.fieldInput}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Priority</label>
              <select
                className={s.fieldSelect}
                value={priority}
                onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Link to (optional)</label>
            <select className={s.fieldSelect} value={linkValue} onChange={(e) => setLinkValue(e.target.value)}>
              <option value="">— None —</option>
              {links.deals.length ? <optgroup label="Active deals">
                {links.deals.map((d) => <option key={d.id} value={`deal:${d.id}`}>{d.label}</option>)}
              </optgroup> : null}
              {links.projects.length ? <optgroup label="Active rehabs">
                {links.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.label}</option>)}
              </optgroup> : null}
            </select>
          </div>
          {err ? <div className={s.error}>{err}</div> : null}
        </div>
        <div className={s.modalFoot}>
          <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={s.btn} onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

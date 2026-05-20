import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Upload, Trash2, GripVertical, Star, ImageOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

// ─── Zillow-style multi-photo uploader ───────────────────────────────────
//
// Props:
//   dealId   — string. Uploads land at  `${dealId}/${filename}` in the
//              `deal-photos` Supabase Storage bucket. Use a stable id
//              even for new deals (caller can pass a uuid placeholder).
//   value    — string[] of public URLs (ordered; first is the cover).
//   onChange — (urls: string[]) => void, called whenever the gallery
//              changes (upload, delete, reorder, set-cover).
//   max      — optional, default 12.
//   maxBytes — optional, default 10 MB.
//
// Features:
//   * Drag-and-drop OR click-to-pick
//   * Per-file progress + per-file error
//   * jpg / png / webp validation, size cap, count cap
//   * Card grid (3-up) with cover badge, drag-handle reorder, delete,
//     "Set as cover" action.
//
// Storage path is reconstructed from the public URL when deleting; the
// component never persists internal state of its own beyond in-flight
// uploads — `value` is the source of truth.

const BUCKET = 'deal-photos';
const ACCEPT = 'image/jpeg,image/png,image/webp';
const ACCEPT_EXT = /\.(jpe?g|png|webp)$/i;
const GOLD = '#F5C518';

const DEFAULT_MAX = 12;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function publicUrlFor(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  } catch {
    return url.slice(i + marker.length).split('?')[0];
  }
}

function safeName(name) {
  return (name || 'photo')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80);
}

export default function PhotoUploader({
  dealId,
  value,
  onChange,
  max = DEFAULT_MAX,
  maxBytes = DEFAULT_MAX_BYTES,
}) {
  const urls = Array.isArray(value) ? value.filter(Boolean) : [];
  const [pending, setPending] = React.useState([]); // [{ id, name, progress, error }]
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const slotsLeft = Math.max(0, max - urls.length - pending.length);

  function emit(next) {
    onChange?.(next);
  }

  // ── upload pipeline ───────────────────────────────────────────────────
  async function handleFiles(fileList) {
    if (!dealId) {
      // Defensive — caller should always pass a dealId.
      // eslint-disable-next-line no-console
      console.warn('[PhotoUploader] dealId required before uploading.');
      return;
    }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const accepted = [];
    const rejections = [];
    for (const f of incoming) {
      if (accepted.length + urls.length + pending.length >= max) {
        rejections.push({ name: f.name, reason: `Max ${max} photos.` });
        continue;
      }
      if (!ACCEPT_EXT.test(f.name) && !/^image\/(jpeg|png|webp)$/.test(f.type)) {
        rejections.push({ name: f.name, reason: 'Only JPG, PNG, or WebP.' });
        continue;
      }
      if (f.size > maxBytes) {
        rejections.push({
          name: f.name,
          reason: `Over ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
        });
        continue;
      }
      accepted.push(f);
    }

    if (rejections.length) {
      setPending((p) => [
        ...p,
        ...rejections.map((r) => ({
          id: `rej-${Date.now()}-${Math.random()}`,
          name: r.name,
          progress: 0,
          error: r.reason,
          done: false,
        })),
      ]);
    }

    // Track pending entries we'll be uploading.
    const tasks = accepted.map((f) => ({
      id: `up-${Date.now()}-${Math.random()}`,
      file: f,
      name: f.name,
      progress: 0,
      error: null,
      done: false,
    }));
    if (tasks.length) {
      setPending((p) => [
        ...p,
        ...tasks.map(({ file: _f, ...rest }) => rest),
      ]);
    }

    // Upload in parallel — Supabase JS handles its own concurrency. We
    // accumulate successful URLs and emit a single onChange at the end so
    // we don't fight optimistic re-renders mid-upload.
    const newUrls = [];
    await Promise.all(
      tasks.map(async (t) => {
        const path = `${dealId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(t.file.name)}`;
        try {
          // Show indeterminate progress — Supabase JS upload doesn't expose
          // streaming progress events in v2, so we flip to ~50% on start
          // and 100% on success.
          setPending((p) => p.map((x) => (x.id === t.id ? { ...x, progress: 50 } : x)));
          const { error } = await supabase.storage.from(BUCKET).upload(path, t.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: t.file.type || undefined,
          });
          if (error) throw error;
          const url = publicUrlFor(path);
          if (!url) throw new Error('Upload succeeded but public URL unavailable.');
          newUrls.push(url);
          setPending((p) =>
            p.map((x) => (x.id === t.id ? { ...x, progress: 100, done: true } : x)),
          );
        } catch (err) {
          setPending((p) =>
            p.map((x) =>
              x.id === t.id
                ? { ...x, error: err?.message || 'Upload failed', progress: 0 }
                : x,
            ),
          );
        }
      }),
    );

    if (newUrls.length) emit([...urls, ...newUrls]);

    // Clear successful pending rows after a beat so the user sees the
    // 100% tick before they vanish.
    setTimeout(() => {
      setPending((p) => p.filter((x) => !x.done));
    }, 1200);
  }

  // ── drag-over UI on the dropzone ──────────────────────────────────────
  function onDragEnter(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false); }
  function onDragOver(e) { e.preventDefault(); }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer?.files);
  }

  // ── card actions ──────────────────────────────────────────────────────
  function setCover(idx) {
    if (idx <= 0 || idx >= urls.length) return;
    const next = [urls[idx], ...urls.filter((_, i) => i !== idx)];
    emit(next);
  }

  async function remove(idx) {
    const url = urls[idx];
    const next = urls.filter((_, i) => i !== idx);
    emit(next); // optimistic — even if storage delete fails the row is gone
    const path = pathFromPublicUrl(url);
    if (!path) return;
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch (err) {
      // Don't restore the UI — orphaned objects are a janitorial issue,
      // not a user-facing one. Surface in console for debugging.
      // eslint-disable-next-line no-console
      console.warn('[PhotoUploader] storage remove failed', err);
    }
  }

  function onDragEnd(result) {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const next = urls.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    emit(next);
  }

  // ── render ────────────────────────────────────────────────────────────
  const dropzoneDisabled = slotsLeft <= 0;

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        onClick={() => !dropzoneDisabled && fileInputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={[
          'rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors cursor-pointer select-none',
          dropzoneDisabled
            ? 'border-[rgba(0,0,0,0.08)] bg-white/30 cursor-not-allowed opacity-60'
            : dragOver
              ? 'border-yellow-400 bg-yellow-400/5'
              : 'border-[rgba(0,0,0,0.08)] bg-white/40 hover:border-[rgba(0,0,0,0.10)] hover:bg-white/60',
        ].join(' ')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !dropzoneDisabled) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: GOLD }} />
        <p className="text-sm text-[#3a3a3c] font-medium">
          {dropzoneDisabled
            ? `Photo limit reached (${max})`
            : 'Drop photos here, or click to browse'}
        </p>
        <p className="text-[11px] text-[#86868b] mt-1">
          JPG, PNG, or WebP · up to {(maxBytes / 1024 / 1024).toFixed(0)} MB ·{' '}
          {urls.length}/{max} used
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
      </div>

      {/* Pending / error rows */}
      {pending.length > 0 && (
        <div className="space-y-1.5">
          {pending.map((p) => (
            <div
              key={p.id}
              className={[
                'flex items-center gap-3 rounded-md border px-3 py-2 text-xs',
                p.error
                  ? 'border-red-900/50 bg-red-900/10 text-red-300'
                  : 'border-[rgba(0,0,0,0.08)] bg-white/50 text-[#3a3a3c]',
              ].join(' ')}
            >
              {p.error ? (
                <ImageOff className="w-3.5 h-3.5 shrink-0" />
              ) : p.done ? (
                <Star className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
              ) : (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              )}
              <span className="truncate flex-1">{p.name}</span>
              {p.error ? (
                <span className="text-red-400 shrink-0">{p.error}</span>
              ) : (
                <div className="w-24 h-1.5 bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${p.progress}%`, background: GOLD }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {urls.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="photos" direction="horizontal">
            {(dropProvided) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
              >
                {urls.map((url, idx) => (
                  <Draggable key={url} draggableId={url} index={idx}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={[
                          'relative aspect-video rounded-lg overflow-hidden border bg-white group',
                          snapshot.isDragging ? 'ring-2' : 'border-[rgba(0,0,0,0.08)]',
                        ].join(' ')}
                        style={{
                          ...dragProvided.draggableProps.style,
                          ...(snapshot.isDragging ? { boxShadow: `0 0 0 2px ${GOLD}` } : {}),
                          backgroundImage: `url(${url})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        {/* Cover badge */}
                        {idx === 0 && (
                          <span
                            className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-black"
                            style={{ background: GOLD }}
                          >
                            Cover
                          </span>
                        )}

                        {/* Drag handle */}
                        <button
                          type="button"
                          {...dragProvided.dragHandleProps}
                          aria-label="Reorder"
                          className="absolute top-2 right-2 p-1 rounded bg-black/60 hover:bg-black/80 text-white cursor-grab active:cursor-grabbing"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Hover action bar */}
                        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          {idx !== 0 ? (
                            <button
                              type="button"
                              onClick={() => setCover(idx)}
                              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white border border-white/20"
                              title="Make this the cover photo"
                            >
                              Set as cover
                            </button>
                          ) : (
                            <span />
                          )}
                          <button
                            type="button"
                            onClick={() => remove(idx)}
                            className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white"
                            title="Delete photo"
                            aria-label="Delete photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { uploadProjectDocument } from "@/lib/rehab/actions";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_TYPES_LABEL,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/fileValidation";

const DEFAULT_CATEGORIES = [
  "Contract",
  "Addendum",
  "Permit",
  "Inspection",
  "Invoice",
  "Receipt",
  "Photos",
  "Misc Admin",
];

export default function DocUploadButton({
  projectCode,
  defaultCategory,
  label = "+ Upload document",
  fixedCategory = false,
}: {
  projectCode: string;
  defaultCategory?: string;
  label?: string;
  fixedCategory?: boolean;
}) {
  const categories = fixedCategory && defaultCategory ? [defaultCategory] : DEFAULT_CATEGORIES;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? categories[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setCategory(defaultCategory ?? categories[0]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadFileToStorage(file: File): Promise<{
    fileKey: string;
    mimeType: string;
    size: number;
  }> {
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw new Error(`File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`);
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error(`File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`);
    }
    const initRes = await fetch("/api/uploads/request-url", { method: "POST" });
    if (!initRes.ok) {
      const body = await initRes.json().catch(() => ({}));
      throw new Error(body?.error ?? `Upload URL request failed (${initRes.status})`);
    }
    const { uploadUrl, objectPath } = (await initRes.json()) as {
      uploadUrl: string;
      objectPath: string;
    };
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed (${putRes.status})`);
    }
    return {
      fileKey: objectPath,
      mimeType,
      size: file.size,
    };
  }

  function submit() {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    const docName = name.trim() || file?.name || "";
    if (!docName) {
      setError("Choose a file or enter a document name");
      return;
    }
    if (!file) {
      setError("Choose a file to upload");
      return;
    }
    startTransition(async () => {
      try {
        const stored = await uploadFileToStorage(file);
        await uploadProjectDocument(projectCode, {
          name: docName,
          category,
          fileKey: stored.fileKey,
          mimeType: stored.mimeType,
          size: stored.size,
        });
        reset();
        setOpen(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <>
      <button className="btn-sm" onClick={() => setOpen((v) => !v)}>{label}</button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 38,
            right: 16,
            background: "#fff",
            border: "0.5px solid var(--border-mid)",
            borderRadius: 4,
            padding: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            width: 300,
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>
            Upload {fixedCategory ? category.toLowerCase() : "document"} — {projectCode}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            style={{ width: "100%", fontSize: 11, marginBottom: 2 }}
            disabled={pending}
          />
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 6 }}>
            {ALLOWED_UPLOAD_TYPES_LABEL} · max {MAX_UPLOAD_SIZE_LABEL}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document name (optional — defaults to file name)"
            disabled={pending}
            style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
          />
          {!fixedCategory && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={pending}
              style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 8 }}
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={() => { setOpen(false); reset(); }} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending}>
              {pending ? "Uploading..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

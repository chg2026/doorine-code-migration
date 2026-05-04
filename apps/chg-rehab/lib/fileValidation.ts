/**
 * Shared file-upload validation for compliance documents and project documents.
 * Import from both server actions and client components — no server-only imports here.
 */

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

/** Human-readable list shown in error messages. */
export const ALLOWED_UPLOAD_TYPES_LABEL = "PDF, JPG, or PNG";

/** 20 MB in bytes */
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

export const MAX_UPLOAD_SIZE_LABEL = "20 MB";

/**
 * Throws a descriptive Error when the mime type or size is not allowed.
 * Call from server actions (after receiving metadata from the client) and
 * from client components (before uploading, for fast feedback).
 */
export function assertValidUpload(mimeType: string | null | undefined, sizeBytes: number | null | undefined): void {
  if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`
    );
  }
  if (sizeBytes != null && sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(
      `File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`
    );
  }
}

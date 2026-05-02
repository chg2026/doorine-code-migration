/**
 * Server-side file validation that reads trusted metadata directly from
 * object storage rather than relying on client-supplied values.
 *
 * The actual content-type and size come from GCS object metadata, which is
 * set when the file is PUT via the presigned URL. File size in particular
 * cannot be forged by the caller — GCS records the actual bytes written.
 * Content-type is derived from the Content-Type header sent during PUT, which
 * is at least bound to the specific uploaded object (unlike a free-form field
 * in a server action payload).
 */

import { getPrivateFile } from "./objectStorage";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  ALLOWED_UPLOAD_TYPES_LABEL,
  MAX_UPLOAD_SIZE_LABEL,
} from "./fileValidation";

/**
 * Fetch the object at `fileKey` from storage and assert that its content-type
 * is in the allow-list and its size is within the cap.
 *
 * No-op when `fileKey` is falsy (field is optional in some actions).
 */
export async function assertValidStoredUpload(fileKey: string | null | undefined): Promise<void> {
  if (!fileKey) return;

  const file = await getPrivateFile(fileKey);
  const [metadata] = await file.getMetadata();

  const contentType = metadata.contentType as string | undefined;
  const rawSize = metadata.size;
  const sizeBytes =
    typeof rawSize === "string"
      ? parseInt(rawSize, 10)
      : typeof rawSize === "number"
      ? rawSize
      : null;

  if (contentType && !ALLOWED_UPLOAD_MIME_TYPES.has(contentType)) {
    throw new Error(
      `File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`
    );
  }

  if (sizeBytes != null && !isNaN(sizeBytes) && sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(
      `File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`
    );
  }
}

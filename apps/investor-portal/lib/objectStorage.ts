/**
 * Investor-portal facade over the chg-rehab object storage helper. Both apps
 * share the same Replit Object Storage bucket; we re-export the bits the
 * portal needs so we don't reimplement signing/streaming.
 */
export {
  getPrivateFile,
  getUploadUrl,
  ObjectNotFoundError,
  streamFile,
} from "../../chg-rehab/lib/objectStorage";

import { getPrivateFile } from "../../chg-rehab/lib/objectStorage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/**
 * Generate a short-lived signed GET URL for a stored object. Used by the
 * documents API so the browser can stream the file directly from GCS without
 * proxying through Next.js.
 *
 * Default TTL: 5 minutes (matches the spec in task-7 step 5).
 */
export async function getSignedDownloadUrl(
  objectPath: string,
  ttlSec = 300
): Promise<string> {
  // Validate that the object actually exists / is reachable, both as a
  // defence against arbitrary path strings AND so the caller can map a
  // missing object to a clean 404.
  const file = await getPrivateFile(objectPath);
  const res = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: file.bucket.name,
        object_name: file.name,
        method: "GET",
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`failed to sign download url: ${res.status} ${await res.text()}`);
  }
  const { signed_url } = (await res.json()) as { signed_url: string };
  return signed_url;
}

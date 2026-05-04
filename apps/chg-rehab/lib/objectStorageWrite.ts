/**
 * Server-side helper to write a private object directly (bypassing the
 * browser PUT flow). Used to persist generated artifacts like subscription
 * receipt PDFs, K-1 zips, etc. Returns the public-style `/objects/...`
 * path that downstream signing helpers (`getPrivateFile`, `getSignedDownloadUrl`)
 * already understand.
 */
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { getPrivateObjectDir } from "./objectStorage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.slice(1).split("/");
  if (parts.length < 2) throw new Error(`Invalid object path: ${path}`);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

/**
 * Write a buffer as a private object under `${PRIVATE_OBJECT_DIR}/<subdir>/<uuid><ext>`.
 * Returns the canonical `/objects/<subdir>/<uuid><ext>` path.
 */
export async function putPrivateObject(
  buf: Buffer | Uint8Array,
  opts: { subdir: string; ext?: string; contentType?: string }
): Promise<string> {
  const id = randomUUID();
  const ext = opts.ext ? (opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`) : "";
  const sub = `${opts.subdir.replace(/^\/+|\/+$/g, "")}/${id}${ext}`;
  const fullPath = `${getPrivateObjectDir()}/${sub}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const file = storageClient.bucket(bucketName).file(objectName);
  await file.save(Buffer.isBuffer(buf) ? buf : Buffer.from(buf), {
    contentType: opts.contentType || "application/octet-stream",
    resumable: false,
  });
  return `/objects/${sub}`;
}

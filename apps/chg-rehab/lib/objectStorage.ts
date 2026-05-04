/**
 * Replit Object Storage helper. Uses the Replit-side credential proxy
 * (no manual GCP creds needed) by hitting the local sidecar for tokens.
 */
import { Storage, File } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

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

export class ObjectNotFoundError extends Error {
  constructor(message = "Object not found") {
    super(message);
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.slice(1).split("/");
  if (parts.length < 2) throw new Error(`Invalid object path: ${path}`);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

export function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR is not set. Configure object storage in .replit."
    );
  }
  return dir;
}

export function getPublicObjectSearchPaths(): string[] {
  const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Sign a URL via the Replit sidecar (works with the federated credentials). */
async function signObjectUrl(opts: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const res = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: opts.bucketName,
      object_name: opts.objectName,
      method: opts.method,
      expires_at: new Date(Date.now() + opts.ttlSec * 1000).toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to sign object URL: ${res.status} ${await res.text()}`);
  }
  const { signed_url } = await res.json();
  return signed_url as string;
}

/** Returns a presigned PUT URL for a brand-new private object. */
export async function getUploadUrl(): Promise<{ uploadUrl: string; objectPath: string }> {
  const privateDir = getPrivateObjectDir();
  const id = randomUUID();
  const fullPath = `${privateDir}/uploads/${id}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const uploadUrl = await signObjectUrl({
    bucketName,
    objectName,
    method: "PUT",
    ttlSec: 900,
  });
  return { uploadUrl, objectPath: `/objects/uploads/${id}` };
}

/** Look up a private object file by the path returned from getUploadUrl. */
export async function getPrivateFile(objectPath: string): Promise<File> {
  if (!objectPath.startsWith("/objects/")) {
    throw new ObjectNotFoundError();
  }
  const sub = objectPath.slice("/objects/".length);
  const fullPath = `${getPrivateObjectDir()}/${sub}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const file = storageClient.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new ObjectNotFoundError();
  return file;
}

/** Look up a public asset by its relative path within any public search path. */
export async function getPublicFile(filePath: string): Promise<File | null> {
  for (const root of getPublicObjectSearchPaths()) {
    const full = `${root}/${filePath}`;
    const { bucketName, objectName } = parsePath(full);
    const file = storageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (exists) return file;
  }
  return null;
}

/**
 * Probe the configured bucket to verify object storage is actually reachable.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 *
 * The GCS call is wrapped in a Promise.race with a configurable timeout
 * (default 3 s, override via OBJECT_STORAGE_HEALTH_TIMEOUT_MS) so a hung
 * sidecar never blocks the /api/health endpoint indefinitely.
 */
export async function checkObjectStorageHealth(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) {
    return { ok: false, error: "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set" };
  }

  const rawTimeout = Number(process.env.OBJECT_STORAGE_HEALTH_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 3000;

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error("health check timed out")),
      timeoutMs
    );
    timerId.unref?.();
  });

  try {
    const [exists] = await Promise.race([
      storageClient.bucket(bucketName).exists().finally(() => {
        if (timerId !== undefined) clearTimeout(timerId);
      }),
      timeoutPromise,
    ]);
    if (!exists) {
      return { ok: false, error: `Bucket "${bucketName}" does not exist or is inaccessible` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Stream a file to an HTTP Response. */
export async function streamFile(file: File): Promise<Response> {
  const [meta] = await file.getMetadata();
  const stream = file.createReadStream();
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
  return new Response(webStream as any, {
    headers: {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Content-Length": String(meta.size ?? ""),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

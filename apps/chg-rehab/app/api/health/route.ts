import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUnsubscribeLinkDiagnostic } from "@/lib/contactUnsubscribe";

export const dynamic = "force-dynamic";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/**
 * Probe Replit's object storage sidecar to verify reachability. Returns ok=true
 * when the sidecar responds with any successful HTTP status, ok=false with an
 * error description otherwise. When the bucket ID env var is absent the probe
 * is skipped and storage is reported as not configured.
 */
async function probeObjectStorage(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch(`${SIDECAR_ENDPOINT}/credential`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `sidecar_${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "connection_refused";
    return { ok: false, error: message };
  }
}

export async function GET() {
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const unsubscribeDiag = getUnsubscribeLinkDiagnostic();
  const storageCheck = await probeObjectStorage();
  const healthy = dbOk && unsubscribeDiag.ok;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbOk ? "up" : "down",
        ...(dbError ? { databaseError: dbError } : {}),
        objectStorage: storageCheck.ok ? "reachable" : "unreachable",
        ...(storageCheck.error ? { objectStorageError: storageCheck.error } : {}),
        replitAuth: process.env.REPL_ID ? "configured" : "missing",
        unsubscribeLinks: unsubscribeDiag.ok ? "ok" : "missing",
        ...(unsubscribeDiag.reason ? { unsubscribeLinksReason: unsubscribeDiag.reason } : {}),
      },
    },
    { status: healthy ? 200 : 503 }
  );
}

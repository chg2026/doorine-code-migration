// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) },
}));

vi.mock("@/lib/contactUnsubscribe", () => ({
  getUnsubscribeLinkDiagnostic: vi.fn(() => ({ ok: true })),
}));

import { prisma } from "@/lib/prisma";
import { getUnsubscribeLinkDiagnostic } from "@/lib/contactUnsubscribe";
import { GET } from "./route";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockDiagnostic = vi.mocked(getUnsubscribeLinkDiagnostic);

// We stub fetch so the probeObjectStorage function (which pings the sidecar
// via HTTP) can be controlled without a real sidecar running in tests.
const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);

  // Defaults: everything healthy
  mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
  mockDiagnostic.mockReturnValue({ ok: true });
  // Simulate sidecar responding OK.
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }) as Response);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Healthy baseline
// ---------------------------------------------------------------------------
describe("GET /api/health — healthy baseline", () => {
  it("returns 200 with status:ok when database and unsubscribe links are fine", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.services.database).toBe("up");
    expect(body.services.unsubscribeLinks).toBe("ok");
  });

  it("includes a timestamp and uptime in the response body", async () => {
    const before = Date.now();
    const res = await GET();
    const after = Date.now();

    const body = await res.json();
    const ts = new Date(body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Database failure → 503
// ---------------------------------------------------------------------------
describe("GET /api/health — database failure", () => {
  it("returns 503 with status:degraded when the database query throws", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("down");
    expect(body.services.databaseError).toBe("connection refused");
  });

  it("does not expose internal stack frames in the error message", async () => {
    const err = new Error("ECONNRESET");
    mockQueryRaw.mockRejectedValue(err);

    const body = await (await GET()).json();

    // databaseError should be the message string, not a full stack trace.
    expect(body.services.databaseError).toBe("ECONNRESET");
    expect(body.services.databaseError).not.toContain("at Object.");
  });
});

// ---------------------------------------------------------------------------
// Unsubscribe links missing → 503
// ---------------------------------------------------------------------------
describe("GET /api/health — unsubscribe link configuration missing", () => {
  it("returns 503 when unsubscribe link diagnostic reports not ok", async () => {
    mockDiagnostic.mockReturnValue({
      ok: false,
      reason: "UNSUBSCRIBE_BASE_URL not set",
    });

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.unsubscribeLinks).toBe("missing");
    expect(body.services.unsubscribeLinksReason).toBe("UNSUBSCRIBE_BASE_URL not set");
  });

  it("includes unsubscribeLinksReason only when a reason is provided", async () => {
    mockDiagnostic.mockReturnValue({ ok: false });

    const body = await (await GET()).json();

    expect(body.status).toBe("degraded");
    expect("unsubscribeLinksReason" in body.services).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Object storage probe — informational only (does NOT affect HTTP status)
// ---------------------------------------------------------------------------
describe("GET /api/health — object storage probe", () => {
  it("reports objectStorage:reachable when the sidecar responds 200", async () => {
    // Set the env var so probeObjectStorage doesn't skip early.
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "test-bucket");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }) as Response);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services.objectStorage).toBe("reachable");
    expect("objectStorageError" in body.services).toBe(false);
  });

  it("reports objectStorage:unreachable but still returns 200 when sidecar fetch throws", async () => {
    // The health check must remain green for monitoring even when object
    // storage is temporarily unreachable — app functionality continues. The
    // storage status is surfaced so operators can investigate separately.
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "test-bucket");
    fetchMock.mockRejectedValue(new Error("connection_refused"));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.services.objectStorage).toBe("unreachable");
    expect(body.services.objectStorageError).toBe("connection_refused");
  });

  it("reports objectStorage:unreachable when sidecar returns non-OK status", async () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "test-bucket");
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }) as Response);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services.objectStorage).toBe("unreachable");
    expect(body.services.objectStorageError).toBe("sidecar_502");
  });

  it("reports storage unreachable AND 503 when DB is also down (compound failure)", async () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "test-bucket");
    mockQueryRaw.mockRejectedValue(new Error("DB gone"));
    fetchMock.mockRejectedValue(new Error("sidecar down"));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("down");
    expect(body.services.objectStorage).toBe("unreachable");
  });

  it("skips the sidecar probe and reports not_configured when the bucket env var is absent", async () => {
    // Ensure the env var is not set.
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "");

    const res = await GET();

    // Fetch must NOT have been called because there's no bucket to probe.
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.services.objectStorage).toBe("unreachable");
    expect(body.services.objectStorageError).toBe("not_configured");
  });
});

// ---------------------------------------------------------------------------
// Both DB and unsubscribe failing
// ---------------------------------------------------------------------------
describe("GET /api/health — compound failures", () => {
  it("returns 503 and lists all degraded services when both DB and unsubscribe fail", async () => {
    mockQueryRaw.mockRejectedValue(new Error("timeout"));
    mockDiagnostic.mockReturnValue({ ok: false, reason: "missing env" });

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("down");
    expect(body.services.unsubscribeLinks).toBe("missing");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/session";
import type { StaleAlertSummary } from "@/lib/notifications/sweep";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
  publicOrigin: vi.fn(() => "http://test.example.com"),
}));

vi.mock("@/lib/notifications/sweep", () => ({
  runNotificationSweep: vi.fn(),
  evaluateStaleSweepAlerts: vi.fn(),
  getStaleAlertConfig: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  evaluateStaleSweepAlerts,
  getStaleAlertConfig,
  runNotificationSweep,
} from "@/lib/notifications/sweep";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockRunSweep = vi.mocked(runNotificationSweep);
const mockEvaluateStale = vi.mocked(evaluateStaleSweepAlerts);
const mockGetStaleConfig = vi.mocked(getStaleAlertConfig);
const mockFindUnique = vi.mocked(prisma.notificationState.findUnique);
const mockUpsert = vi.mocked(prisma.notificationState.upsert);

function makeRequest(): NextRequest {
  return new NextRequest(
    "http://test.example.com/api/admin/notifications/run-sweep",
    { method: "POST", headers: { host: "test.example.com" } }
  );
}

function adminUser(companyId: string, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: `u-${companyId}`,
    companyId,
    role: "Admin",
    email: `admin@${companyId}.test`,
    firstName: "Admin",
    lastName: "User",
    ...overrides,
  };
}

const emptyStaleSummary: StaleAlertSummary = {
  thresholdMs: 60 * 60 * 1000,
  throttleMs: 6 * 60 * 60 * 1000,
  evaluated: 0,
  staleCompanies: 0,
  alertedCompanies: 0,
  emailsAttempted: 0,
  emailsDelivered: 0,
  results: [],
};

function defaultStateAndConfig() {
  // The route narrows this with a `select`, but the broad mocked signature
  // expects the full row — so populate every column.
  mockFindUnique.mockResolvedValue({
    id: "ns-test",
    companyId: "co-test",
    updatedAt: new Date("2026-04-30T12:00:00Z"),
    lastDigestSweepAt: new Date("2026-04-30T12:00:00Z"),
    lastSweepAttemptAt: new Date("2026-04-30T12:00:00Z"),
    lastLapseSweepAt: null,
    lastStaleAlertAt: null,
    lastWeeklyAlertRecapAt: null,
    lastManualSweepAt: null,
    lastManualSweepByUserId: null,
    lastManualSweepByName: null,
  });
  mockGetStaleConfig.mockResolvedValue({
    thresholdMs: 60 * 60 * 1000,
    throttleMs: 6 * 60 * 60 * 1000,
  });
}

describe("POST /api/admin/notifications/run-sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultStateAndConfig();
    mockRunSweep.mockResolvedValue({ ran: true });
    mockEvaluateStale.mockResolvedValue(emptyStaleSummary);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers with 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockRunSweep).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers with 403", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser("co-pm", { role: "PM" }));

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
    expect(mockRunSweep).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
  });

  it("invokes runNotificationSweep with force:true for the caller's company", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser("co-admin-ok"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockRunSweep).toHaveBeenCalledTimes(1);
    expect(mockRunSweep).toHaveBeenCalledWith("co-admin-ok", { force: true });

    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledWith({
      baseUrl: "http://test.example.com",
      companyIds: ["co-admin-ok"],
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sweepError).toBeNull();
    expect(body.staleAlertError).toBeNull();
    expect(body.manualThrottleMs).toBe(10_000);
  });

  it("records who triggered the manual run via notificationState.upsert", async () => {
    const user = adminUser("co-record", {
      id: "u-record",
      firstName: "Jane",
      lastName: "Smith",
    });
    mockGetCurrentUser.mockResolvedValue(user);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "co-record" },
        create: expect.objectContaining({
          companyId: "co-record",
          lastManualSweepByUserId: "u-record",
          lastManualSweepByName: "Jane Smith",
        }),
        update: expect.objectContaining({
          lastManualSweepByUserId: "u-record",
          lastManualSweepByName: "Jane Smith",
        }),
      })
    );
  });

  it("returns 429 with retryAfterMs on a second call within the throttle window", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser("co-throttle"));

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);
    expect(mockRunSweep).toHaveBeenCalledTimes(1);

    const second = await POST(makeRequest());
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).not.toBeNull();

    const body = await second.json();
    expect(body.error).toMatch(/wait/i);
    expect(typeof body.retryAfterMs).toBe("number");
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(10_000);

    // Throttled call must not invoke the sweep or stale-monitor again.
    expect(mockRunSweep).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with sweepError populated when the sweep throws", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser("co-sweep-err"));
    mockRunSweep.mockRejectedValue(new Error("DB exploded"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.sweepError).toBe("DB exploded");
    // The watchdog still runs even when the sweep failed, so the response
    // can carry a fresh staleAlertError state too.
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("does not mask a successful sweep when evaluateStaleSweepAlerts fails", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser("co-stale-err"));
    mockEvaluateStale.mockRejectedValue(new Error("watchdog blew up"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sweepError).toBeNull();
    expect(body.staleAlertError).toBe("watchdog blew up");

    expect(mockRunSweep).toHaveBeenCalledTimes(1);
    expect(mockRunSweep).toHaveBeenCalledWith("co-stale-err", { force: true });

    consoleSpy.mockRestore();
  });
});

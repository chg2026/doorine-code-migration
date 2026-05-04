import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type {
  StaleAlertSummary,
  WeeklyRecapSummary,
} from "@/lib/notifications/sweep";

vi.mock("@/lib/auth", () => ({
  publicOrigin: vi.fn(() => "http://test.example.com"),
}));

vi.mock("@/lib/notifications/sweep", () => ({
  runNotificationSweepForAllCompanies: vi.fn(),
  evaluateStaleSweepAlerts: vi.fn(),
  sendWeeklyOutageRecap: vi.fn(),
  sweepBillingRemindersForAllCompanies: vi.fn(),
}));

import { GET, POST } from "./route";
import {
  evaluateStaleSweepAlerts,
  runNotificationSweepForAllCompanies,
  sendWeeklyOutageRecap,
  sweepBillingRemindersForAllCompanies,
} from "@/lib/notifications/sweep";

const mockRunAll = vi.mocked(runNotificationSweepForAllCompanies);
const mockEvaluateStale = vi.mocked(evaluateStaleSweepAlerts);
const mockWeeklyRecap = vi.mocked(sendWeeklyOutageRecap);
const mockBillingReminders = vi.mocked(sweepBillingRemindersForAllCompanies);

const TEST_SECRET = "super-secret-cron-token";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://test.example.com/api/cron/notifications-sweep", {
    method: "POST",
    headers: { host: "test.example.com", ...headers },
  });
}

const successfulSweep = {
  startedAt: "2026-04-30T12:00:00.000Z",
  finishedAt: "2026-04-30T12:00:01.000Z",
  durationMs: 1000,
  totalCompanies: 3,
  skippedCompanies: 0,
  results: [
    { companyId: "co-a", ran: true, emailsSent: 2, emailsFailed: 0 },
    { companyId: "co-b", ran: false, error: "boom" },
    { companyId: "co-c", ran: true, emailsSent: 1, emailsFailed: 0 },
  ],
};

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

const emptyWeeklyRecap: WeeklyRecapSummary = {
  windowMs: 7 * 24 * 60 * 60 * 1000,
  throttleMs: 7 * 24 * 60 * 60 * 1000,
  evaluated: 0,
  sentCompanies: 0,
  emailsAttempted: 0,
  emailsDelivered: 0,
  results: [],
};

describe("/api/cron/notifications-sweep", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
    mockRunAll.mockResolvedValue(successfulSweep);
    mockEvaluateStale.mockResolvedValue(emptyStaleSummary);
    mockWeeklyRecap.mockResolvedValue(emptyWeeklyRecap);
    mockBillingReminders.mockResolvedValue({ evaluated: 0, reminded: 0, results: [] });
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/CRON_SECRET/);
    expect(mockRunAll).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
    expect(mockWeeklyRecap).not.toHaveBeenCalled();
  });

  it("rejects requests with no auth header (401)", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockRunAll).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
    expect(mockWeeklyRecap).not.toHaveBeenCalled();
  });

  it("rejects requests with an incorrect Bearer token (401)", async () => {
    const res = await POST(
      makeRequest({ authorization: "Bearer not-the-real-secret" })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockRunAll).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
    expect(mockWeeklyRecap).not.toHaveBeenCalled();
  });

  it("rejects requests with an incorrect x-cron-secret header (401)", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "wrong-secret" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockRunAll).not.toHaveBeenCalled();
    expect(mockEvaluateStale).not.toHaveBeenCalled();
  });

  it("accepts a valid Bearer token and runs the sweep then the watchdog", async () => {
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(200);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledWith({
      baseUrl: "http://test.example.com",
    });
    expect(mockWeeklyRecap).toHaveBeenCalledTimes(1);

    // Order matters: sweep must complete before the watchdog runs so the
    // watchdog observes the freshest `lastDigestSweepAt` values.
    const sweepOrder = mockRunAll.mock.invocationCallOrder[0];
    const staleOrder = mockEvaluateStale.mock.invocationCallOrder[0];
    expect(sweepOrder).toBeLessThan(staleOrder);

    const body = await res.json();
    expect(body.totalCompanies).toBe(3);
    expect(body.skippedCompanies).toBe(0);
    expect(body.results).toHaveLength(3);
    expect(body.staleAlerts).toEqual(emptyStaleSummary);
    expect(body.weeklyRecap).toEqual(emptyWeeklyRecap);
  });

  it("accepts a valid x-cron-secret header", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": TEST_SECRET }));

    expect(res.status).toBe(200);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
    expect(mockWeeklyRecap).toHaveBeenCalledTimes(1);
  });

  it("supports GET as an alias for POST", async () => {
    const req = new NextRequest(
      "http://test.example.com/api/cron/notifications-sweep",
      { method: "GET", headers: { authorization: `Bearer ${TEST_SECRET}` } }
    );

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
  });

  it("returns the per-company error rows so one bad tenant does not hide the rest", async () => {
    // `runNotificationSweepForAllCompanies` already swallows per-company
    // failures internally — verify the route surfaces the resulting summary
    // (with the failed row alongside the successful ones) instead of
    // bailing out.
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const failed = body.results.filter((r: { error?: string }) => r.error);
    const succeeded = body.results.filter((r: { ran: boolean }) => r.ran);
    expect(failed).toHaveLength(1);
    expect(failed[0].companyId).toBe("co-b");
    expect(succeeded).toHaveLength(2);
    expect(succeeded.map((r: { companyId: string }) => r.companyId)).toEqual([
      "co-a",
      "co-c",
    ]);
  });

  it("still returns the sweep summary when the watchdog throws", async () => {
    mockEvaluateStale.mockRejectedValue(new Error("watchdog blew up"));

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(200);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.totalCompanies).toBe(3);
    expect(body.results).toHaveLength(3);
    expect(body.staleAlerts).toEqual({ error: "watchdog blew up" });
    // Weekly recap is isolated from the watchdog and must still run.
    expect(mockWeeklyRecap).toHaveBeenCalledTimes(1);
    expect(body.weeklyRecap).toEqual(emptyWeeklyRecap);
  });

  it("still returns the sweep summary when the weekly recap throws", async () => {
    mockWeeklyRecap.mockRejectedValue(new Error("recap exploded"));

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCompanies).toBe(3);
    expect(body.staleAlerts).toEqual(emptyStaleSummary);
    expect(body.weeklyRecap).toEqual({ error: "recap exploded" });
  });

  it("returns 500 when the sweep throws but still runs the watchdog and weekly recap", async () => {
    mockRunAll.mockRejectedValue(new Error("DB exploded"));

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    // The sweep error is surfaced so monitoring tools can detect the failure.
    expect(body.error).toBe("DB exploded");
    // The watchdog must still fire — a repeated sweep crash is exactly the
    // outage scenario where admins most need the alert email.
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledWith({
      baseUrl: "http://test.example.com",
    });
    // The weekly recap must also still run for the same reason.
    expect(mockWeeklyRecap).toHaveBeenCalledTimes(1);
    // Both downstream results are included in the 500 response body.
    expect(body.staleAlerts).toEqual(emptyStaleSummary);
    expect(body.weeklyRecap).toEqual(emptyWeeklyRecap);
  });

  it("still runs billing reminders even when the main notification sweep throws", async () => {
    mockRunAll.mockRejectedValue(new Error("sweep DB exploded"));
    const billingReminderSummary = {
      startedAt: "2026-04-30T12:00:00.000Z",
      finishedAt: "2026-04-30T12:00:00.100Z",
      durationMs: 100,
      evaluated: 2,
      reminded: 1,
      results: [
        { companyId: "co-past-due", status: "past_due", reminded: true, recipients: 1, emailsSent: 1, emailsFailed: 0 },
        { companyId: "co-ok", status: "active", reminded: false, skippedReason: "no_initial_alert" },
      ],
    };
    mockBillingReminders.mockResolvedValue(billingReminderSummary);

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    // The sweep failure surfaces as 500, but billing reminders must have run.
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("sweep DB exploded");

    // Billing reminders are isolated from the sweep — they must always fire
    // so overdue admins still get their daily nudge even during an outage.
    expect(mockBillingReminders).toHaveBeenCalledTimes(1);
    expect(body.billingReminders).toEqual(billingReminderSummary);
  });

  it("includes billingReminders error in the response when billing reminders throw", async () => {
    mockBillingReminders.mockRejectedValue(new Error("reminder DB down"));

    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` })
    );

    // A billing reminder failure must not cause the sweep to report failure.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCompanies).toBe(3);
    expect(body.billingReminders).toEqual({ error: "reminder DB down" });

    // The sweep and watchdog must still complete normally.
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockEvaluateStale).toHaveBeenCalledTimes(1);
  });
});

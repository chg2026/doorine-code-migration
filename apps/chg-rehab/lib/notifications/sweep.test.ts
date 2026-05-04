import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    company: { findMany: vi.fn() },
    staleSweepAlertLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    notificationState: { upsert: vi.fn() },
  },
}));
vi.mock("../companySettings", () => ({
  getCompanySettings: vi.fn(),
  invalidateCompanySettingsCache: vi.fn(),
}));
vi.mock("../outboundEmail", () => ({
  isOutboundEmailConfigured: vi.fn(),
  sendOutboundEmail: vi.fn(),
}));

import { sendWeeklyOutageRecap, WEEKLY_RECAP_THROTTLE_MS } from "./sweep";
import { prisma } from "../prisma";
import { getCompanySettings } from "../companySettings";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";

const mockCompanyFindMany = vi.mocked(prisma.company.findMany);
const mockLogFindMany = vi.mocked(prisma.staleSweepAlertLog.findMany);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockStateUpsert = vi.mocked(prisma.notificationState.upsert);
const mockSettings = vi.mocked(getCompanySettings);
const mockEmailConfigured = vi.mocked(isOutboundEmailConfigured);
const mockSendEmail = vi.mocked(sendOutboundEmail);

const NOW = new Date("2026-04-30T12:00:00Z");

function company(
  id: string,
  overrides: { lastWeeklyAlertRecapAt?: Date | null; subscriptionStatus?: string | null } = {}
) {
  return {
    id,
    name: id.toUpperCase(),
    subscription:
      overrides.subscriptionStatus === undefined
        ? null
        : overrides.subscriptionStatus === null
          ? null
          : { status: overrides.subscriptionStatus },
    notificationState:
      overrides.lastWeeklyAlertRecapAt === undefined
        ? { lastWeeklyAlertRecapAt: null }
        : { lastWeeklyAlertRecapAt: overrides.lastWeeklyAlertRecapAt },
  };
}

function logRow(daysAgo: number, opts: { delivered?: number; failed?: number; staleForMs?: number | null } = {}) {
  return {
    sentAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    staleForMs: opts.staleForMs ?? 90 * 60 * 1000,
    deliveredCount: opts.delivered ?? 1,
    failedCount: opts.failed ?? 0,
    recipientCount: (opts.delivered ?? 1) + (opts.failed ?? 0),
  };
}

describe("sendWeeklyOutageRecap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-1" });
    // NOW = 2026-04-30 = Thursday (America/New_York). Pin the default recap
    // weekday so tests that need to reach the send path aren't gated by the
    // weekday check. Individual tests override this when they want to exercise
    // the wrong_weekday branch.
    mockSettings.mockResolvedValue({
      meta: { notifyWeeklyAlertRecapWeekday: "Thursday" },
      timezone: "America/New_York",
    } as never);
    mockUserFindMany.mockResolvedValue([{ email: "admin@example.com" } as never]);
    mockStateUpsert.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips companies with zero alerts in the window", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-quiet")] as never);
    mockLogFindMany.mockResolvedValue([] as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.sentCompanies).toBe(0);
    expect(summary.results[0]).toMatchObject({
      companyId: "co-quiet",
      sent: false,
      reason: "no_alerts",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStateUpsert).not.toHaveBeenCalled();
  });

  it("skips companies whose admins opted out", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-opted")] as never);
    mockSettings.mockResolvedValue({
      meta: { notifyWeeklyAlertRecapDisabled: true },
    } as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.results[0]).toMatchObject({
      companyId: "co-opted",
      sent: false,
      reason: "opted_out",
    });
    // Opt-out is checked before we touch the alert log table, to keep
    // disabled tenants out of the per-tick query budget entirely.
    expect(mockLogFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("emails admins with totals and longest staleness, then stamps throttle", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-noisy")] as never);
    mockLogFindMany.mockResolvedValue([
      logRow(1, { delivered: 2, failed: 0, staleForMs: 30 * 60 * 1000 }),
      logRow(3, { delivered: 1, failed: 1, staleForMs: 4 * 60 * 60 * 1000 }),
      logRow(5, { delivered: 0, failed: 2, staleForMs: 90 * 60 * 1000 }),
    ] as never);
    mockUserFindMany.mockResolvedValue([
      { email: "a@example.com" },
      { email: "b@example.com" },
    ] as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW, baseUrl: "https://app.test" });

    expect(summary.sentCompanies).toBe(1);
    expect(summary.emailsAttempted).toBe(2);
    expect(summary.emailsDelivered).toBe(2);

    const result = summary.results[0];
    expect(result).toMatchObject({
      companyId: "co-noisy",
      sent: true,
      alertCount: 3,
      deliveredAlerts: 3,
      failedAlerts: 3,
      longestStaleForMs: 4 * 60 * 60 * 1000,
      recipients: 2,
      delivered: 2,
      failed: 0,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const firstCall = mockSendEmail.mock.calls[0][0];
    expect(firstCall.to).toBe("a@example.com");
    expect(firstCall.subject).toContain("CO-NOISY");
    expect(firstCall.subject).toContain("3 alert");
    expect(firstCall.text).toContain("Alerts fired:     3");
    expect(firstCall.text).toContain("Emails delivered: 3");
    expect(firstCall.text).toContain("Emails failed:    3");
    expect(firstCall.text).toContain("Longest staleness: 4 hours");
    expect(firstCall.text).toContain("https://app.test/admin?panel=notifications");

    expect(mockStateUpsert).toHaveBeenCalledTimes(1);
    expect(mockStateUpsert.mock.calls[0][0]).toMatchObject({
      where: { companyId: "co-noisy" },
      update: { lastWeeklyAlertRecapAt: NOW },
    });
  });

  it("skips companies whose last recap was within the throttle window", async () => {
    mockCompanyFindMany.mockResolvedValue([
      company("co-recent", {
        lastWeeklyAlertRecapAt: new Date(NOW.getTime() - 2 * 86_400_000),
      }),
    ] as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.results[0]).toMatchObject({
      companyId: "co-recent",
      sent: false,
      reason: "throttled",
    });
    expect(mockLogFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips companies when today does not match the configured recap weekday", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-wrongday")] as never);
    // NOW = Thursday; configure Monday so the gate fires.
    mockSettings.mockResolvedValue({
      meta: { notifyWeeklyAlertRecapWeekday: "Monday" },
      timezone: "America/New_York",
    } as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.sentCompanies).toBe(0);
    expect(summary.results[0]).toMatchObject({
      companyId: "co-wrongday",
      sent: false,
      reason: "wrong_weekday",
    });
    expect(mockLogFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("defaults the recap weekday to Monday when unset and skips when today is not Monday", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-default-day")] as never);
    // No weekday in meta → defaults to Monday; NOW is Thursday → should skip.
    mockSettings.mockResolvedValue({
      meta: {},
      timezone: "America/New_York",
    } as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.results[0]).toMatchObject({
      companyId: "co-default-day",
      sent: false,
      reason: "wrong_weekday",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips companies on canceled subscriptions", async () => {
    mockCompanyFindMany.mockResolvedValue([
      company("co-cancelled", { subscriptionStatus: "canceled" }),
    ] as never);

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.evaluated).toBe(0);
    expect(summary.results).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not stamp throttle when every send fails", async () => {
    mockCompanyFindMany.mockResolvedValue([company("co-flaky")] as never);
    mockLogFindMany.mockResolvedValue([logRow(1)] as never);
    mockSendEmail.mockResolvedValue({ delivered: false, reason: "transport_error" });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.sentCompanies).toBe(0);
    expect(summary.results[0]).toMatchObject({
      companyId: "co-flaky",
      sent: false,
      reason: "send_failed",
      delivered: 0,
      failed: 1,
    });
    expect(mockStateUpsert).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("reports provider_not_configured without sending when transport is unavailable", async () => {
    mockEmailConfigured.mockReturnValue(false);
    mockCompanyFindMany.mockResolvedValue([company("co-noprovider")] as never);
    mockLogFindMany.mockResolvedValue([logRow(2)] as never);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const summary = await sendWeeklyOutageRecap({ now: NOW });

    expect(summary.sentCompanies).toBe(0);
    expect(summary.results[0]).toMatchObject({
      companyId: "co-noprovider",
      sent: false,
      reason: "provider_not_configured",
      alertCount: 1,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("WEEKLY_RECAP_THROTTLE_MS sits just under one week", () => {
    // Sanity guard: cron runs every 15 min, so the throttle must be
    // strictly less than 7 days (so the next scheduled tick after the
    // 7-day mark actually sends) but close enough to never double-send
    // within a single calendar week.
    expect(WEEKLY_RECAP_THROTTLE_MS).toBeLessThan(7 * 24 * 60 * 60 * 1000);
    expect(WEEKLY_RECAP_THROTTLE_MS).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });
});

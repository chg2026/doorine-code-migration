import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    company: { findUnique: vi.fn() },
    notification: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("../outboundEmail", () => ({
  isOutboundEmailConfigured: vi.fn(),
  sendOutboundEmail: vi.fn(),
}));

vi.mock("../contactUnsubscribe", () => ({
  publicAppOrigin: () => "https://app.test",
}));

import {
  notifyAdminsOfBillingIssue,
  notifyAdminsOfBillingRecovery,
  isUnhealthyStatus,
  isHealthyStatus,
} from "./billing";
import { prisma } from "../prisma";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";

const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockCompanyFindUnique = vi.mocked(prisma.company.findUnique);
const mockNotificationUpsert = vi.mocked(prisma.notification.upsert);
const mockNotificationFindUnique = vi.mocked(prisma.notification.findUnique);
const mockEmailConfigured = vi.mocked(isOutboundEmailConfigured);
const mockSendEmail = vi.mocked(sendOutboundEmail);

const NOW = new Date("2026-04-30T12:00:00Z");

function adminUser(overrides: {
  id?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailOptOut?: boolean;
} = {}) {
  return {
    id: overrides.id ?? "u-admin-1",
    email: overrides.email !== undefined ? overrides.email : "admin@test.example.com",
    firstName: overrides.firstName !== undefined ? overrides.firstName : "Admin",
    lastName: overrides.lastName !== undefined ? overrides.lastName : "User",
    emailOptOut: overrides.emailOptOut ?? false,
  };
}

describe("isUnhealthyStatus / isHealthyStatus", () => {
  it("classifies each unhealthy status correctly", () => {
    for (const s of ["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"]) {
      expect(isUnhealthyStatus(s)).toBe(true);
      expect(isHealthyStatus(s)).toBe(false);
    }
  });

  it("classifies each healthy status correctly", () => {
    for (const s of ["active", "trialing"]) {
      expect(isHealthyStatus(s)).toBe(true);
      expect(isUnhealthyStatus(s)).toBe(false);
    }
  });

  it("handles null / undefined gracefully", () => {
    expect(isUnhealthyStatus(null)).toBe(false);
    expect(isUnhealthyStatus(undefined)).toBe(false);
    expect(isHealthyStatus(null)).toBe(false);
    expect(isHealthyStatus(undefined)).toBe(false);
  });
});

describe("notifyAdminsOfBillingIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-ok" });
    mockCompanyFindUnique.mockResolvedValue({ name: "Acme Corp" } as never);
    mockNotificationUpsert.mockResolvedValue({} as never);
    mockNotificationFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns skippedReason=status_not_unhealthy for a healthy status", async () => {
    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "active",
      now: NOW,
    });

    expect(result.skippedReason).toBe("status_not_unhealthy");
    expect(result.recipients).toBe(0);
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("fans out to all admins: creates one in-app row and sends one email per admin", async () => {
    const admins = [
      adminUser({ id: "u-a1", email: "a1@test.example.com" }),
      adminUser({ id: "u-a2", email: "a2@test.example.com" }),
      adminUser({ id: "u-a3", email: "a3@test.example.com" }),
    ];
    mockUserFindMany.mockResolvedValue(admins as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      dedupeBucket: "inv-001",
      now: NOW,
    });

    expect(result.recipients).toBe(3);
    expect(result.inAppCreated).toBe(3);
    expect(result.emailsSent).toBe(3);
    expect(result.emailsFailed).toBe(0);

    expect(mockNotificationUpsert).toHaveBeenCalledTimes(6);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    const toAddresses = mockSendEmail.mock.calls.map((c) => c[0].to).sort();
    expect(toAddresses).toEqual([
      "a1@test.example.com",
      "a2@test.example.com",
      "a3@test.example.com",
    ]);

    const firstSubject = mockSendEmail.mock.calls[0][0].subject as string;
    expect(firstSubject).toContain("Acme Corp");
    expect(firstSubject).toContain("action required");
  });

  it("does NOT re-email when the same status + bucket is delivered a second time (idempotent webhook)", async () => {
    const admin = adminUser({ id: "u-b1", email: "b1@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    mockNotificationFindUnique.mockResolvedValue({ status: "Sent" } as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      dedupeBucket: "inv-002",
      now: NOW,
    });

    expect(result.inAppCreated).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.emailsFailed).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends email on the first delivery but skips it on a subsequent delivery with the same dedupe key", async () => {
    const admin = adminUser({ id: "u-c1", email: "c1@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    mockNotificationFindUnique.mockResolvedValueOnce(null);

    await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      dedupeBucket: "inv-003",
      now: NOW,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    mockNotificationFindUnique.mockResolvedValueOnce({ status: "Sent" } as never);

    const second = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      dedupeBucket: "inv-003",
      now: NOW,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(second.emailsSent).toBe(0);
  });

  it("still creates the in-app row for an admin with no email address, but skips the email send", async () => {
    const adminNoEmail = adminUser({ id: "u-noemail", email: null });
    const adminWithEmail = adminUser({ id: "u-hasemail", email: "has@test.example.com" });
    mockUserFindMany.mockResolvedValue([adminNoEmail, adminWithEmail] as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "unpaid",
      now: NOW,
    });

    expect(result.recipients).toBe(2);
    expect(result.inAppCreated).toBe(2);
    expect(result.emailsSent).toBe(1);

    const toAddresses = mockSendEmail.mock.calls.map((c) => c[0].to);
    expect(toAddresses).not.toContain(null);
    expect(toAddresses).toContain("has@test.example.com");
  });

  it("emailOptOut admins still get the in-app row but no email is sent", async () => {
    const adminOptedOut = adminUser({ id: "u-optout", email: "optout@test.example.com", emailOptOut: true });
    const adminNormal = adminUser({ id: "u-normal", email: "normal@test.example.com", emailOptOut: false });
    mockUserFindMany.mockResolvedValue([adminOptedOut, adminNormal] as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      now: NOW,
    });

    expect(result.recipients).toBe(2);
    expect(result.inAppCreated).toBe(2);
    expect(result.emailsSent).toBe(1);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe("normal@test.example.com");
  });

  it("logs a warning but does not throw when the outbound transport is not configured", async () => {
    mockEmailConfigured.mockReturnValue(false);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const admin = adminUser({ id: "u-notransport", email: "notransport@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "canceled",
      now: NOW,
    });

    expect(result.inAppCreated).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("outbound transport not configured"),
    );

    infoSpy.mockRestore();
  });

  it("returns skippedReason=no_admins when the company has no admin users", async () => {
    mockUserFindMany.mockResolvedValue([] as never);

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-empty",
      status: "past_due",
      now: NOW,
    });

    expect(result.skippedReason).toBe("no_admins");
    expect(result.recipients).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("records emailsFailed when the transport returns delivered=false", async () => {
    const admin = adminUser({ id: "u-bounce", email: "bounce@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);
    mockSendEmail.mockResolvedValue({ delivered: false, reason: "smtp_bounce" });

    const result = await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      now: NOW,
    });

    expect(result.emailsSent).toBe(0);
    expect(result.emailsFailed).toBe(1);
  });

  it("uses the decline message in the email body and subject when provided", async () => {
    const admin = adminUser({ id: "u-decline", email: "decline@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      declineMessage: "Insufficient funds",
      now: NOW,
    });

    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.text).toContain("Insufficient funds");
    expect(emailArg.html).toContain("Insufficient funds");
  });

  it("email includes the billing panel link", async () => {
    const admin = adminUser({ id: "u-link", email: "link@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    await notifyAdminsOfBillingIssue({
      companyId: "co-1",
      status: "past_due",
      now: NOW,
    });

    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.text).toContain("https://app.test/admin?panel=billing");
  });
});

describe("notifyAdminsOfBillingRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-recovery" });
    mockCompanyFindUnique.mockResolvedValue({ name: "Acme Corp" } as never);
    mockNotificationUpsert.mockResolvedValue({} as never);
    mockNotificationFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns skippedReason=status_not_healthy for an unhealthy status", async () => {
    const result = await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "past_due",
      now: NOW,
    });

    expect(result.skippedReason).toBe("status_not_healthy");
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("fires exactly one recovery email per admin on a healthy→active transition", async () => {
    const admins = [
      adminUser({ id: "u-r1", email: "r1@test.example.com" }),
      adminUser({ id: "u-r2", email: "r2@test.example.com" }),
    ];
    mockUserFindMany.mockResolvedValue(admins as never);

    const result = await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      dedupeBucket: "period-end-2026",
      now: NOW,
    });

    expect(result.recipients).toBe(2);
    expect(result.inAppCreated).toBe(2);
    expect(result.emailsSent).toBe(2);
    expect(result.emailsFailed).toBe(0);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const subjects = mockSendEmail.mock.calls.map((c) => c[0].subject as string);
    for (const s of subjects) {
      expect(s).toContain("good standing");
    }
  });

  it("does NOT re-send recovery email when the same recovery is delivered again", async () => {
    const admin = adminUser({ id: "u-r3", email: "r3@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    mockNotificationFindUnique.mockResolvedValue({ status: "Sent" } as never);

    const result = await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "trialing",
      dedupeBucket: "period-end-2026",
      now: NOW,
    });

    expect(result.emailsSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends exactly one recovery email on first delivery, skips on re-delivery", async () => {
    const admin = adminUser({ id: "u-r4", email: "r4@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    mockNotificationFindUnique.mockResolvedValueOnce(null);

    await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      dedupeBucket: "bucket-rec",
      now: NOW,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    mockNotificationFindUnique.mockResolvedValueOnce({ status: "Sent" } as never);

    const second = await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      dedupeBucket: "bucket-rec",
      now: NOW,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(second.emailsSent).toBe(0);
  });

  it("uses a distinct dedupe namespace from the issue alert (recovery dedupe key differs)", async () => {
    const admin = adminUser({ id: "u-r5", email: "r5@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      dedupeBucket: "period-x",
      now: NOW,
    });

    const findUniqueCalls = mockNotificationFindUnique.mock.calls;
    expect(findUniqueCalls.length).toBeGreaterThan(0);
    const emailDedupeKey = findUniqueCalls[0][0].where.userId_channel_dedupeKey.dedupeKey as string;
    expect(emailDedupeKey).toContain("recovery");
    expect(emailDedupeKey).not.toMatch(/^billing:/);
  });

  it("logs a notice but does not throw when the outbound transport is not configured", async () => {
    mockEmailConfigured.mockReturnValue(false);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const admin = adminUser({ id: "u-r6", email: "r6@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    const result = await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      now: NOW,
    });

    expect(result.inAppCreated).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("outbound transport not configured"),
    );

    infoSpy.mockRestore();
  });

  it("recovery email body mentions the recovered status and billing panel link", async () => {
    const admin = adminUser({ id: "u-r7", email: "r7@test.example.com" });
    mockUserFindMany.mockResolvedValue([admin] as never);

    await notifyAdminsOfBillingRecovery({
      companyId: "co-1",
      status: "active",
      now: NOW,
    });

    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.text).toContain("active");
    expect(emailArg.text).toContain("https://app.test/admin?panel=billing");
  });
});

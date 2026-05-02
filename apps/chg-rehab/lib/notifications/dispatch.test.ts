import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
    userNotificationPreference: { findMany: vi.fn() },
    notification: {
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../companySettings", () => ({
  getCompanySettings: vi.fn(),
}));

vi.mock("../outboundEmail", () => ({
  isOutboundEmailConfigured: vi.fn(),
  sendOutboundEmail: vi.fn(),
}));

import { dispatchNotification, flushPendingEmails } from "./dispatch";
import { prisma } from "../prisma";
import { getCompanySettings } from "../companySettings";
import { isOutboundEmailConfigured, sendOutboundEmail } from "../outboundEmail";

const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockCompanyFindUnique = vi.mocked(prisma.company.findUnique);
const mockPrefFindMany = vi.mocked(prisma.userNotificationPreference.findMany);
const mockNotificationUpsert = vi.mocked(prisma.notification.upsert);
const mockNotificationUpdate = vi.mocked(prisma.notification.update);
const mockNotificationUpdateMany = vi.mocked(prisma.notification.updateMany);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockGetSettings = vi.mocked(getCompanySettings);
const mockEmailConfigured = vi.mocked(isOutboundEmailConfigured);
const mockSendEmail = vi.mocked(sendOutboundEmail);

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    timezone: "UTC",
    meta: {
      notifyEvents: {
        changeOrder: { email: true, inApp: true },
      },
      notifyDigestFrequency: "Realtime",
      notifyQuietStart: "20:00",
      notifyQuietEnd: "07:00",
      ...overrides,
    },
  } as never;
}

const BASE_DISPATCH = {
  companyId: "co-1",
  event: "changeOrder" as const,
  userIds: ["user-1"],
  title: "A change order was submitted",
};

describe("effectiveChannels — per-user override logic via dispatchNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-1" } as never);
    mockNotificationUpsert.mockResolvedValue({} as never);
    mockNotificationUpdate.mockResolvedValue({} as never);
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 } as never);
    mockUserFindUnique.mockResolvedValue({
      email: "user@example.com",
      firstName: "Alice",
      lastName: "Smith",
      emailOptOut: false,
    } as never);
    mockCompanyFindUnique.mockResolvedValue({ name: "Acme Corp" } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) user override mutes a channel the company has on", async () => {
    mockGetSettings.mockResolvedValue(
      makeSettings({ notifyDigestFrequency: "Realtime", notifyQuietStart: "23:00", notifyQuietEnd: "00:01" })
    );
    mockPrefFindMany.mockResolvedValue([
      { userId: "user-1", email: false, inApp: true },
    ] as never);
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", notifyQuietOverride: false, notifyQuietStart: null, notifyQuietEnd: null },
    ] as never);

    const result = await dispatchNotification(BASE_DISPATCH);

    expect(result.emailsSent).toBe(0);
    expect(result.emailsQueued).toBe(0);
    expect(result.inAppCreated).toBe(1);
  });

  it("(b) user override cannot re-enable a channel the company has turned off", async () => {
    mockGetSettings.mockResolvedValue({
      timezone: "UTC",
      meta: {
        notifyEvents: {
          changeOrder: { email: false, inApp: true },
        },
        notifyDigestFrequency: "Realtime",
        notifyQuietStart: "23:00",
        notifyQuietEnd: "00:01",
      },
    } as never);
    mockPrefFindMany.mockResolvedValue([
      { userId: "user-1", email: true, inApp: true },
    ] as never);
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", notifyQuietOverride: false, notifyQuietStart: null, notifyQuietEnd: null },
    ] as never);

    const result = await dispatchNotification(BASE_DISPATCH);

    expect(result.emailsSent).toBe(0);
    expect(result.emailsQueued).toBe(0);
    expect(result.inAppCreated).toBe(1);
  });
});

describe("effectiveQuiet — per-user quiet window via dispatchNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-1" } as never);
    mockNotificationUpsert.mockResolvedValue({} as never);
    mockNotificationUpdate.mockResolvedValue({} as never);
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 } as never);
    mockUserFindUnique.mockResolvedValue({
      email: "user@example.com",
      firstName: "Alice",
      lastName: "Smith",
      emailOptOut: false,
    } as never);
    mockCompanyFindUnique.mockResolvedValue({ name: "Acme Corp" } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("(c) per-user quiet window queues an email even when company digest is Realtime", async () => {
    vi.setSystemTime(new Date("2026-04-30T22:00:00Z"));

    mockGetSettings.mockResolvedValue(
      makeSettings({
        notifyDigestFrequency: "Realtime",
        notifyQuietStart: "00:00",
        notifyQuietEnd: "00:01",
      })
    );
    mockPrefFindMany.mockResolvedValue([
      { userId: "user-1", email: true, inApp: true },
    ] as never);
    mockUserFindMany.mockResolvedValue([
      {
        id: "user-1",
        notifyQuietOverride: true,
        notifyQuietStart: "21:00",
        notifyQuietEnd: "23:00",
      },
    ] as never);

    const result = await dispatchNotification(BASE_DISPATCH);

    expect(result.emailsQueued).toBe(1);
    expect(result.emailsSent).toBe(0);
  });
});

describe("flushPendingEmails — re-checks per-user quiet window before sending", () => {
  const COMPANY_ID = "co-flush";

  const NOW_IN_QUIET = new Date("2026-04-30T22:00:00Z");

  const claimedRow = {
    id: "notif-1",
    companyId: COMPANY_ID,
    userId: "user-1",
    event: "changeOrder",
    title: "Change order submitted",
    body: null,
    link: null,
    meta: null,
    urgent: false,
    dedupeKey: "dk-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue({ delivered: true, messageId: "msg-x" } as never);
    mockNotificationUpdate.mockResolvedValue({} as never);
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 } as never);
    mockCompanyFindUnique.mockResolvedValue({ name: "Acme Corp" } as never);
    mockUserFindUnique.mockResolvedValue({
      email: "user@example.com",
      firstName: "Alice",
      lastName: "Smith",
      emailOptOut: false,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(d) defers a row when the user is currently inside their own quiet window", async () => {
    mockGetSettings.mockResolvedValue(
      makeSettings({ notifyQuietStart: "00:00", notifyQuietEnd: "00:01" })
    );
    mockQueryRaw.mockResolvedValue([claimedRow] as never);
    mockUserFindMany.mockResolvedValue([
      {
        id: "user-1",
        notifyQuietOverride: true,
        notifyQuietStart: "21:00",
        notifyQuietEnd: "23:00",
      },
    ] as never);

    const result = await flushPendingEmails(COMPANY_ID, NOW_IN_QUIET);

    expect(result.attempted).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);

    const releaseCall = mockNotificationUpdate.mock.calls.find(
      (c) => c[0].data?.status === "Pending"
    );
    expect(releaseCall).toBeDefined();
    expect(releaseCall![0].where.id).toBe("notif-1");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("(d) sends a row when the user is outside their quiet window even if the company window is active at that time", async () => {
    // Company quiet: 20:00–23:00 UTC. now = 22:00 UTC → company IS in quiet.
    // User override: 02:00–04:00 UTC. now = 22:00 → user is NOT in quiet.
    // Expected: per-user override wins; row is attempted and delivered.
    const NOW_IN_COMPANY_QUIET = new Date("2026-04-30T22:00:00Z");

    mockGetSettings.mockResolvedValue(
      makeSettings({ notifyQuietStart: "20:00", notifyQuietEnd: "23:00" })
    );
    mockQueryRaw.mockResolvedValue([claimedRow] as never);
    mockUserFindMany.mockResolvedValue([
      {
        id: "user-1",
        notifyQuietOverride: true,
        notifyQuietStart: "02:00",
        notifyQuietEnd: "04:00",
      },
    ] as never);

    const result = await flushPendingEmails(COMPANY_ID, NOW_IN_COMPANY_QUIET);

    expect(result.attempted).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

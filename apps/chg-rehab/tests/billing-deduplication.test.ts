import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory fake for the Notification table.
//
// The deduplication logic in `notifyAdminsOfBillingIssue` works entirely
// through Prisma:
//
//   1. `notification.findUnique({ where: { userId_channel_dedupeKey } })`
//      — probe: if a "Sent" row already exists, skip sending.
//
//   2. `notification.upsert({ where: { userId_channel_dedupeKey }, … })`
//      — persist the outcome (Sent / Failed) so the next call sees it.
//
// By keeping a simple Map keyed on "<userId>|<channel>|<dedupeKey>" we can
// drive the real function code through both the "suppressed within the window"
// and "fires again after the window advances" paths without touching a real
// DB or a Redis/KV store.
// ---------------------------------------------------------------------------

type NotificationRow = {
  userId: string;
  channel: string;
  dedupeKey: string;
  status: string;
  sentAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
};

function rowKey(userId: string, channel: string, dedupeKey: string): string {
  return `${userId}|${channel}|${dedupeKey}`;
}

function makeNotificationStore() {
  const rows = new Map<string, NotificationRow>();

  function upsert(data: NotificationRow): NotificationRow {
    const key = rowKey(data.userId, data.channel, data.dedupeKey);
    const existing = rows.get(key);
    if (existing) {
      Object.assign(existing, data);
      return existing;
    }
    rows.set(key, { ...data });
    return rows.get(key)!;
  }

  function findUnique(userId: string, channel: string, dedupeKey: string): NotificationRow | null {
    return rows.get(rowKey(userId, channel, dedupeKey)) ?? null;
  }

  function clear() {
    rows.clear();
  }

  return { upsert, findUnique, clear };
}

const store = makeNotificationStore();

// ---------------------------------------------------------------------------
// Mock wiring
// ---------------------------------------------------------------------------

const sendOutboundEmailMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
    notification: {
      upsert: vi.fn(({ where, create, update }: {
        where: { userId_channel_dedupeKey: { userId: string; channel: string; dedupeKey: string } };
        create: Omit<NotificationRow, "userId" | "channel" | "dedupeKey"> & {
          companyId: string;
          event: string;
          title: string;
          body: string;
          link: string;
          urgent: boolean;
          userId: string;
          channel: string;
          dedupeKey: string;
        };
        update: Partial<NotificationRow>;
      }) => {
        const { userId, channel, dedupeKey } = where.userId_channel_dedupeKey;
        const existing = store.findUnique(userId, channel, dedupeKey);
        if (existing) {
          return Promise.resolve(store.upsert({ ...existing, ...update, userId, channel, dedupeKey }));
        }
        return Promise.resolve(
          store.upsert({
            userId,
            channel,
            dedupeKey,
            status: create.status,
            sentAt: create.sentAt ?? null,
            failedAt: create.failedAt ?? null,
            failureReason: create.failureReason ?? null,
          })
        );
      }),
      findUnique: vi.fn(({ where }: {
        where: { userId_channel_dedupeKey: { userId: string; channel: string; dedupeKey: string } };
        select?: unknown;
      }) => {
        const { userId, channel, dedupeKey } = where.userId_channel_dedupeKey;
        const row = store.findUnique(userId, channel, dedupeKey);
        return Promise.resolve(row ? { status: row.status } : null);
      }),
    },
  },
}));

vi.mock("@/lib/outboundEmail", () => ({
  isOutboundEmailConfigured: () => true,
  sendOutboundEmail: (...args: unknown[]) => sendOutboundEmailMock(...args),
}));

vi.mock("@/lib/contactUnsubscribe", () => ({
  publicAppOrigin: () => "https://app.example.com",
}));

// Import after mocks are in place.
import { notifyAdminsOfBillingIssue, notifyAdminsOfBillingReminder, BILLING_REMINDER_WINDOW_MS } from "@/lib/notifications/billing";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const COMPANY_ID = "company-test-123";
const ADMIN_ID = "admin-user-abc";

function setupAdmins() {
  (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      id: ADMIN_ID,
      email: "admin@example.com",
      firstName: "Alice",
      lastName: "Admin",
      emailOptOut: false,
    },
  ]);
  (prisma.company.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    name: "Test Corp",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  setupAdmins();
  sendOutboundEmailMock.mockResolvedValue({ delivered: true });
});

// ---------------------------------------------------------------------------
// notifyAdminsOfBillingIssue — deduplication tests
// ---------------------------------------------------------------------------

describe("notifyAdminsOfBillingIssue — email deduplication", () => {
  it("suppresses a second email when called twice with the same dedupeBucket", async () => {
    const sharedBucket = "inv_abc123";

    // First call: email is sent.
    const result1 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: sharedBucket,
    });
    expect(result1.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);

    // Second call with the same bucket: the "Sent" row already exists in
    // the DB (our in-memory store), so the function must not send again.
    const result2 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: sharedBucket,
    });
    expect(result2.emailsSent).toBe(0);
    // Transport must NOT have been called a second time.
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
  });

  it("fires a fresh email when the dedupeBucket advances (simulates a new billing period)", async () => {
    const bucket1 = "inv_period_one";
    const bucket2 = "inv_period_two";

    // First call: email delivered for bucket 1.
    const result1 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: bucket1,
    });
    expect(result1.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);

    // Second call: different bucket → no existing "Sent" row for this key
    // → should send a fresh email.
    const result2 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: bucket2,
    });
    expect(result2.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(2);
  });

  it("still suppresses when status changes but the same bucket is reused", async () => {
    const bucket = "inv_multi_status";

    // Initial past_due alert.
    const result1 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: bucket,
    });
    expect(result1.emailsSent).toBe(1);

    // Stripe flips to unpaid with the same invoice/bucket — different status,
    // so different dedupeKey → a new email is expected for the new status.
    const result2 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "unpaid",
      dedupeBucket: bucket,
    });
    expect(result2.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(2);

    // Repeating past_due with the same bucket is still suppressed.
    const result3 = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "past_due",
      dedupeBucket: bucket,
    });
    expect(result3.emailsSent).toBe(0);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(2);
  });

  it("skips sending when status is healthy (not in UNHEALTHY_STATUSES)", async () => {
    const result = await notifyAdminsOfBillingIssue({
      companyId: COMPANY_ID,
      status: "active",
    });
    expect(result.skippedReason).toBe("status_not_unhealthy");
    expect(result.emailsSent).toBe(0);
    expect(sendOutboundEmailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// notifyAdminsOfBillingReminder — 24-hour rolling window tests
// ---------------------------------------------------------------------------

describe("notifyAdminsOfBillingReminder — 24-hour rolling window deduplication", () => {
  it("suppresses a second reminder email sent within the same 24-hour window", async () => {
    const windowStart = new Date(BILLING_REMINDER_WINDOW_MS * 100); // epoch-aligned boundary
    const oneHourLater = new Date(windowStart.getTime() + 60 * 60 * 1000);

    // First reminder: sent at the start of window 100.
    const result1 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "past_due",
      now: windowStart,
    });
    expect(result1.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);

    // Second reminder: still inside window 100 (only 1 hour later).
    const result2 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "past_due",
      now: oneHourLater,
    });
    expect(result2.emailsSent).toBe(0);
    // Transport must NOT be invoked again.
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
  });

  it("fires a fresh reminder after the 24-hour window advances", async () => {
    const windowStart = new Date(BILLING_REMINDER_WINDOW_MS * 200); // epoch-aligned boundary
    const nextWindow = new Date(windowStart.getTime() + BILLING_REMINDER_WINDOW_MS);

    // Reminder within window 200.
    const result1 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "past_due",
      now: windowStart,
    });
    expect(result1.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);

    // Reminder at the start of window 201 (24 h later) — different windowId
    // means a fresh dedupeKey → the guard does not block it.
    const result2 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "past_due",
      now: nextWindow,
    });
    expect(result2.emailsSent).toBe(1);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(2);
  });

  it("reminder is status-agnostic: a status flip within the same window does not trigger a second email", async () => {
    const windowStart = new Date(BILLING_REMINDER_WINDOW_MS * 300);
    const midWindow = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);

    const result1 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "past_due",
      now: windowStart,
    });
    expect(result1.emailsSent).toBe(1);

    // Status flips to "unpaid" but we're still in the same 24h window.
    // The dedupeKey is `billing-reminder-email:<windowId>` (no status), so
    // it matches the existing row and the send is skipped.
    const result2 = await notifyAdminsOfBillingReminder({
      companyId: COMPANY_ID,
      status: "unpaid",
      now: midWindow,
    });
    expect(result2.emailsSent).toBe(0);
    expect(sendOutboundEmailMock).toHaveBeenCalledTimes(1);
  });
});

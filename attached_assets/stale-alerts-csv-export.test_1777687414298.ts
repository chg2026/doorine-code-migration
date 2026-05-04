import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StaleSweepAlertLogEntry } from "@/lib/notifications/sweep";

// ---------------------------------------------------------------------------
// Mocks
//
// `renderStaleAlertsCsv` is a pure function that only depends on its input,
// so no mocks are needed for that suite.
//
// `getStaleSweepAlertLogsForExport` hits Prisma, so we stub the DB layer and
// verify the 30-day retention cutoff is applied correctly.
// ---------------------------------------------------------------------------

const findManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staleSweepAlertLog: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

// Other transitive imports inside sweep.ts that we don't need for this suite.
vi.mock("@/lib/companySettings", () => ({
  getCompanySettings: vi.fn().mockResolvedValue({ meta: {} }),
}));
vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: vi.fn(),
  flushPendingEmails: vi.fn(),
}));
vi.mock("@/lib/docStatus", () => ({ effectiveDocStatus: vi.fn() }));
vi.mock("@/lib/outboundEmail", () => ({
  isOutboundEmailConfigured: vi.fn().mockReturnValue(false),
  sendOutboundEmail: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<StaleSweepAlertLogEntry> = {}): StaleSweepAlertLogEntry {
  return {
    id: "log-1",
    sentAt: "2026-04-01T10:00:00.000Z",
    staleForMs: 7_200_000, // 2 hours
    thresholdMs: 3_600_000, // 1 hour
    throttleMs: 21_600_000, // 6 hours
    recipientCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    recipients: [],
    ...overrides,
  };
}

// Split a CSV row string into cell values, honouring double-quoted fields.
// Handles trailing empty cells (rows that end with one or more commas).
function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i <= row.length) {
    if (i === row.length) {
      // End of string — only push a trailing empty cell if the previous
      // character was a comma (meaning there is a cell after that comma).
      if (cells.length > 0 && row[row.length - 1] === ",") {
        cells.push("");
      }
      break;
    }
    if (row[i] === '"') {
      let cell = "";
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else if (row[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          cell += row[i++];
        }
      }
      cells.push(cell);
    } else {
      let cell = "";
      while (i < row.length && row[i] !== ",") cell += row[i++];
      cells.push(cell);
    }
    if (i < row.length && row[i] === ",") i++;
    else break;
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Tests for renderStaleAlertsCsv (pure — no DB)
// ---------------------------------------------------------------------------

describe("renderStaleAlertsCsv", () => {
  // Import lazily inside describe so mocks are set up before module load.
  let renderStaleAlertsCsv: (items: StaleSweepAlertLogEntry[]) => string;

  beforeEach(async () => {
    const mod = await import("@/lib/notifications/stale-alerts-csv");
    renderStaleAlertsCsv = mod.renderStaleAlertsCsv;
  });

  it("produces RFC 4180 CRLF line endings", () => {
    const csv = renderStaleAlertsCsv([]);
    // Even with no data rows the header line ends with CRLF.
    expect(csv).toMatch(/\r\n$/);
    expect(csv).not.toMatch(/[^\r]\n/); // no bare LF
  });

  it("outputs the correct header columns", () => {
    const csv = renderStaleAlertsCsv([]);
    const [headerLine] = csv.split("\r\n");
    const headers = parseCsvRow(headerLine);
    expect(headers).toEqual([
      "Timestamp (UTC)",
      "Staleness duration",
      "Staleness duration (ms)",
      "Threshold",
      "Threshold (ms)",
      "Throttle",
      "Throttle (ms)",
      "Recipient email",
      "Delivery status",
      "Failure reason",
    ]);
  });

  it("emits one row per recipient when multiple recipients exist", () => {
    const entry = makeEntry({
      recipients: [
        { email: "alice@example.com", delivered: true },
        { email: "bob@example.com", delivered: false, reason: "invalid_recipient" },
      ],
    });
    const csv = renderStaleAlertsCsv([entry]);
    // header + 2 data rows + trailing CRLF → split gives ["hdr","r1","r2",""]
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it("emits one blank-recipient row when recipients array is empty", () => {
    const csv = renderStaleAlertsCsv([makeEntry({ recipients: [] })]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2); // header + 1 fallback row
    const cells = parseCsvRow(lines[1]);
    expect(cells[7]).toBe(""); // Recipient email — empty
    expect(cells[8]).toBe(""); // Delivery status — empty
    expect(cells[9]).toBe(""); // Failure reason — empty
  });

  it("writes 'Delivered' for delivered recipients and empty failure reason", () => {
    const entry = makeEntry({
      recipients: [{ email: "admin@example.com", delivered: true }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[8]).toBe("Delivered");
    expect(cells[9]).toBe("");
  });

  it("writes 'Failed' and the formatted reason for failed recipients", () => {
    const entry = makeEntry({
      recipients: [{ email: "admin@example.com", delivered: false, reason: "user_opted_out" }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[8]).toBe("Failed");
    expect(cells[9]).toBe("Recipient unsubscribed");
  });

  it("falls back to 'Failed to deliver' when reason is undefined", () => {
    const entry = makeEntry({
      recipients: [{ email: "x@example.com", delivered: false, reason: undefined }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[9]).toBe("Failed to deliver");
  });

  it("renders staleForMs=null as 'Sweep had no recorded run' and empty ms cell", () => {
    const entry = makeEntry({ staleForMs: null, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[1]).toBe("Sweep had no recorded run");
    expect(cells[2]).toBe(""); // Staleness duration (ms) — empty when null
  });

  it("renders staleForMs correctly when set", () => {
    const entry = makeEntry({ staleForMs: 3_600_000, recipients: [] }); // exactly 1 hour
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[1]).toBe("1 hour");
    expect(cells[2]).toBe("3600000");
  });

  // -------------------------------------------------------------------------
  // CSV-special character escaping
  // -------------------------------------------------------------------------

  it("double-quotes a cell that contains a comma", () => {
    const entry = makeEntry({
      recipients: [{ email: "a,b@example.com", delivered: true }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    // The email cell must be wrapped in quotes.
    expect(csv).toMatch(/"a,b@example\.com"/);
  });

  it("double-quotes a cell that contains an embedded double-quote and escapes it", () => {
    const reason = 'say "hello"';
    const entry = makeEntry({
      recipients: [{ email: "x@example.com", delivered: false, reason }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    // The rendered reason is the fallback because it's not a known code.
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    // parseCsvRow un-escapes the doubled quotes — we should get the original.
    expect(cells[9]).toBe(reason);
  });

  it("double-quotes a cell that contains a newline", () => {
    const entry = makeEntry({
      recipients: [{ email: "x@example.com", delivered: false, reason: "line1\nline2" }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[9]).toBe("line1\nline2");
  });

  it("prepends a single-quote to formula-injection prefix '='", () => {
    const entry = makeEntry({
      recipients: [{ email: "=HYPERLINK(@example.com)", delivered: true }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    // The cell value in the CSV should start with '=
    expect(csv).toContain("'=HYPERLINK");
  });

  it("prepends a single-quote to formula-injection prefix '+'", () => {
    const entry = makeEntry({
      recipients: [{ email: "+1user@example.com", delivered: true }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    expect(csv).toContain("'+1user@example.com");
  });

  it("prepends a single-quote to formula-injection prefix '@'", () => {
    const entry = makeEntry({
      recipients: [{ email: "@example.com", delivered: true }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    expect(csv).toContain("'@example.com");
  });

  // -------------------------------------------------------------------------
  // formatDurationMs boundary cases
  // -------------------------------------------------------------------------

  it("formats sub-60-second durations as 'N second(s)'", () => {
    const entry = makeEntry({ staleForMs: 1_000, recipients: [] }); // 1 second
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("1 second");
  });

  it("formats exactly 60 seconds as '1 minute'", () => {
    const entry = makeEntry({ staleForMs: 60_000, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("1 minute");
  });

  it("formats 2-minute durations as '2 minutes'", () => {
    const entry = makeEntry({ staleForMs: 120_000, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("2 minutes");
  });

  it("formats exactly 1 hour", () => {
    const entry = makeEntry({ staleForMs: 3_600_000, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("1 hour");
  });

  it("formats exactly 1 day", () => {
    const entry = makeEntry({ staleForMs: 86_400_000, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("1 day");
  });

  it("formats 3 days", () => {
    const entry = makeEntry({ staleForMs: 3 * 86_400_000, recipients: [] });
    const csv = renderStaleAlertsCsv([entry]);
    const cells = parseCsvRow(csv.split("\r\n")[1]);
    expect(cells[1]).toBe("3 days");
  });

  // -------------------------------------------------------------------------
  // formatStaleAlertReason known codes
  // -------------------------------------------------------------------------

  const knownCodes: Record<string, string> = {
    invalid_recipient: "Invalid email address",
    no_recipient_email: "No email on file",
    user_missing: "Recipient account no longer exists",
    user_opted_out: "Recipient unsubscribed",
    user_opted_out_event: "Recipient turned this notification off",
    provider_not_configured: "Email transport not configured",
    unknown: "Unknown error",
  };

  for (const [code, label] of Object.entries(knownCodes)) {
    it(`maps reason code '${code}' to '${label}'`, async () => {
      const entry = makeEntry({
        recipients: [{ email: "x@example.com", delivered: false, reason: code }],
      });
      const csv = renderStaleAlertsCsv([entry]);
      const lines = csv.split("\r\n").filter((l) => l.length > 0);
      const cells = parseCsvRow(lines[1]);
      expect(cells[9]).toBe(label);
    });
  }

  it("formats provider_error_ prefix reasons", () => {
    const entry = makeEntry({
      recipients: [{ email: "x@example.com", delivered: false, reason: "provider_error_550" }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[9]).toBe("Email provider rejected (550)");
  });

  it("formats transport_error: prefix reasons", () => {
    const entry = makeEntry({
      recipients: [
        { email: "x@example.com", delivered: false, reason: "transport_error: ECONNREFUSED" },
      ],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[9]).toBe("Network error: ECONNREFUSED");
  });

  it("passes through an unrecognised reason string verbatim", () => {
    const entry = makeEntry({
      recipients: [{ email: "x@example.com", delivered: false, reason: "some_future_code" }],
    });
    const csv = renderStaleAlertsCsv([entry]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    const cells = parseCsvRow(lines[1]);
    expect(cells[9]).toBe("some_future_code");
  });

  it("handles multiple log entries in order", () => {
    const entries = [
      makeEntry({ sentAt: "2026-04-01T10:00:00.000Z", recipients: [] }),
      makeEntry({ sentAt: "2026-04-02T10:00:00.000Z", recipients: [] }),
    ];
    const csv = renderStaleAlertsCsv(entries);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("2026-04-01T10:00:00.000Z");
    expect(lines[2]).toContain("2026-04-02T10:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Tests for getStaleSweepAlertLogsForExport (retention cutoff)
// ---------------------------------------------------------------------------

describe("getStaleSweepAlertLogsForExport", () => {
  let getStaleSweepAlertLogsForExport: (
    companyId: string,
    now?: Date
  ) => Promise<StaleSweepAlertLogEntry[]>;
  let STALE_SWEEP_ALERT_LOG_RETENTION_MS: number;

  beforeEach(async () => {
    vi.resetModules();
    findManyMock.mockReset();

    const mod = await import("@/lib/notifications/sweep");
    getStaleSweepAlertLogsForExport = mod.getStaleSweepAlertLogsForExport;
    STALE_SWEEP_ALERT_LOG_RETENTION_MS = mod.STALE_SWEEP_ALERT_LOG_RETENTION_MS;
  });

  it("passes the 30-day cutoff derived from the supplied 'now' to Prisma", async () => {
    const now = new Date("2026-04-30T12:00:00.000Z");
    const expectedCutoff = new Date(now.getTime() - STALE_SWEEP_ALERT_LOG_RETENTION_MS);

    findManyMock.mockResolvedValue([]);

    await getStaleSweepAlertLogsForExport("company-1", now);

    expect(findManyMock).toHaveBeenCalledOnce();
    const callArg = findManyMock.mock.calls[0][0] as {
      where: { companyId: string; sentAt: { gte: Date } };
    };
    expect(callArg.where.companyId).toBe("company-1");
    expect(callArg.where.sentAt.gte.getTime()).toBe(expectedCutoff.getTime());
  });

  it("orders results descending by sentAt", async () => {
    findManyMock.mockResolvedValue([]);
    await getStaleSweepAlertLogsForExport("company-1", new Date());
    const callArg = findManyMock.mock.calls[0][0] as {
      orderBy: { sentAt: string };
    };
    expect(callArg.orderBy).toEqual({ sentAt: "desc" });
  });

  it("maps a DB row to the StaleSweepAlertLogEntry shape", async () => {
    const now = new Date("2026-04-30T12:00:00.000Z");
    const sentAt = new Date("2026-04-28T08:00:00.000Z");
    findManyMock.mockResolvedValue([
      {
        id: "row-1",
        sentAt,
        staleForMs: 5_000,
        thresholdMs: 3_600_000,
        throttleMs: 21_600_000,
        recipientCount: 1,
        deliveredCount: 1,
        failedCount: 0,
        recipients: [{ email: "admin@example.com", delivered: true }],
      },
    ]);

    const result = await getStaleSweepAlertLogsForExport("company-1", now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "row-1",
      sentAt: sentAt.toISOString(),
      staleForMs: 5_000,
      thresholdMs: 3_600_000,
      throttleMs: 21_600_000,
      recipientCount: 1,
      deliveredCount: 1,
      failedCount: 0,
      recipients: [{ email: "admin@example.com", delivered: true }],
    });
  });

  it("converts a null staleForMs DB value to null in the entry", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "row-2",
        sentAt: new Date("2026-04-28T08:00:00.000Z"),
        staleForMs: null,
        thresholdMs: 3_600_000,
        throttleMs: 21_600_000,
        recipientCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        recipients: [],
      },
    ]);

    const result = await getStaleSweepAlertLogsForExport(
      "company-1",
      new Date("2026-04-30T12:00:00.000Z")
    );
    expect(result[0].staleForMs).toBeNull();
  });

  it("returns an empty array when no rows fall within the retention window", async () => {
    findManyMock.mockResolvedValue([]);
    const result = await getStaleSweepAlertLogsForExport(
      "company-1",
      new Date("2026-04-30T12:00:00.000Z")
    );
    expect(result).toEqual([]);
  });

  it("uses 30 days (2592000000 ms) as the retention constant", () => {
    expect(STALE_SWEEP_ALERT_LOG_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

import type { StaleSweepAlertLogEntry } from "@/lib/notifications/sweep";

const CSV_HEADERS = [
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
] as const;

export function renderStaleAlertsCsv(items: StaleSweepAlertLogEntry[]): string {
  const lines: string[] = [CSV_HEADERS.map(csvEscape).join(",")];
  for (const it of items) {
    const base = [
      it.sentAt,
      it.staleForMs !== null ? formatDurationMs(it.staleForMs) : "Sweep had no recorded run",
      it.staleForMs !== null ? String(it.staleForMs) : "",
      formatDurationMs(it.thresholdMs),
      String(it.thresholdMs),
      formatDurationMs(it.throttleMs),
      String(it.throttleMs),
    ];
    if (it.recipients.length === 0) {
      lines.push([...base, "", "", ""].map(csvEscape).join(","));
      continue;
    }
    for (const r of it.recipients) {
      const status = r.delivered ? "Delivered" : "Failed";
      const reason = r.delivered ? "" : formatStaleAlertReason(r.reason);
      lines.push([...base, r.email, status, reason].map(csvEscape).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}

function csvEscape(value: string): string {
  if (value === "") return "";
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function formatDurationMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const sec = Math.round(safe / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"}`;
}

function formatStaleAlertReason(reason: string | undefined): string {
  if (!reason) return "Failed to deliver";
  const known: Record<string, string> = {
    invalid_recipient: "Invalid email address",
    no_recipient_email: "No email on file",
    user_missing: "Recipient account no longer exists",
    user_opted_out: "Recipient unsubscribed",
    user_opted_out_event: "Recipient turned this notification off",
    provider_not_configured: "Email transport not configured",
    unknown: "Unknown error",
  };
  if (known[reason]) return known[reason];
  if (reason.startsWith("provider_error_")) {
    return `Email provider rejected (${reason.replace(/^provider_error_/, "").slice(0, 80)})`;
  }
  if (reason.startsWith("transport_error:")) {
    return `Network error: ${reason.slice("transport_error:".length).trim().slice(0, 80)}`;
  }
  return reason;
}

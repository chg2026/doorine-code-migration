import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStaleSweepAlertLogsForExport } from "@/lib/notifications/sweep";
import { renderStaleAlertsCsv } from "@/lib/notifications/stale-alerts-csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await getStaleSweepAlertLogsForExport(user.companyId);
  const csv = renderStaleAlertsCsv(items);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `outage-alerts-${stamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

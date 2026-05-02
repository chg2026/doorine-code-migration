import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanySettings } from "@/lib/companySettings";
import { isOutboundEmailConfigured } from "@/lib/outboundEmail";
import {
  getRecentStaleSweepAlertLogs,
  getStaleAlertConfig,
} from "@/lib/notifications/sweep";
import { getUnsubscribeLinkDiagnostic } from "@/lib/contactUnsubscribe";
import AdminClient from "./Client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/login");
  if (user.role !== "Admin") redirect("/");

  const [settings, company, perms, users, removedUsers, invites, notificationState] = await Promise.all([
    getCompanySettings(user.companyId),
    prisma.company.findUnique({ where: { id: user.companyId } }),
    prisma.permissionLabelRow.findMany({
      where: { companyId: user.companyId },
      orderBy: { ord: "asc" },
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: false },
      orderBy: [{ deactivatedAt: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        deactivatedAt: true,
      },
    }),
    prisma.invite.findMany({
      where: { companyId: user.companyId, status: "Pending" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    prisma.notificationState.findUnique({
      where: { companyId: user.companyId },
      select: {
        lastDigestSweepAt: true,
        lastStaleAlertAt: true,
        lastManualSweepAt: true,
        lastManualSweepByUserId: true,
        lastManualSweepByName: true,
      },
    }),
  ]);

  const [staleAlertConfig, recentStaleAlertsResult] = await Promise.all([
    getStaleAlertConfig(user.companyId),
    getRecentStaleSweepAlertLogs(user.companyId),
  ]);
  const { items: recentStaleAlerts, hasMore: recentStaleAlertsHasMore } =
    recentStaleAlertsResult;

  return (
    <Suspense fallback={null}>
    <AdminClient
      currentUserRole={user.role}
      companyName={company?.name ?? ""}
      settings={{
        strictPaymentGate: settings.strictPaymentGate,
        blockAssignmentIfDocsMissing: settings.blockAssignmentIfDocsMissing,
        expiryAlertThresholdDays: settings.expiryAlertThresholdDays,
        projectIdPrefix: settings.projectIdPrefix,
        defaultProjectMode: settings.defaultProjectMode,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        warehouseLowStockThreshold: settings.warehouseLowStockThreshold,
        contractorPortalEnabled: settings.contractorPortalEnabled,
        meta: (settings.meta as Record<string, unknown>) ?? {},
      }}
      perms={perms.map((p) => ({
        id: p.id,
        label: p.label,
        ord: p.ord,
        pm: p.pm,
        gc: p.gc,
        sub: p.sub,
        inspector: p.inspector,
        adminLock: p.adminLock,
        locked: p.locked,
      }))}
      currentUserId={user.id}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.email ?? "User"),
        role: u.role,
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      }))}
      removedUsers={removedUsers.map((u) => ({
        id: u.id,
        name:
          [u.firstName, u.lastName].filter(Boolean).join(" ") || "Removed teammate",
        role: u.role,
        deactivatedAt: u.deactivatedAt ? u.deactivatedAt.toISOString() : null,
      }))}
      outboundEmailConfigured={isOutboundEmailConfigured()}
      unsubscribeLinkDiagnostic={getUnsubscribeLinkDiagnostic()}
      lastNotificationSweepAt={
        notificationState?.lastDigestSweepAt
          ? notificationState.lastDigestSweepAt.toISOString()
          : null
      }
      lastStaleAlertAt={
        notificationState?.lastStaleAlertAt
          ? notificationState.lastStaleAlertAt.toISOString()
          : null
      }
      lastManualSweepAt={
        notificationState?.lastManualSweepAt
          ? notificationState.lastManualSweepAt.toISOString()
          : null
      }
      lastManualSweepByUserId={notificationState?.lastManualSweepByUserId ?? null}
      lastManualSweepByName={notificationState?.lastManualSweepByName ?? null}
      staleAlertThresholdMs={staleAlertConfig.thresholdMs}
      staleAlertThrottleMs={staleAlertConfig.throttleMs}
      recentStaleAlerts={recentStaleAlerts}
      recentStaleAlertsHasMore={recentStaleAlertsHasMore}
    />
    </Suspense>
  );
}

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
import AdminTabStrip from "./AdminTabStrip";
import InvestorPortalShell from "./investor-portal/InvestorPortalShell";

export const dynamic = "force-dynamic";

const INVESTOR_TABS = new Set(["investors", "deals", "fundraising", "finance"]);

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (sp.tab || "account").toLowerCase();

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "Admin") redirect("/");

  if (INVESTOR_TABS.has(tab)) {
    const [investors, offerings, distributions, capitalCalls] = await Promise.all([
      prisma.investor.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: { select: { committedAmount: true, fundedAmount: true } },
        },
      }),
      prisma.offering.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: {
            include: {
              investor: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      }),
      prisma.distribution.findMany({
        where: { offering: { companyId: user.companyId } },
        orderBy: { createdAt: "desc" },
        include: {
          offering: { select: { id: true, name: true } },
          allocations: {
            include: {
              subscription: {
                include: {
                  investor: {
                    select: { firstName: true, lastName: true, email: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.capitalCall.findMany({
        where: { offering: { companyId: user.companyId } },
        orderBy: { createdAt: "desc" },
        include: {
          offering: { select: { id: true, name: true } },
          allocations: {
            include: {
              subscription: {
                include: {
                  investor: {
                    select: { firstName: true, lastName: true, email: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const investorRows = investors.map((i) => ({
      id: i.id,
      email: i.email,
      firstName: i.firstName,
      lastName: i.lastName,
      phone: i.phone,
      accreditedStatus: i.accreditedStatus,
      status: i.status,
      portalLastLoginAt: i.portalLastLoginAt?.toISOString() ?? null,
      committedTotal: i.subscriptions.reduce((s, x) => s + Number(x.committedAmount), 0),
      fundedTotal: i.subscriptions.reduce((s, x) => s + Number(x.fundedAmount), 0),
      subscriptionCount: i.subscriptions.length,
    }));

    const investorName = (inv: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    }) =>
      [inv.firstName, inv.lastName].filter(Boolean).join(" ") ||
      inv.email ||
      "Investor";

    const offeringRows = offerings.map((o) => ({
      id: o.id,
      name: o.name,
      propertyType: o.propertyType,
      marketCity: o.marketCity,
      marketState: o.marketState,
      description: o.description,
      targetIrrLow: o.targetIrrLow ? Number(o.targetIrrLow) : null,
      targetIrrHigh: o.targetIrrHigh ? Number(o.targetIrrHigh) : null,
      prefReturnPct: o.prefReturnPct ? Number(o.prefReturnPct) : null,
      holdMonths: o.holdMonths,
      minInvestment: o.minInvestment ? Number(o.minInvestment) : null,
      raiseTarget: o.raiseTarget ? Number(o.raiseTarget) : null,
      raisedToHard: o.raisedToHard ? Number(o.raisedToHard) : null,
      raisedToSoft: o.raisedToSoft ? Number(o.raisedToSoft) : null,
      stage: o.stage,
      status: o.status,
      closeDate: o.closeDate?.toISOString() ?? null,
      coverImageUrl: o.coverImageUrl,
      coverImageObjectPath: o.coverImageObjectPath,
      documentObjectPaths: o.documentObjectPaths,
      wireInstructions:
        (o.wireInstructions as Record<string, string> | null) ?? null,
      subscriptions: o.subscriptions.map((s) => ({
        id: s.id,
        investorId: s.investorId,
        investorName: investorName(s.investor),
        investorEmail: s.investor.email,
        committedAmount: Number(s.committedAmount),
        fundedAmount: Number(s.fundedAmount),
        commitmentType: s.commitmentType,
        status: s.status,
        ownershipPct: s.ownershipPct ? Number(s.ownershipPct) : null,
        lifetimeDistributions: Number(s.lifetimeDistributions),
      })),
    }));

    const distributionRows = distributions.map((d) => ({
      id: d.id,
      offeringId: d.offeringId,
      offeringName: d.offering.name,
      periodLabel: d.periodLabel,
      distributionType: d.distributionType,
      totalAmount: Number(d.totalAmount),
      paidOn: d.paidOn?.toISOString() ?? null,
      status: d.status,
      allocations: d.allocations.map((a) => ({
        id: a.id,
        subscriptionId: a.subscriptionId,
        investorName: investorName(a.subscription.investor),
        amount: Number(a.amount),
        status: a.status,
      })),
    }));

    const callRows = capitalCalls.map((c) => ({
      id: c.id,
      offeringId: c.offeringId,
      offeringName: c.offering.name,
      noticeNumber: c.noticeNumber,
      totalAmount: Number(c.totalAmount),
      dueDate: c.dueDate?.toISOString() ?? null,
      status: c.status,
      allocations: c.allocations.map((a) => ({
        id: a.id,
        subscriptionId: a.subscriptionId,
        investorName: investorName(a.subscription.investor),
        amountDue: Number(a.amountDue),
        amountReceived: Number(a.amountReceived),
      })),
    }));

    return (
      <Suspense fallback={null}>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <AdminTabStrip current={tab} />
          <InvestorPortalShell
            tab={tab as "investors" | "deals" | "fundraising" | "finance"}
            investors={investorRows}
            offerings={offeringRows}
            distributions={distributionRows}
            capitalCalls={callRows}
          />
        </div>
      </Suspense>
    );
  }

  // Default: existing Account/admin panels.
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
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <AdminTabStrip current="account" />
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
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
        </div>
      </div>
    </Suspense>
  );
}

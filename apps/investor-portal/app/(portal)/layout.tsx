import { redirect } from "next/navigation";
import { getCurrentInvestor } from "@/lib/auth";
import PortalSidebar from "@/components/PortalSidebar";
import PortalBanners, { type PortalBanner } from "@/components/PortalBanners";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const investor = await getCurrentInvestor();
  if (!investor) {
    redirect("/login");
  }

  const initials =
    [(investor.firstName || "")[0], (investor.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (investor.email || "I")[0].toUpperCase();
  const displayName =
    [investor.firstName, investor.lastName].filter(Boolean).join(" ") ||
    investor.email ||
    "Investor";

  const banners = await buildBanners(investor.id);

  return (
    <div className="portal">
      <PortalSidebar initials={initials} displayName={displayName} />
      <div className="main">
        <PortalBanners banners={banners} />
        {children}
      </div>
    </div>
  );
}

async function buildBanners(investorId: string): Promise<PortalBanner[]> {
  const out: PortalBanner[] = [];
  try {
    const [investor, openCalls, unreadK1s, unfundedSubs] = await Promise.all([
      prisma.investor.findUnique({
        where: { id: investorId },
        select: { bannerDismissedAt: true },
      }),
      prisma.capitalCallAllocation.findMany({
        where: {
          subscription: { investorId },
          receivedAt: null,
          capitalCall: { status: { in: ["Issued"] } },
        },
        include: {
          capitalCall: { include: { offering: { select: { name: true } } } },
        },
        orderBy: { capitalCall: { issuedAt: "desc" } },
      }),
      prisma.investorDocument.findMany({
        where: { investorId, docType: "TaxK1", viewedAt: null },
        select: { id: true, taxYear: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
        take: 1,
      }),
      // Pending subscription funding: investor has signed (signedAt set) but
      // hasn't reported funding yet (fundedAt null). Surface a per-sub banner
      // so the investor sees an immediate "you signed but haven't funded".
      prisma.investorSubscription.findMany({
        where: {
          investorId,
          signedAt: { not: null },
          fundedAt: null,
        },
        select: {
          id: true,
          offeringId: true,
          signedAt: true,
          committedAmount: true,
          offering: { select: { name: true } },
        },
        orderBy: { signedAt: "desc" },
      }),
    ]);

    const dismissed =
      (investor?.bannerDismissedAt as Record<string, string> | null) || {};
    const isFresh = (key: string, eventAt: Date | null) => {
      const d = dismissed[key];
      if (!d) return true;
      const dAt = new Date(d).getTime();
      const eAt = eventAt ? eventAt.getTime() : 0;
      return eAt > dAt;
    };

    for (const a of openCalls) {
      const key = `captable:${a.capitalCallId}`;
      if (!isFresh(key, a.capitalCall.issuedAt)) continue;
      const due = a.capitalCall.dueDate
        ? ` — due ${a.capitalCall.dueDate.toLocaleDateString()}`
        : "";
      out.push({
        key,
        kind: "captable",
        title: `Capital call open · ${a.capitalCall.offering.name}`,
        body: `Notice ${a.capitalCall.noticeNumber}: $${Math.round(Number(a.amountDue)).toLocaleString()} due${due}.`,
        cta: { label: "Review notice", href: `/capital-calls/${a.capitalCallId}` },
      });
    }

    for (const s of unfundedSubs) {
      const key = `funding:${s.id}`;
      if (!isFresh(key, s.signedAt)) continue;
      out.push({
        key,
        kind: "funding",
        title: `Funding pending · ${s.offering.name}`,
        body: `You signed for $${Math.round(Number(s.committedAmount)).toLocaleString()} but haven't reported funding yet. Send your wire/ACH and confirm.`,
        cta: { label: "Funding instructions", href: `/investments/${s.offeringId}/funding` },
      });
    }

    if (unreadK1s.length > 0) {
      const k1 = unreadK1s[0];
      const key = `k1:${k1.id}`;
      if (isFresh(key, k1.uploadedAt)) {
        out.push({
          key,
          kind: "k1",
          title: `New K-1 available${k1.taxYear ? ` for ${k1.taxYear}` : ""}`,
          body: "Your annual tax document is ready in the K-1 Tax Center.",
          cta: { label: "Open Tax Center", href: "/documents/tax" },
        });
      }
    }
  } catch (err) {
    console.error("[portal-layout] banners failed", err);
  }
  return out;
}

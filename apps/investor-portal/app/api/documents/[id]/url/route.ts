import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";
import { getSignedDownloadUrl, ObjectNotFoundError } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

/**
 * Returns a 5-minute signed download URL for a document the current investor
 * can see. Visibility = personally-addressed (investorId = self) OR shared
 * offering doc (investorId IS NULL AND offering has a subscription of self).
 *
 * Cross-investor probes (someone else's personal doc) intentionally 404 to
 * avoid leaking existence.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const investor = await getCurrentInvestor();
  if (!investor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.investorDocument.findUnique({
    where: { id },
    select: {
      id: true,
      objectPath: true,
      investorId: true,
      offeringId: true,
      viewedAt: true,
    },
  });
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let allowed = false;
  if (doc.investorId === investor.id) {
    allowed = true;
  } else if (doc.investorId === null && doc.offeringId) {
    const sub = await prisma.investorSubscription.findFirst({
      where: { investorId: investor.id, offeringId: doc.offeringId },
      select: { id: true },
    });
    if (sub) allowed = true;
  }
  if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!doc.objectPath) {
    return NextResponse.json({ error: "no_file" }, { status: 404 });
  }

  let url: string;
  try {
    url = await getSignedDownloadUrl(doc.objectPath, 300);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[doc-url] sign failed", err);
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  // First view: stamp viewedAt (clears the "New" pill)
  if (!doc.viewedAt) {
    await prisma.investorDocument
      .update({ where: { id: doc.id }, data: { viewedAt: new Date() } })
      .catch(() => undefined);
  }

  return NextResponse.json({ url, expiresInSec: 300 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const properties = await prisma.property.findMany({
    where: {
      companyId: user.companyId,
      ...(q ? { address: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, code: true, address: true, city: true, state: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json(properties);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const address = String(body.address || "").trim();
  const city = String(body.city || "").trim();
  const state = String(body.state || "").trim().toUpperCase();
  const zip = String(body.zip || "").trim();
  const status = String(body.status || "Acquired").trim();
  const purchasePrice = body.purchasePrice != null ? Number(body.purchasePrice) : null;

  if (!address) return NextResponse.json({ error: "Address required" }, { status: 400 });
  if (!city || !state || !zip) {
    return NextResponse.json({ error: "City, state, and ZIP required" }, { status: 400 });
  }

  // Generate unique CHG-XXXX code based on first numeric token in address.
  const firstNum = (address.match(/\d+/) || ["0"])[0];
  let code = `CHG-${firstNum}`;
  let suffix = 1;
  while (await prisma.property.findFirst({ where: { companyId: user.companyId, code } })) {
    suffix += 1;
    code = `CHG-${firstNum}-${suffix}`;
  }

  const meta: Prisma.InputJsonValue = {
    purchasePrice: purchasePrice ?? undefined,
    createdManually: true,
  };

  const property = await prisma.property.create({
    data: {
      companyId: user.companyId,
      code,
      address,
      city,
      state,
      zip,
      status,
      acquired: new Date(),
      meta,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "property.created",
      entity: "Property",
      entityId: property.id,
      message: `Property ${code} created manually: ${address}`,
    },
  });

  return NextResponse.json({ id: property.id, code: property.code });
}

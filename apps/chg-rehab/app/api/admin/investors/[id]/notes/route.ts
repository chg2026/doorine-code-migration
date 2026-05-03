import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const investor = await prisma.investor.findFirst({
    where: { id, companyId: me.companyId },
  });
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text)
    return NextResponse.json({ error: "Body is required" }, { status: 400 });

  const note = await prisma.investorNote.create({
    data: { investorId: id, authorId: me.id, body: text },
  });
  return NextResponse.json({ ok: true, id: note.id });
}

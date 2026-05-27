import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing invite id" }, { status: 400 });

  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite || invite.companyId !== me.companyId)
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  if (invite.status !== "Pending")
    return NextResponse.json({ error: "Invite is no longer pending" }, { status: 409 });

  await prisma.invite.update({
    where: { id },
    data: { status: "Revoked" },
  });

  return NextResponse.json({ ok: true });
}

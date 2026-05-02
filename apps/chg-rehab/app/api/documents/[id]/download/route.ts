import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPrivateFile, ObjectNotFoundError, streamFile } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!doc.fileKey)
    return NextResponse.json({ error: "No file attached" }, { status: 404 });

  const objectPath = doc.fileKey.startsWith("/objects/")
    ? doc.fileKey
    : `/objects/${doc.fileKey.replace(/^\/+/, "")}`;

  try {
    const file = await getPrivateFile(objectPath);
    return await streamFile(file);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("[documents/download] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

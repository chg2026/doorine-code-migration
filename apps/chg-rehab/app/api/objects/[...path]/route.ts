import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrivateFile, ObjectNotFoundError, streamFile } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  // Use getCurrentUser so removed/inactive users with a stale session cookie
  // can't keep pulling private object content after an admin deactivates them.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const objectPath = "/objects/" + path.join("/");

  try {
    const file = await getPrivateFile(objectPath);
    return await streamFile(file);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[objects] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

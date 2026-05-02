import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUploadUrl } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  // Use getCurrentUser so removed/inactive users with a stale session cookie
  // can't keep minting upload URLs after an admin deactivates them.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uploadUrl, objectPath } = await getUploadUrl();
    return NextResponse.json({ uploadUrl, objectPath, method: "PUT" });
  } catch (err) {
    console.error("[uploads/request-url] error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload URL failed" },
      { status: 500 }
    );
  }
}

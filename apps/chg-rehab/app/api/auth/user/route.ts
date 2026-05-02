import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  // Resolve through getCurrentUser so removed/inactive users are reported as
  // logged-out (the helper also clears the stale session cookie), keeping
  // client UI in sync with the server's authorization decisions.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}

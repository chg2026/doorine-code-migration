import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Investor signup — wired up in Phase 2 once invite tokens land. Phase 1
 * stub returns 501 with a clear message.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Investor signup is not yet enabled. Phase 2 will accept invite tokens here.",
    },
    { status: 501 }
  );
}

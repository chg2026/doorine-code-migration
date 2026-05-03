import { NextResponse } from "next/server";
import { getCurrentInvestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const investor = await getCurrentInvestor();
  if (!investor) {
    return NextResponse.json({ investor: null, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ investor });
}

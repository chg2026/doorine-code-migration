import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let dbError: string | undefined;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; }
  catch (err) { dbError = err instanceof Error ? err.message : String(err); }
  const supabaseConfigured = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const healthy = dbOk && supabaseConfigured;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: { database: dbOk ? "up" : "down", ...(dbError ? { databaseError: dbError } : {}), supabaseAuth: supabaseConfigured ? "configured" : "missing" },
    },
    { status: healthy ? 200 : 503 }
  );
}

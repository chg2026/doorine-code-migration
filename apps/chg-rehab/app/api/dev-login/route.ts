import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Dev-only quick-login. Mints a session for a seeded user so local smoke
 * tests can exercise auth-gated pages without going through the OIDC flow.
 *
 * Hardened gating (must satisfy ALL three to be enabled):
 *   1. process.env.NODE_ENV must NOT be "production"
 *   2. process.env.DEV_LOGIN_ENABLED must be "1"  (opt-in, off by default)
 *   3. The User-Agent header must be present (blocks naive crawlers)
 *
 * Usage: GET /api/dev-login?as=seed-user-roey&next=/rehab/CHG-2247/checklist
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  if (process.env.DEV_LOGIN_ENABLED !== "1") {
    return NextResponse.json(
      { error: "disabled — set DEV_LOGIN_ENABLED=1 to opt in" },
      { status: 404 }
    );
  }
  if (!req.headers.get("user-agent")) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const userId = req.nextUrl.searchParams.get("as") || "seed-user-roey";
  const next = req.nextUrl.searchParams.get("next") || "/";
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) {
    return NextResponse.json({ error: `no such user: ${userId}` }, { status: 404 });
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dev login</title><meta http-equiv="refresh" content="0; url=${next}"><script>setTimeout(function(){location.replace(${JSON.stringify(next)})},50);</script></head><body style="font-family:system-ui;padding:24px;color:#444">Dev session minted for ${u.firstName ?? u.email ?? "user"}. Redirecting…</body></html>`;
  const res = new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  session.user = {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    profileImageUrl: u.profileImageUrl,
    role: u.role,
    companyId: u.companyId,
  };
  await session.save();
  return res;
}

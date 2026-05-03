import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

function errorPage(message: string) {
  const safe = message.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Invite</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;max-width:420px;box-shadow:0 4px 12px rgba(15,23,42,.06)}.t{font-size:16px;font-weight:600;margin-bottom:8px}.m{font-size:13px;color:#475569;line-height:1.5}.a{display:inline-block;margin-top:16px;padding:8px 14px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;font-size:13px}</style></head><body><div class="card"><div class="t">Invite link unavailable</div><div class="m">${safe}</div><a class="a" href="/">Back to home</a></div></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return errorPage("This invite link is missing its token.");

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return errorPage("This invite link is not valid.");
  if (invite.status === "Accepted")
    return errorPage("This invite has already been accepted.");
  if (invite.status === "Revoked")
    return errorPage("This invite was revoked by an admin.");
  if (invite.expiresAt.getTime() <= Date.now()) {
    if (invite.status === "Pending") {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "Expired" },
      });
    }
    return errorPage("This invite has expired. Ask an admin to send a new one.");
  }

  // Stash the token on the session and bounce through normal login.
  const res = NextResponse.redirect(publicUrl(req, "/login?next=/admin"));
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  session.pendingInviteToken = token;
  await session.save();
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { getOidcConfig, openidClient, publicUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const homeUrl = publicUrl(req, "/");

  let endSessionUrl = homeUrl;
  try {
    const config = await getOidcConfig();
    const url = openidClient.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID || "",
      post_logout_redirect_uri: homeUrl,
    });
    endSessionUrl = url.href;
  } catch (err) {
    console.error("[logout] failed to build end session url", err);
  }

  const res = NextResponse.redirect(endSessionUrl);
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  session.destroy();
  return res;
}

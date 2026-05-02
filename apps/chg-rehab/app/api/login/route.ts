import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { getOidcConfig, openidClient, buildCallbackUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") || "/";
  const callbackUrl = buildCallbackUrl(req);

  const config = await getOidcConfig();
  const codeVerifier = openidClient.randomPKCECodeVerifier();
  const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
  const state = openidClient.randomState();

  const authUrl = openidClient.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
  });

  const res = NextResponse.redirect(authUrl.href);
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  session.oidc = { state, codeVerifier, redirectAfter: next, callbackUrl };
  await session.save();
  console.log("[auth/login] redirecting to OIDC", { callbackUrl, next });
  return res;
}

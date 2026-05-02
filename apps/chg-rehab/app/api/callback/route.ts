import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";
import { getOidcConfig, openidClient, upsertUserFromClaims, publicUrl } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tempRes = NextResponse.next();
  const session = await getIronSession<AppSession>(req, tempRes, sessionOptions);

  if (!session.oidc) {
    return NextResponse.redirect(publicUrl(req, "/login?error=no_state"));
  }

  const { state, codeVerifier, redirectAfter, callbackUrl } = session.oidc;

  try {
    const config = await getOidcConfig();
    // Build the absolute current URL using the *registered* redirect_uri host,
    // because openid-client validates the redirect_uri exactly. Behind the
    // Replit proxy `req.url` would otherwise be `https://0.0.0.0:5000/...`.
    const cbUrl = new URL(callbackUrl);
    const queryString = req.nextUrl.search; // includes leading '?' or ''
    const currentUrl = new URL(cbUrl.pathname + queryString, cbUrl.origin);

    const tokens = await openidClient.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    });

    const claims = (typeof (tokens as any).claims === "function"
      ? (tokens as any).claims()
      : (tokens as any).claims) as Record<string, any>;

    if (!claims?.sub) {
      throw new Error("OIDC tokens did not include a subject claim");
    }

    const user = await upsertUserFromClaims(
      {
        sub: claims.sub,
        email: claims.email,
        first_name: claims.first_name,
        last_name: claims.last_name,
        profile_image_url: claims.profile_image_url,
      },
      { inviteToken: session.pendingInviteToken }
    );

    const expiresIn =
      (tokens as any).expiresIn?.() ?? (tokens as any).expires_in ?? undefined;

    const res = NextResponse.redirect(publicUrl(req, redirectAfter || "/"));
    const finalSession = await getIronSession<AppSession>(req, res, sessionOptions);
    finalSession.user = user;
    finalSession.tokens = {
      access_token: tokens.access_token,
      refresh_token: (tokens as any).refresh_token,
      id_token: (tokens as any).id_token,
      expires_at: expiresIn ? Math.floor(Date.now() / 1000) + Number(expiresIn) : undefined,
    };
    finalSession.oidc = undefined;
    finalSession.pendingInviteToken = undefined;
    await finalSession.save();
    console.log("[auth/callback] login success", { sub: claims.sub, email: claims.email });
    return res;
  } catch (err) {
    console.error("[auth/callback] error", err);
    const msg = err instanceof Error ? err.message : "unknown";
    const url = publicUrl(req, `/login?error=${encodeURIComponent(msg).slice(0, 200)}`);
    return NextResponse.redirect(url);
  }
}

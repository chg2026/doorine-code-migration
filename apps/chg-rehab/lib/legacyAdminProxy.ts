import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "./supabaseServer";

/**
 * Base URL of the shared Express server that hosts /api/admin/* (the
 * legacy CRM backend). In dev it runs in the same Replit project on
 * port 5000; in production it sits behind the same hostname so we expose
 * an env override for explicit configuration.
 */
function legacyBaseUrl(): string {
  const explicit = process.env.LEGACY_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "http://localhost:8080";
}

/**
 * Forward a chg-rehab Next.js request to the shared Express
 * `/api/admin/*` backend, attaching the user's Supabase access token as
 * a Bearer credential so the Express `requireSuperAdmin` middleware can
 * authorize it.
 *
 * `subpath` MUST start with "/" (e.g. "/stats", "/accounts/abc").
 *
 * The proxy intentionally mirrors status, JSON body, and content-type
 * back to the caller. Network failures surface as 502 with a generic
 * message — never leak the upstream URL to the client.
 */
export async function proxyLegacyAdmin(
  req: NextRequest,
  subpath: string
): Promise<NextResponse> {
  if (!subpath.startsWith("/")) {
    return NextResponse.json({ error: "invalid proxy path" }, { status: 500 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = legacyBaseUrl() + "/api/admin" + subpath + (req.nextUrl.search || "");

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
    const text = await req.text();
    if (text) init.body = text;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (e) {
    console.error("[super-admin proxy] upstream fetch failed:", (e as Error).message);
    return NextResponse.json(
      { error: "Admin backend unreachable." },
      { status: 502 }
    );
  }

  const buf = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") || "application/json";
  return new NextResponse(buf, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}

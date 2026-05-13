import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export const GOLD_BRIDGE_API_BASE = "https://rei-code-dev.replit.app";

export async function goldBridgeFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authHeaders: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const res = await fetch(`${GOLD_BRIDGE_API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      detail = j.error || j.message || "";
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* noop */
      }
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

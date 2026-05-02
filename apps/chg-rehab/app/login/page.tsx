import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next || "/";

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">CHG</div>
          <div className="login-title">
            CHG <span>Rehab</span>
          </div>
        </div>
        <div className="login-sub">Operations platform — sign in to continue</div>

        {sp.error ? (
          <div className="login-error">Sign-in failed ({sp.error}). Please try again.</div>
        ) : null}

        <Link href={`/api/login?next=${encodeURIComponent(next)}`} className="login-cta">
          Sign in with Replit
        </Link>

        <div className="login-foot">
          Single sign-on via Replit. New users get a fresh workspace on first login.
        </div>
      </div>
    </div>
  );
}

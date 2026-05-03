export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-brand">
              <div className="login-mark" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Vestry Capital</span>
            </div>
            <div className="login-headline">Almost there.</div>
            <div className="login-tag">
              Investor signup is wired up in Phase 2 — your invite link will
              walk you through verification, password setup, and document
              acknowledgement.
            </div>
          </div>
          <div className="login-foot-left">© 2026 Vestry Capital</div>
        </div>
        <div className="login-right">
          <div className="login-title">Signup coming soon</div>
          <div className="login-sub">
            {sp.token
              ? "Your invite token has been received. Check back shortly."
              : "Use the invite link your operator sent you."}
          </div>
          <a href="/login" className="login-cta" style={{ display: "block" }}>
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

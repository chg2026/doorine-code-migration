import SignupClient from "./SignupClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const token = (sp.token || "").trim();
  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 460 }}>
          <div className="login-right">
            <div className="login-title">Invite required</div>
            <div className="login-sub">The contractor portal is invite-only. Ask the operator or trade who referred you to send a magic-link invite.</div>
          </div>
        </div>
      </div>
    );
  }
  const invite = await prisma.cpOnboardingInvite.findUnique({
    where: { token },
    include: {
      inviterCompany: { select: { name: true } },
      inviterAccount: { select: { contactName: true, companyName: true } },
    },
  });
  if (!invite) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 460 }}>
          <div className="login-right">
            <div className="login-title">Invite not found</div>
            <div className="login-sub">This invitation link is invalid. Ask whoever invited you to send a fresh link.</div>
          </div>
        </div>
      </div>
    );
  }
  if (invite.consumedAt) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 460 }}>
          <div className="login-right">
            <div className="login-title">Invite already used</div>
            <div className="login-sub">This invitation has already been claimed. <a href="/login" style={{ color: "var(--coral)" }}>Sign in instead</a>.</div>
          </div>
        </div>
      </div>
    );
  }
  const inviterName = invite.inviterCompany?.name || invite.inviterAccount?.companyName || invite.inviterAccount?.contactName || "Your operator";
  return <SignupClient token={token} email={invite.email} contactName={invite.contactName || ""} companyName={invite.companyName || ""} trade={invite.trade || ""} inviterName={inviterName} />;
}

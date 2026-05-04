import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OpOnboardingPage() {
  const c = (await getCurrentContractor())!;
  const invites = await prisma.cpOnboardingInvite.findMany({
    where: { inviterAccountId: c.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <PortalPage title="Onboarding" subtitle="Invite new subs &amp; vendors via magic link">
      <div className="g2" style={{ alignItems: "flex-start" }}>
        <OnboardingForm />
        <div className="card">
          <div className="ctitle" style={{ marginBottom: 8 }}>Recent invites</div>
          <table className="tbl">
            <thead><tr><th>Email</th><th>Trade</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>
              {invites.length === 0 ? <tr><td colSpan={4} className="empty-state">No invites yet.</td></tr> : invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.trade || "—"}</td>
                  <td className="muted">{fmtDate(i.createdAt)}</td>
                  <td><span className={`pill ${i.consumedAt ? "p-teal" : i.expiresAt < new Date() ? "p-red" : "p-amber"}`}>{i.consumedAt ? "claimed" : i.expiresAt < new Date() ? "expired" : "pending"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalPage>
  );
}

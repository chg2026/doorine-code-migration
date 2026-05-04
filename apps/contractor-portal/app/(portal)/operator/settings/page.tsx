import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees, getOperators } from "@/lib/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Operator-lens Settings: surface the operator-specific configuration
 * — account profile (used as the operator identity to subs), the
 * upstream/downstream graph, plan/billing tier, default invitation
 * defaults, and quota usage.
 */
export default async function OperatorSettingsPage() {
  const c = (await getCurrentContractor())!;
  const [invitees, upstream, quota] = await Promise.all([
    getInvitees(c.id),
    getOperators(c.id),
    prisma.cpQuotaUsage.findFirst({
      where: { accountId: c.id },
      orderBy: { yearMonth: "desc" },
    }),
  ]);

  return (
    <PortalPage title="Operator settings" subtitle="Configure how subs see and interact with your operator account">
      <div className="g2">
        <div className="card">
          <div className="chd"><div className="ctitle">Operator identity</div></div>
          <div className="field"><label>Company name (shown to subs)</label><div>{c.companyName}</div></div>
          <div className="field"><label>Operator contact</label><div>{c.contactName} · {c.email}</div></div>
          <div className="field"><label>Trade / specialty</label><div>{c.trade || "—"}</div></div>
          <div className="field"><label>Plan tier</label><div><span className="pill p-coral">{c.planTier}</span></div></div>
        </div>

        <div className="card">
          <div className="chd"><div className="ctitle">Network graph</div></div>
          <div className="field">
            <label>Upstream (who invited you)</label>
            <div>
              {upstream.length === 0 ? <span className="muted">— sole operator (no inviter)</span> :
                upstream.map((u, i) => (
                  <div key={i}>
                    {u.layer1Company ? `L1: ${u.layer1Company.name}` :
                     u.inviter ? `L2: ${u.inviter.companyName}` : "?"}
                  </div>
                ))}
            </div>
          </div>
          <div className="field">
            <label>Downstream (subs you invited)</label>
            <div>{invitees.length} {invitees.length === 1 ? "sub" : "subs"} in your network</div>
          </div>
        </div>

        <div className="card">
          <div className="chd"><div className="ctitle">Free-tier quota</div></div>
          {c.planTier === "free" ? (
            <>
              <div className="field"><label>External quotes this month</label>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {quota?.quotesUsed ?? 0} / 3
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                Quotes sent to recipients <strong>outside</strong> your invited network count
                toward this monthly cap. In-network quotes are unlimited.
              </div>
            </>
          ) : (
            <div className="muted">Unlimited on the {c.planTier} plan.</div>
          )}
        </div>

        <div className="card">
          <div className="chd"><div className="ctitle">Invitation defaults</div></div>
          <div className="field"><label>Magic-link expiry</label><div>14 days</div></div>
          <div className="field"><label>Default invite role</label><div>Sub (L3) under your operator account</div></div>
          <div className="field"><label>Compliance pre-checks</label><div>Required: W-9, COI, License (auto-prompted on signup)</div></div>
        </div>
      </div>
    </PortalPage>
  );
}

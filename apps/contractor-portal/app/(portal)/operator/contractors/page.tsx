import PortalPage from "@/components/PortalPage";
import EmptyState from "@/components/EmptyState";
import { getCurrentContractor } from "@/lib/auth";
import { getInvitees } from "@/lib/scope";
import { initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpContractorsPage() {
  const c = (await getCurrentContractor())!;
  const invitees = await getInvitees(c.id);
  return (
    <PortalPage title="Contractors CRM" subtitle="Subs and vendors in your network" actions={<a className="btn btn-p btn-sm" href="/operator/onboarding">+ Invite contractor</a>}>
      <div className="card">
        {invitees.length === 0 ? (
          <EmptyState
            icon="👷"
            title="No contractors in your network"
            description="Invite subs and vendors to join your portal — they'll be able to receive jobs, submit quotes, and send invoices."
            action={{ label: "+ Invite contractor", href: "/operator/onboarding" }}
          />
        ) : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Trade</th><th>Email</th><th /></tr></thead>
            <tbody>
              {invitees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="av av-s a-blue">{initials(e.contractor.companyName)}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{e.contractor.companyName}</div>
                        <div style={{ fontSize: 10, color: "#6b6a66" }}>{e.contractor.contactName}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.contractor.trade || "—"}</td>
                  <td className="muted">{e.contractor.email}</td>
                  <td><button className="btn btn-sm">Message</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  );
}

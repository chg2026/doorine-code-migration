import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function UpgradePage() {
  return (
    <PortalPage title="Upgrade your plan" subtitle="Unlock unlimited external quotes and more">
      <div className="g3">
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Free</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>Current plan</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>$0<span style={{ fontSize: 11, fontWeight: 500 }}>/mo</span></div>
          <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
            <li>Unlimited in-network quotes</li>
            <li>3 external quotes / month</li>
            <li>Job &amp; invoice tracking</li>
            <li>Compliance document vault</li>
          </ul>
        </div>
        <div className="card" style={{ borderColor: "var(--coral)", borderWidth: 1.5 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "var(--coral-d)" }}>Pro</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>Recommended</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>$29<span style={{ fontSize: 11, fontWeight: 500 }}>/mo</span></div>
          <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
            <li>Everything in Free</li>
            <li>Unlimited external quotes</li>
            <li>Bid invitations &amp; comparison</li>
            <li>Photo storage 10GB</li>
            <li>Priority support</li>
          </ul>
          <button className="btn btn-p btn-full" style={{ marginTop: 14 }}>Upgrade to Pro</button>
        </div>
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Operator</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>For GCs &amp; PMs managing subs</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>$79<span style={{ fontSize: 11, fontWeight: 500 }}>/mo</span></div>
          <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
            <li>Everything in Pro</li>
            <li>Operator lens (manage subs &amp; vendors)</li>
            <li>Bulk compliance reminders</li>
            <li>Approve / reject invoices</li>
          </ul>
          <button className="btn btn-full" style={{ marginTop: 14 }}>Talk to sales</button>
        </div>
      </div>
    </PortalPage>
  );
}

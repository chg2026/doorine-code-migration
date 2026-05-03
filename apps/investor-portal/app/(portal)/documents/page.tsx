import PortalPage from "@/components/PortalPage";
import { getCurrentInvestor } from "@/lib/auth";
import { fmtDate, getInvestorDocuments } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABEL: Record<string, string> = {
  PPM: "PPM",
  Subscription: "Subscription agreement",
  Operating: "Operating agreement",
  K1: "K-1",
  Statement: "Statement",
  Tax: "Tax document",
  Other: "Other",
};

const DOC_TYPE_PILL: Record<string, string> = {
  PPM: "pill-b",
  Subscription: "pill-p",
  Operating: "pill-p",
  K1: "pill-a",
  Statement: "pill-g",
  Tax: "pill-a",
  Other: "pill-gray",
};

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default async function DocumentsPage() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;

  const docs = await getInvestorDocuments(investor.id);

  return (
    <PortalPage
      title="Documents"
      subtitle="PPMs, agreements, statements, and K-1s for your deals"
    >
      {docs.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No documents yet</div>
          Documents shared with you by the operator — PPMs, statements, K-1s,
          and more — will appear here.
        </div>
      ) : (
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Document vault</div>
            <span className="card-sub">
              {docs.length} {docs.length === 1 ? "file" : "files"}
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Document</th>
                <th style={{ width: "18%" }}>Type</th>
                <th style={{ width: "22%" }}>Deal</th>
                <th style={{ width: "12%" }}>Uploaded</th>
                <th style={{ width: "8%" }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="row-title">{d.name}</div>
                    {d.taxYear ? (
                      <div className="row-sub">Tax year {d.taxYear}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`pill ${DOC_TYPE_PILL[d.docType] || "pill-gray"}`}>
                      {DOC_TYPE_LABEL[d.docType] || d.docType}
                    </span>
                  </td>
                  <td>{d.offering ? d.offering.name : "—"}</td>
                  <td>{fmtDate(d.uploadedAt)}</td>
                  <td>{formatBytes(d.sizeBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPage>
  );
}

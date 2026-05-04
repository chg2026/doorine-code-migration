"use client";

import { useMemo, useState } from "react";

type TabId = "overview" | "contractors" | "quotes" | "invoices" | "jobs" | "bids" | "compliance" | "onboarding" | "messages" | "reporting" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contractors", label: "Contractors" },
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "jobs", label: "Jobs" },
  { id: "bids", label: "Bids" },
  { id: "compliance", label: "Compliance" },
  { id: "onboarding", label: "Onboarding" },
  { id: "messages", label: "Messages" },
  { id: "reporting", label: "Reporting" },
  { id: "settings", label: "Settings" },
];

type Thread = { id: string; subject: string; with: string; lastMessageAt: string; lastBody: string | null; lastSender: string | null };
type Settings = { companyId: string; planTier: string; defaultInviteExpiryDays: number; operatorBrandLine: string };

type Contractor = {
  id: string; contactName: string; companyName: string; email: string;
  trade: string | null; planTier: string; status: string;
  invitedSubs: { id: string; contactName: string; companyName: string; email: string; trade: string | null }[];
  activeJobs: number; completeJobs: number;
  pendingQuoteCount: number; pendingInvoiceTotal: number; complianceFlags: number;
};
type Quote = { id: string; number: string; jobName: string; totalAmount: number; status: string; sentAt: string | null; contractorName: string; contractorId: string };
type Invoice = { id: string; number: string; jobName: string; totalAmount: number; status: string; submittedAt: string | null; contractorName: string; contractorId: string };
type Job = { id: string; name: string; subtitle: string | null; trade: string | null; status: string; progressPct: number; contractAmount: number; invoicedAmount: number; paidAmount: number; dueDate: string | null; contractorName: string; contractorId: string };
type Bid = { id: string; jobName: string; trade: string | null; status: string; bidDueAt: string | null; scopeRangeLow: number | null; scopeRangeHigh: number | null; contractorName: string; contractorId: string };
type Doc = { id: string; name: string; docType: string; fileName: string | null; status: string; expiresAt: string | null; contractorName: string; contractorId: string };
type Invite = { id: string; email: string; contactName: string | null; companyName: string | null; trade: string | null; createdAt: string; expiresAt: string; consumedAt: string | null };

export type OperatorLensData = {
  contractors: Contractor[]; quotes: Quote[]; invoices: Invoice[];
  jobs: Job[]; bids: Bid[]; compliance: Doc[]; invites: Invite[];
  threads: Thread[]; settings: Settings;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderTop: "1px solid #f3f4f6", verticalAlign: "middle" };
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", background: "#fafafa", fontWeight: 600 };

export default function OperatorLensClient({ initialTab, data }: { initialTab: string; data: OperatorLensData }) {
  const [tab, setTab] = useState<TabId>((TABS.find((t) => t.id === initialTab)?.id || "overview"));
  const [contractorFilter, setContractorFilter] = useState<string>("all");

  const filteredQuotes = useMemo(
    () => contractorFilter === "all" ? data.quotes : data.quotes.filter((q) => q.contractorId === contractorFilter),
    [contractorFilter, data.quotes],
  );
  const filteredInvoices = useMemo(
    () => contractorFilter === "all" ? data.invoices : data.invoices.filter((i) => i.contractorId === contractorFilter),
    [contractorFilter, data.invoices],
  );
  const filteredJobs = useMemo(
    () => contractorFilter === "all" ? data.jobs : data.jobs.filter((j) => j.contractorId === contractorFilter),
    [contractorFilter, data.jobs],
  );
  const filteredBids = useMemo(
    () => contractorFilter === "all" ? data.bids : data.bids.filter((b) => b.contractorId === contractorFilter),
    [contractorFilter, data.bids],
  );
  const filteredDocs = useMemo(
    () => contractorFilter === "all" ? data.compliance : data.compliance.filter((d) => d.contractorId === contractorFilter),
    [contractorFilter, data.compliance],
  );

  const totalPendingQuotes = data.quotes.filter((q) => q.status === "pending").reduce((s, q) => s + q.totalAmount, 0);
  const totalPendingInvoices = data.invoices.filter((i) => i.status === "pending").reduce((s, i) => s + i.totalAmount, 0);
  const expiringDocs = data.compliance.filter((d) => d.status === "expiring" || d.status === "expired").length;

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Contractor Portal</h1>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 18 }}>
        Operator lens — every contractor that has linked into your CHG operator account through the contractor portal,
        plus the L3 subs they&apos;ve invited.
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", padding: "10px 14px", fontSize: 13,
              cursor: "pointer", color: tab === t.id ? "#D85A30" : "#6b7280",
              fontWeight: tab === t.id ? 600 : 500,
              borderBottom: tab === t.id ? "2px solid #D85A30" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "overview" && tab !== "onboarding" ? (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>Contractor:</label>
          <select
            value={contractorFilter}
            onChange={(e) => setContractorFilter(e.target.value)}
            style={{ padding: "5px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}
          >
            <option value="all">All contractors</option>
            {data.contractors.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </select>
        </div>
      ) : null}

      {tab === "overview" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            <Stat label="Linked contractors" value={String(data.contractors.length)} />
            <Stat label="Pending quotes" value={`${data.quotes.filter((q) => q.status === "pending").length} · ${fmt(totalPendingQuotes)}`} />
            <Stat label="Invoices to pay" value={`${data.invoices.filter((i) => i.status === "pending").length} · ${fmt(totalPendingInvoices)}`} />
            <Stat label="Compliance flags" value={String(expiringDocs)} highlight={expiringDocs > 0} />
          </div>
          <Card title="Recent quote activity">
            <Table headers={["Number", "Job", "Contractor", "Amount", "Status"]} rows={data.quotes.slice(0, 6).map((q) => [
              q.number, q.jobName, q.contractorName, fmt(q.totalAmount), <Pill key="s" status={q.status} />,
            ])} empty="No quotes from your contractors yet." />
          </Card>
          <Card title="Recent invoice activity">
            <Table headers={["Number", "Job", "Contractor", "Amount", "Status"]} rows={data.invoices.slice(0, 6).map((i) => [
              i.number, i.jobName, i.contractorName, fmt(i.totalAmount), <Pill key="s" status={i.status} />,
            ])} empty="No invoices submitted yet." />
          </Card>
        </div>
      ) : null}

      {tab === "contractors" ? (
        <Card title={`Linked contractors (${data.contractors.length})`}>
          <Table headers={["Contractor", "Trade", "Plan", "Active jobs", "Pending quotes", "Pending invoices", "Compliance", "L3 subs"]} rows={data.contractors.map((c) => [
            <div key="c"><div style={{ fontWeight: 600 }}>{c.companyName}</div><div style={{ fontSize: 11, color: "#6b7280" }}>{c.contactName} · {c.email}</div></div>,
            c.trade || "—",
            <Pill key="p" status={c.planTier} />,
            c.activeJobs,
            c.pendingQuoteCount,
            fmt(c.pendingInvoiceTotal),
            <span key="cf" style={{ color: c.complianceFlags > 0 ? "#b91c1c" : "#15803d", fontWeight: 600 }}>{c.complianceFlags > 0 ? `${c.complianceFlags} flag(s)` : "Current"}</span>,
            c.invitedSubs.length === 0 ? "—" : (
              <div key="subs" style={{ fontSize: 11 }}>{c.invitedSubs.map((s) => <div key={s.id}>{s.companyName}</div>)}</div>
            ),
          ])} empty="No contractors have linked yet — send a magic-link invite." />
        </Card>
      ) : null}

      {tab === "quotes" ? (
        <Card title={`Quotes (${filteredQuotes.length})`}>
          <Table headers={["Number", "Contractor", "Job", "Amount", "Status", "Sent"]} rows={filteredQuotes.map((q) => [
            q.number, q.contractorName, q.jobName, fmt(q.totalAmount), <Pill key="s" status={q.status} />,
            q.sentAt ? new Date(q.sentAt).toLocaleDateString() : "—",
          ])} empty="No quotes." />
        </Card>
      ) : null}

      {tab === "invoices" ? (
        <Card title={`Invoices (${filteredInvoices.length})`}>
          <Table headers={["Number", "Contractor", "Job", "Amount", "Status", "Submitted"]} rows={filteredInvoices.map((i) => [
            i.number, i.contractorName, i.jobName, fmt(i.totalAmount), <Pill key="s" status={i.status} />,
            i.submittedAt ? new Date(i.submittedAt).toLocaleDateString() : "—",
          ])} empty="No invoices." />
        </Card>
      ) : null}

      {tab === "jobs" ? (
        <Card title={`Jobs (${filteredJobs.length})`}>
          <Table headers={["Job", "Contractor", "Trade", "Status", "Progress", "Contract", "Invoiced", "Due"]} rows={filteredJobs.map((j) => [
            <div key="n"><div style={{ fontWeight: 600 }}>{j.name}</div><div style={{ fontSize: 11, color: "#6b7280" }}>{j.subtitle}</div></div>,
            j.contractorName, j.trade || "—", <Pill key="s" status={j.status} />,
            <div key="p" style={{ minWidth: 80 }}>
              <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#D85A30", width: `${j.progressPct}%` }} />
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{j.progressPct}%</div>
            </div>,
            fmt(j.contractAmount), fmt(j.invoicedAmount), j.dueDate || "—",
          ])} empty="No jobs awarded to your contractors yet." />
        </Card>
      ) : null}

      {tab === "bids" ? (
        <Card title={`Bid invitations (${filteredBids.length})`}>
          <Table headers={["Job", "Contractor", "Trade", "Range", "Due", "Status"]} rows={filteredBids.map((b) => [
            b.jobName, b.contractorName, b.trade || "—",
            b.scopeRangeLow != null && b.scopeRangeHigh != null ? `${fmt(b.scopeRangeLow)} – ${fmt(b.scopeRangeHigh)}` : "—",
            b.bidDueAt ? new Date(b.bidDueAt).toLocaleDateString() : "—",
            <Pill key="s" status={b.status} />,
          ])} empty="No bid invitations." />
        </Card>
      ) : null}

      {tab === "compliance" ? (
        <Card title={`Compliance documents (${filteredDocs.length})`}>
          <Table headers={["Document", "Type", "Contractor", "File", "Expires", "Status"]} rows={filteredDocs.map((d) => [
            d.name, d.docType, d.contractorName, d.fileName || "—",
            d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—",
            <Pill key="s" status={d.status} />,
          ])} empty="No compliance docs on file." />
        </Card>
      ) : null}

      {tab === "onboarding" ? (
        <Card title={`Onboarding invites (${data.invites.length})`}>
          <Table headers={["Email", "Contact", "Company", "Trade", "Sent", "Expires", "Status"]} rows={data.invites.map((i) => [
            i.email, i.contactName || "—", i.companyName || "—", i.trade || "—",
            new Date(i.createdAt).toLocaleDateString(),
            new Date(i.expiresAt).toLocaleDateString(),
            <Pill key="s" status={i.consumedAt ? "consumed" : new Date(i.expiresAt).getTime() < Date.now() ? "expired" : "open"} />,
          ])} empty="No invites sent yet." />
        </Card>
      ) : null}

      {tab === "messages" ? (
        <Card title={`Operator messages (${data.threads.length})`}>
          <Table headers={["Subject", "With", "Last message", "When"]} rows={data.threads.map((t) => [
            t.subject,
            t.with,
            t.lastSender ? `${t.lastSender}: ${t.lastBody?.slice(0, 80) || ""}` : "—",
            new Date(t.lastMessageAt).toLocaleDateString(),
          ])} empty="No conversations with contractors yet." />
        </Card>
      ) : null}

      {tab === "reporting" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            <Stat label="Contractors in network" value={String(data.contractors.length)} />
            <Stat label="Active jobs" value={String(data.jobs.filter((j) => j.status === "active").length)} />
            <Stat label="Quotes received" value={String(data.quotes.length)} />
            <Stat label="Compliance flags" value={String(data.compliance.filter((d) => d.status !== "current").length)} highlight />
          </div>
          <Card title="Per-contractor performance">
            <Table headers={["Contractor", "Trade", "Active jobs", "Quotes (pending)", "Outstanding $", "Flags"]} rows={data.contractors.map((c) => [
              c.companyName, c.trade || "—", c.activeJobs, c.pendingQuoteCount,
              fmt(c.pendingInvoiceTotal), c.complianceFlags,
            ])} empty="No contractors in your network yet." />
          </Card>
          <Card title="Awarded value by status">
            <Table headers={["Status", "Jobs", "Contract $", "Invoiced $", "Paid $"]} rows={(["upcoming", "active", "complete"] as const).map((status) => {
              const js = data.jobs.filter((j) => j.status === status);
              return [status, js.length, fmt(js.reduce((s, j) => s + j.contractAmount, 0)),
                fmt(js.reduce((s, j) => s + j.invoicedAmount, 0)),
                fmt(js.reduce((s, j) => s + j.paidAmount, 0))];
            })} empty="No jobs to report on yet." />
          </Card>
        </>
      ) : null}

      {tab === "settings" ? (
        <Card title="Operator portal settings">
          <Table headers={["Setting", "Value"]} rows={[
            ["Operator company id", <code key="c">{data.settings.companyId}</code>],
            ["Plan tier", <Pill key="p" status={data.settings.planTier} />],
            ["Default invite expiry", `${data.settings.defaultInviteExpiryDays} days`],
            ["Brand line shown to contractors", data.settings.operatorBrandLine],
          ]} empty="" />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 12 }}>
            These settings drive how the contractor-portal app presents your operator
            identity to L2 / L3 contractors. Edits are managed by the platform team.
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: highlight ? "#b91c1c" : "#111827" }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 14 }}>
      <h2 style={{ fontSize: 14, marginBottom: 12, fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 13, color: "#6b7280", padding: 12 }}>{empty}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{headers.map((h) => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>{cells.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ status }: { status: string }) {
  const palette: Record<string, [string, string]> = {
    pending: ["#fef3c7", "#854f0b"],
    accepted: ["#dcfce7", "#166534"],
    approved: ["#dcfce7", "#166534"],
    paid: ["#dbeafe", "#1e40af"],
    expired: ["#fee2e2", "#991b1b"],
    expiring: ["#fef3c7", "#854f0b"],
    current: ["#dcfce7", "#166534"],
    open: ["#dbeafe", "#1e40af"],
    consumed: ["#e0e7ff", "#3730a3"],
    active: ["#fee2e2", "#D85A30"],
    upcoming: ["#e0e7ff", "#3730a3"],
    complete: ["#dcfce7", "#166534"],
    free: ["#f3f4f6", "#374151"],
    pro: ["#fef3c7", "#854f0b"],
    Active: ["#dcfce7", "#166534"],
    Suspended: ["#fee2e2", "#991b1b"],
    submitted: ["#dbeafe", "#1e40af"],
  };
  const [bg, fg] = palette[status] || ["#f3f4f6", "#374151"];
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: bg, color: fg, fontSize: 11, fontWeight: 600 }}>{status}</span>;
}

"use client";
import { useEffect, useMemo, useState } from "react";

type TabId = "overview" | "accounts" | "users" | "roles" | "products" | "contractor-portal";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "users", label: "Users" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "products", label: "Products" },
  { id: "contractor-portal", label: "Contractor Portal" },
];

const PLANS_BY_PRODUCT: Record<string, string[]> = {
  chg: ["starter", "professional", "enterprise"],
  deallink: ["free", "pro"],
  "investor-portal": ["standard"],
  "contractor-portal": ["free", "pro"],
};
const PRODUCT_LABEL: Record<string, string> = {
  chg: "CHG CRM",
  deallink: "Deal Link",
  "investor-portal": "Investor Portal",
  "contractor-portal": "Contractor Portal",
};
const PRODUCT_SHORT: Record<string, string> = {
  chg: "CHG",
  deallink: "Deal Link",
  "investor-portal": "Investor",
  "contractor-portal": "Contractor",
};

// ── Toast ──────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const show = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  };
  const node = msg ? (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: msg.kind === "ok" ? "#111" : "#7f1d1d",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 6,
        fontSize: 13,
        zIndex: 1000,
        maxWidth: 360,
      }}
    >
      {msg.text}
    </div>
  ) : null;
  return { ok: (t: string) => show("ok", t), err: (t: string) => show("err", t), node };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Top-level component ────────────────────────────────────────────────────
export default function SuperAdminClient({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<TabId>("overview");
  const toast = useToast();

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Super Admin</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        Platform-wide management. Changes here affect every tenant.
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color, #e5e7eb)", marginBottom: 18 }}>
        <nav style={{ display: "flex", gap: 24 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
                  color: active ? "#2563eb" : "var(--text-secondary, #6b7280)",
                  padding: "8px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "overview" && <OverviewTab onError={toast.err} />}
      {tab === "accounts" && (
        <AccountsTab onOk={toast.ok} onError={toast.err} currentUserId={currentUserId} />
      )}
      {tab === "users" && <UsersTab onOk={toast.ok} onError={toast.err} />}
      {tab === "roles" && <RolesTab onOk={toast.ok} onError={toast.err} />}
      {tab === "products" && <ProductsTab onOk={toast.ok} onError={toast.err} />}
      {tab === "contractor-portal" && <ContractorPortalTab onError={toast.err} />}

      {toast.node}
    </div>
  );
}

// ── Reusable bits ──────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = status || "unknown";
  const colors: Record<string, [string, string]> = {
    active: ["#065f46", "#d1fae5"],
    trial: ["#92400e", "#fef3c7"],
    suspended: ["#991b1b", "#fee2e2"],
    cancelled: ["#374151", "#f3f4f6"],
    disabled: ["#374151", "#f3f4f6"],
    unknown: ["#374151", "#f3f4f6"],
    none: ["#374151", "#f3f4f6"],
    read: ["#1e40af", "#dbeafe"],
    write: ["#065f46", "#d1fae5"],
    full: ["#5b21b6", "#ede9fe"],
  };
  const [fg, bg] = colors[s] || colors.unknown;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        color: fg,
        background: bg,
        textTransform: "capitalize",
      }}
    >
      {s}
    </span>
  );
}

function Spinner() {
  return <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Loading…</div>;
}

function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
      <div style={{ fontWeight: 500, color: "#111827", marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 13 }}>{description}</div>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 480, width: "90%" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#374151" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn"
            style={{
              background: danger ? "#dc2626" : "#2563eb",
              color: "#fff",
              borderColor: danger ? "#dc2626" : "#2563eb",
            }}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
};
const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: "#2563eb",
  color: "#fff",
  borderColor: "#2563eb",
};
const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 500,
  color: "#6b7280",
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
};
const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#9ca3af",
  cursor: "pointer",
  padding: 4,
  fontSize: 12,
};

// ── Overview ───────────────────────────────────────────────────────────────
type Stats = {
  total_accounts: number;
  total_users: number;
  active_accounts: number;
  recent_accounts: number;
};

function OverviewTab({ onError }: { onError: (t: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<Stats>("/api/super-admin/stats")
      .then(setStats)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
      <StatCard label="Total Accounts" value={stats?.total_accounts ?? 0} />
      <StatCard label="Total Users" value={stats?.total_users ?? 0} />
      <StatCard label="Active Accounts" value={stats?.active_accounts ?? 0} />
      <StatCard label="New (30 days)" value={stats?.recent_accounts ?? 0} />
    </div>
  );
}

// ── Accounts ───────────────────────────────────────────────────────────────
type AccountEntitlement = {
  product_code: string;
  product_name?: string;
  plan: string;
  status: string;
  started_at?: string | null;
  disabled_at?: string | null;
};
type AccountRow = {
  id: string;
  name: string;
  status: string;
  billing_email: string | null;
  plan_tier: string | null;
  user_count: number;
  created_at: string;
  entitlements: AccountEntitlement[];
};

function AccountsTab({
  onOk,
  onError,
  currentUserId,
}: {
  onOk: (t: string) => void;
  onError: (t: string) => void;
  currentUserId: string;
}) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editAccount, setEditAccount] = useState<Partial<AccountRow> | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<AccountRow | null>(null);
  const [entAccount, setEntAccount] = useState<AccountRow | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<AccountRow[]>("/api/super-admin/accounts")
      .then(setAccounts)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = accounts.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.billing_email || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const handleSave = async (form: Partial<AccountRow>) => {
    try {
      if (editAccount?.id) {
        await apiFetch(`/api/super-admin/accounts/${editAccount.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        onOk("Account updated");
      } else {
        await apiFetch("/api/super-admin/accounts", { method: "POST", body: JSON.stringify(form) });
        onOk("Account created");
      }
      setEditAccount(null);
      load();
    } catch (e: any) {
      onError(e.message || "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    try {
      await apiFetch(`/api/super-admin/accounts/${deleteAccount.id}`, { method: "DELETE" });
      onOk("Account deleted");
      setDeleteAccount(null);
      load();
    } catch (e: any) {
      onError(e.message || "Delete failed");
    }
  };

  const handleSuspend = async (account: AccountRow) => {
    const next = account.status === "suspended" ? "active" : "suspended";
    try {
      await apiFetch(`/api/super-admin/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      onOk(`Account ${next}`);
      load();
    } catch (e: any) {
      onError(e.message || "Action failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 260 }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={() => setEditAccount({})} style={btnPrimary}>
          + New Account
        </button>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty title="No accounts found" description="Create your first client account to get started." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Products</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Users</th>
                  <th style={thStyle}>Created</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500, color: "#111827" }}>{a.name}</div>
                      {a.billing_email && (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{a.billing_email}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textTransform: "capitalize" }}>{a.plan_tier || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(a.entitlements || []).filter((e) => e.status === "active").length === 0 && (
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>None</span>
                        )}
                        {(a.entitlements || [])
                          .filter((e) => e.status === "active")
                          .map((e) => (
                            <span
                              key={e.product_code}
                              title={`${PRODUCT_SHORT[e.product_code] || e.product_code} · ${e.plan}`}
                              style={{
                                display: "inline-block",
                                padding: "1px 8px",
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#1e40af",
                                background: "#dbeafe",
                              }}
                            >
                              {PRODUCT_SHORT[e.product_code] || e.product_code}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={a.status} />
                    </td>
                    <td style={tdStyle}>{a.user_count ?? 0}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        <button onClick={() => setEntAccount(a)} title="Manage entitlements" style={iconBtn}>
                          🔑
                        </button>
                        <button onClick={() => setEditAccount(a)} title="Edit" style={iconBtn}>
                          ✎
                        </button>
                        <button
                          onClick={() => handleSuspend(a)}
                          title={a.status === "suspended" ? "Reactivate" : "Suspend"}
                          style={iconBtn}
                        >
                          ⏸
                        </button>
                        <button onClick={() => setDeleteAccount(a)} title="Delete" style={{ ...iconBtn, color: "#ef4444" }}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editAccount !== null && (
        <AccountFormModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSave={handleSave}
        />
      )}
      {deleteAccount && (
        <ConfirmModal
          title="Delete Account"
          message={`Delete "${deleteAccount.name}"? This removes all users and data.`}
          confirmLabel="Delete Account"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteAccount(null)}
        />
      )}
      {entAccount && (
        <EntitlementsPanel
          account={entAccount}
          onClose={() => setEntAccount(null)}
          onChanged={load}
          onOk={onOk}
          onError={onError}
        />
      )}
    </div>
  );
}

function AccountFormModal({
  account,
  onClose,
  onSave,
}: {
  account: Partial<AccountRow>;
  onClose: () => void;
  onSave: (form: any) => Promise<void>;
}) {
  const isEdit = !!account?.id;
  const [form, setForm] = useState({
    name: account?.name || "",
    plan_tier: account?.plan_tier || "starter",
    status: account?.status || "active",
    billing_email: account?.billing_email || "",
  });
  const [saving, setSaving] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 520, width: "90%" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          {isEdit ? "Edit Account" : "New Account"}
        </h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            await onSave(form);
            setSaving(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
            Account Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
              Plan Tier
              <select
                value={form.plan_tier}
                onChange={(e) => setForm((f) => ({ ...f, plan_tier: e.target.value }))}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
          <label style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
            Billing Email
            <input
              type="email"
              value={form.billing_email}
              onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" onClick={onClose} style={btnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Entitlements panel (slide-over) ────────────────────────────────────────
type EntitlementRow = {
  account_id: string;
  product_code: string;
  product_name?: string;
  plan: string;
  status: "active" | "disabled";
  started_at?: string | null;
  disabled_at?: string | null;
};

function EntitlementsPanel({
  account,
  onClose,
  onChanged,
  onOk,
  onError,
}: {
  account: AccountRow;
  onClose: () => void;
  onChanged: () => void;
  onOk: (t: string) => void;
  onError: (t: string) => void;
}) {
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<EntitlementRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch<EntitlementRow[]>(`/api/super-admin/accounts/${account.id}/entitlements`)
      .then(setEntitlements)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (account?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const grantable = useMemo(
    () =>
      Object.keys(PLANS_BY_PRODUCT).filter((code) => {
        const ent = entitlements.find((e) => e.product_code === code);
        return !ent || ent.status === "disabled";
      }),
    [entitlements]
  );

  const handleGrant = async ({ product_code, plan }: { product_code: string; plan: string }) => {
    try {
      await apiFetch(`/api/super-admin/accounts/${account.id}/entitlements`, {
        method: "POST",
        body: JSON.stringify({ product_code, plan }),
      });
      onOk(`Granted ${PRODUCT_LABEL[product_code] || product_code} (${plan})`);
      setShowGrant(false);
      load();
      onChanged();
    } catch (e: any) {
      onError(e.message || "Grant failed");
    }
  };

  const handlePlanChange = async (product_code: string, plan: string) => {
    try {
      await apiFetch(`/api/super-admin/accounts/${account.id}/entitlements/${product_code}`, {
        method: "PATCH",
        body: JSON.stringify({ plan }),
      });
      onOk("Plan updated");
      load();
      onChanged();
    } catch (e: any) {
      onError(e.message || "Plan change failed");
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/super-admin/accounts/${account.id}/entitlements/${revokeTarget.product_code}`, {
        method: "DELETE",
      });
      onOk(`Revoked ${PRODUCT_LABEL[revokeTarget.product_code] || revokeTarget.product_code}`);
      setRevokeTarget(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(e.message || "Revoke failed");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 800,
          width: "92%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Entitlements</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{account.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={iconBtn}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0" }}>
          <button
            onClick={() => setShowGrant(true)}
            disabled={grantable.length === 0}
            style={{ ...btnPrimary, opacity: grantable.length === 0 ? 0.5 : 1 }}
            title={grantable.length === 0 ? "All products are already active for this account" : ""}
          >
            + Grant Entitlement
          </button>
        </div>

        <Card>
          {loading ? (
            <Spinner />
          ) : entitlements.length === 0 ? (
            <Empty title="No entitlements yet" description="Grant CHG or Deal Link access to give this account's users a product." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Product</th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Started</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entitlements.map((e) => {
                    const isActive = e.status === "active";
                    const plans = PLANS_BY_PRODUCT[e.product_code] || [];
                    return (
                      <tr key={e.product_code}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500, color: "#111827" }}>
                            {PRODUCT_LABEL[e.product_code] || e.product_name || e.product_code}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>{e.product_code}</div>
                        </td>
                        <td style={tdStyle}>
                          {isActive && plans.length > 0 ? (
                            <select
                              value={e.plan}
                              onChange={(ev) => handlePlanChange(e.product_code, ev.target.value)}
                              style={{ ...inputStyle, width: 160, textTransform: "capitalize" }}
                            >
                              {plans.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ textTransform: "capitalize", color: "#6b7280" }}>{e.plan}</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge status={e.status} />
                        </td>
                        <td style={{ ...tdStyle, color: "#6b7280" }}>
                          {e.started_at ? new Date(e.started_at).toLocaleDateString() : "—"}
                          {!isActive && e.disabled_at && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              revoked {new Date(e.disabled_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {isActive ? (
                            <button
                              onClick={() => setRevokeTarget(e)}
                              style={{ ...btnStyle, color: "#dc2626", borderColor: "#fecaca" }}
                            >
                              Revoke
                            </button>
                          ) : (
                            <button onClick={() => setShowGrant(true)} style={{ ...btnStyle, color: "#2563eb" }}>
                              Re-grant
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={btnStyle}>
            Close
          </button>
        </div>
      </div>

      {showGrant && (
        <GrantModal
          grantable={grantable}
          existing={entitlements}
          onCancel={() => setShowGrant(false)}
          onSubmit={handleGrant}
        />
      )}
      {revokeTarget && (
        <ConfirmModal
          title="Revoke entitlement"
          message={`Revoke ${PRODUCT_LABEL[revokeTarget.product_code] || revokeTarget.product_code} access for "${account.name}"? Users in this account will lose access immediately. This is reversible.`}
          confirmLabel="Revoke"
          danger
          loading={revoking}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}

function GrantModal({
  grantable,
  existing,
  onCancel,
  onSubmit,
}: {
  grantable: string[];
  existing: EntitlementRow[];
  onCancel: () => void;
  onSubmit: (v: { product_code: string; plan: string }) => Promise<void>;
}) {
  const initial = grantable[0] || "chg";
  const [productCode, setProductCode] = useState(initial);
  const [plan, setPlan] = useState((PLANS_BY_PRODUCT[initial] || [])[0] || "");
  const [saving, setSaving] = useState(false);
  const plans = PLANS_BY_PRODUCT[productCode] || [];
  const priorDisabled = existing.find((e) => e.product_code === productCode && e.status === "disabled");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 440, width: "92%" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Grant Entitlement</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            await onSubmit({ product_code: productCode, plan });
            setSaving(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Product
            <select
              value={productCode}
              onChange={(e) => {
                setProductCode(e.target.value);
                setPlan((PLANS_BY_PRODUCT[e.target.value] || [])[0] || "");
              }}
              style={{ ...inputStyle, marginTop: 4 }}
            >
              {grantable.map((code) => (
                <option key={code} value={code}>
                  {PRODUCT_LABEL[code] || code}
                </option>
              ))}
            </select>
            {priorDisabled && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Previously revoked on {new Date(priorDisabled.disabled_at!).toLocaleDateString()} —
                granting will reactivate.
              </div>
            )}
          </label>
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Plan
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              style={{ ...inputStyle, marginTop: 4, textTransform: "capitalize" }}
            >
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onCancel} style={btnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !plan} style={btnPrimary}>
              {saving ? "Granting…" : "Grant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────────────────
type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string | null;
  is_super_admin: boolean | null;
  is_account_admin: boolean | null;
  last_login: string | null;
  role_name: string | null;
  account_name: string | null;
  account_id: string | null;
  role_id: string | null;
  created_at: string;
};

function UsersTab({ onOk, onError }: { onOk: (t: string) => void; onError: (t: string) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [newUser, setNewUser] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<UserRow[]>("/api/super-admin/users")
      .then(setUsers)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = users.filter(
    (u) =>
      !search ||
      (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      await apiFetch(`/api/super-admin/users/${deleteUser.id}`, { method: "DELETE" });
      onOk("User deleted");
      setDeleteUser(null);
      load();
    } catch (e: any) {
      onError(e.message || "Delete failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <button onClick={() => setNewUser(true)} style={btnPrimary}>
          + New User
        </button>
      </div>
      <Card>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty title="No users found" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Account</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Last Login</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{u.full_name || "—"}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>{u.email}</td>
                    <td style={tdStyle}>{u.role_name || "—"}</td>
                    <td style={tdStyle}>{u.account_name || "—"}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={u.status || undefined} />
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => setEditUser(u)} title="Edit" style={iconBtn}>
                        ✎
                      </button>
                      <button onClick={() => setDeleteUser(u)} title="Delete" style={{ ...iconBtn, color: "#ef4444" }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(editUser || newUser) && (
        <UserFormModal
          user={editUser}
          onClose={() => {
            setEditUser(null);
            setNewUser(false);
          }}
          onSaved={() => {
            setEditUser(null);
            setNewUser(false);
            load();
          }}
          onOk={onOk}
          onError={onError}
        />
      )}
      {deleteUser && (
        <ConfirmModal
          title="Delete User"
          message={`Delete ${deleteUser.full_name || deleteUser.email}? This removes their auth account and profile.`}
          confirmLabel="Delete User"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteUser(null)}
        />
      )}
    </div>
  );
}

function UserFormModal({
  user,
  onClose,
  onSaved,
  onOk,
  onError,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
  onOk: (t: string) => void;
  onError: (t: string) => void;
}) {
  const isEdit = !!user;
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; account_id: string | null }[]>([]);
  const [form, setForm] = useState({
    email: user?.email || "",
    password: "",
    full_name: user?.full_name || "",
    account_id: user?.account_id || "",
    role_id: user?.role_id || "",
    is_account_admin: !!user?.is_account_admin,
    status: user?.status || "active",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<AccountRow[]>("/api/super-admin/accounts"),
      apiFetch<{ id: string; name: string; account_id: string | null }[]>("/api/super-admin/roles"),
    ])
      .then(([a, r]) => {
        setAccounts(a.map((x) => ({ id: x.id, name: x.name })));
        setRoles(r);
      })
      .catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligibleRoles = roles.filter(
    (r) => !r.account_id || r.account_id === form.account_id
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 520, width: "90%" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          {isEdit ? "Edit User" : "New User"}
        </h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              if (isEdit) {
                await apiFetch(`/api/super-admin/users/${user!.id}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    full_name: form.full_name,
                    role_id: form.role_id || null,
                    status: form.status,
                    is_account_admin: form.is_account_admin,
                  }),
                });
                onOk("User updated");
              } else {
                await apiFetch("/api/super-admin/users", {
                  method: "POST",
                  body: JSON.stringify(form),
                });
                onOk("User created");
              }
              onSaved();
            } catch (e: any) {
              onError(e.message || "Save failed");
            } finally {
              setSaving(false);
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Email
            <input
              required
              type="email"
              disabled={isEdit}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          {!isEdit && (
            <label style={{ fontSize: 12, fontWeight: 500 }}>
              Password
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
          )}
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Full Name
            <input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Account
            <select
              required
              disabled={isEdit}
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value, role_id: "" }))}
              style={{ ...inputStyle, marginTop: 4 }}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Role
            <select
              value={form.role_id}
              onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4 }}
            >
              <option value="">No role</option>
              {eligibleRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.account_id ? "" : "(System)"}
                </option>
              ))}
            </select>
          </label>
          {isEdit && (
            <label style={{ fontSize: 12, fontWeight: 500 }}>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          )}
          <label style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_account_admin}
              onChange={(e) => setForm((f) => ({ ...f, is_account_admin: e.target.checked }))}
            />
            Account Admin (can manage their tenant)
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" onClick={onClose} style={btnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Roles ──────────────────────────────────────────────────────────────────
const DEPTS = ["acquisitions", "construction", "property_management", "contractors", "finance", "tasks"];

type RolePermission = { department: string; permission_level: string };
type RoleRow = {
  id: string;
  name: string;
  account_id: string | null;
  account_name: string | null;
  permissions: RolePermission[];
};

function RolesTab({ onOk, onError }: { onOk: (t: string) => void; onError: (t: string) => void }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [newRole, setNewRole] = useState(false);
  const [deleteRole, setDeleteRole] = useState<RoleRow | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<RoleRow[]>("/api/super-admin/roles"),
      apiFetch<AccountRow[]>("/api/super-admin/accounts"),
    ])
      .then(([r, a]) => {
        setRoles(r);
        setAccounts(a.map((x) => ({ id: x.id, name: x.name })));
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleteRole) return;
    try {
      await apiFetch(`/api/super-admin/roles/${deleteRole.id}`, { method: "DELETE" });
      onOk("Role deleted");
      setDeleteRole(null);
      load();
    } catch (e: any) {
      onError(e.message || "Delete failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setNewRole(true)} style={btnPrimary}>
          + New Role
        </button>
      </div>
      <Card>
        {loading ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <Empty title="No roles configured" description="Create roles to assign department-level permissions." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Account</th>
                  {DEPTS.map((d) => (
                    <th key={d} style={{ ...thStyle, textAlign: "center", textTransform: "capitalize" }}>
                      {d.replace(/_/g, " ")}
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{r.name}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>{r.account_name || "System"}</td>
                    {DEPTS.map((d) => {
                      const perm = (r.permissions || []).find((p) => p.department === d);
                      return (
                        <td key={d} style={{ ...tdStyle, textAlign: "center" }}>
                          <StatusBadge status={perm?.permission_level || "none"} />
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => setEditRole(r)} title="Edit" style={iconBtn}>
                        ✎
                      </button>
                      <button onClick={() => setDeleteRole(r)} title="Delete" style={{ ...iconBtn, color: "#ef4444" }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(editRole || newRole) && (
        <RoleFormModal
          role={editRole}
          accounts={accounts}
          onClose={() => {
            setEditRole(null);
            setNewRole(false);
          }}
          onSaved={() => {
            setEditRole(null);
            setNewRole(false);
            load();
          }}
          onOk={onOk}
          onError={onError}
        />
      )}
      {deleteRole && (
        <ConfirmModal
          title="Delete Role"
          message={`Delete role "${deleteRole.name}"? Users assigned to this role must be reassigned first.`}
          confirmLabel="Delete Role"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteRole(null)}
        />
      )}
    </div>
  );
}

const PERM_LEVELS = ["none", "read", "write", "full"];

function RoleFormModal({
  role,
  accounts,
  onClose,
  onSaved,
  onOk,
  onError,
}: {
  role: RoleRow | null;
  accounts: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onOk: (t: string) => void;
  onError: (t: string) => void;
}) {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || "");
  const [accountId, setAccountId] = useState<string | null>(role?.account_id ?? null);
  const initialPerms: Record<string, string> = {};
  for (const d of DEPTS) {
    initialPerms[d] = role?.permissions.find((p) => p.department === d)?.permission_level || "none";
  }
  const [perms, setPerms] = useState<Record<string, string>>(initialPerms);
  const [saving, setSaving] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 600, width: "92%" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          {isEdit ? "Edit Role" : "New Role"}
        </h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const permissions = DEPTS.map((d) => ({ department: d, permission_level: perms[d] || "none" }));
              if (isEdit) {
                await apiFetch(`/api/super-admin/roles/${role!.id}`, {
                  method: "PUT",
                  body: JSON.stringify({ name, permissions }),
                });
                onOk("Role updated");
              } else {
                await apiFetch("/api/super-admin/roles", {
                  method: "POST",
                  body: JSON.stringify({ name, account_id: accountId || null, permissions }),
                });
                onOk("Role created");
              }
              onSaved();
            } catch (e: any) {
              onError(e.message || "Save failed");
            } finally {
              setSaving(false);
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={{ fontSize: 12, fontWeight: 500 }}>
            Role Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          {!isEdit && (
            <label style={{ fontSize: 12, fontWeight: 500 }}>
              Scope
              <select
                value={accountId || ""}
                onChange={(e) => setAccountId(e.target.value || null)}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="">System (all accounts)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Department Permissions</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {DEPTS.map((d) => (
                <label key={d} style={{ fontSize: 12, color: "#374151" }}>
                  <span style={{ textTransform: "capitalize" }}>{d.replace(/_/g, " ")}</span>
                  <select
                    value={perms[d]}
                    onChange={(e) => setPerms((p) => ({ ...p, [d]: e.target.value }))}
                    style={{ ...inputStyle, marginTop: 4 }}
                  >
                    {PERM_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" onClick={onClose} style={btnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Products ───────────────────────────────────────────────────────────────
type ProductRow = {
  id: string;
  code: string;
  name: string;
  brand_domain: string | null;
  status: string;
};

function ProductsTab({ onOk, onError }: { onOk: (t: string) => void; onError: (t: string) => void }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<ProductRow[]>("/api/super-admin/products")
      .then((data) => {
        setProducts(data);
        const next: Record<string, string> = {};
        for (const p of data) next[p.code] = p.brand_domain || "";
        setDrafts(next);
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (code: string) => {
    setSavingCode(code);
    try {
      const value = (drafts[code] || "").trim();
      await apiFetch(`/api/super-admin/products/${code}`, {
        method: "PATCH",
        body: JSON.stringify({ brand_domain: value || null }),
      });
      onOk("Brand domain saved");
      load();
    } catch (e: any) {
      onError(e.message || "Save failed");
    } finally {
      setSavingCode(null);
    }
  };

  if (loading) return <Spinner />;
  if (products.length === 0)
    return <Empty title="No products" description="Run the platform migration." />;

  return (
    <Card>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Brand domain</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const draft = drafts[p.code] ?? "";
              const dirty = (draft || "") !== (p.brand_domain || "");
              return (
                <tr key={p.code}>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{p.code}</td>
                  <td style={tdStyle}>{p.name}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={p.status} />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.code]: e.target.value }))}
                      placeholder="app.example.com"
                      style={{ ...inputStyle, width: 280 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button
                      onClick={() => save(p.code)}
                      disabled={!dirty || savingCode === p.code}
                      style={{ ...btnPrimary, opacity: dirty ? 1 : 0.4 }}
                    >
                      {savingCode === p.code ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", padding: "8px 12px 12px", margin: 0 }}>
        The AppSwitcher uses <code>brand_domain</code> to build the production link for each tile. Leave
        blank to fall back to the dev cross-port URL or &quot;Coming soon&quot;.
      </p>
    </Card>
  );
}

// ── Contractor Portal tab (Task #23) ───────────────────────────────────────
type CpRow = {
  id: string; email: string; contactName: string; companyName: string;
  trade: string | null; planTier: string; status: string;
  createdAt: string; lastLoginAt: string | null;
  upstream: string[]; downstream: string[]; tier: string;
  quotes: number; quotesAmount: number; invoices: number; invoicesAmount: number;
  jobs: number; invitesSent: number;
};
type CpEdge = { id: string; kind: string; upstream: string; contractor: string; createdAt: string };
type CpQuoteRow = { id: string; number: string; jobName: string; from: string; to: string; amount: number; status: string; sentAt: string };
type CpInvoiceRow = { id: string; number: string; from: string; to: string; amount: number; status: string; submittedAt: string; paidAt: string | null };
type CpJobRow = { id: string; name: string; contractor: string; status: string; createdAt: string };
type CpData = {
  totals: {
    accounts: number; edges: number; layer1Edges: number; layer2Edges: number;
    pendingQuoteCount: number; pendingQuoteAmount: number;
    pendingInvoiceCount: number; pendingInvoiceAmount: number;
    activeJobs: number;
  };
  accounts: CpRow[];
  edges: CpEdge[];
  quotes: CpQuoteRow[];
  invoices: CpInvoiceRow[];
  jobs: CpJobRow[];
};

function ContractorPortalTab({ onError }: { onError: (t: string) => void }) {
  const [data, setData] = useState<CpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "L2" | "L3" | "sole">("all");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<"accounts" | "edges" | "quotes" | "invoices" | "jobs">("accounts");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await apiFetch<CpData>("/api/super-admin/contractor-portal");
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) onError(`Load failed: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onError]);

  const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.accounts.filter((a) => {
      if (filter !== "all" && a.tier !== filter) return false;
      if (!q) return true;
      return [a.companyName, a.contactName, a.email, a.trade || ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [data, filter, search]);

  if (loading) return <div style={{ padding: 24, color: "#6b7280" }}>Loading contractor portal data…</div>;
  if (!data) return <div style={{ padding: 24, color: "#b91c1c" }}>Failed to load.</div>;

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", marginBottom: 14 }}>
        Platform-wide read-out of every contractor account, the OperatorEdge graph, and rolled-up
        transactional totals across all CHG operator tenants.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 }}>
        <Stat label="Contractor accounts" value={String(data.totals.accounts)} />
        <Stat label="Operator edges" value={String(data.totals.edges)} sub={`${data.totals.layer1Edges} L1→L2 · ${data.totals.layer2Edges} L2→L3`} />
        <Stat label="Active jobs" value={String(data.totals.activeJobs)} />
        <Stat label="Pending quotes" value={`${data.totals.pendingQuoteCount} · ${fmt(data.totals.pendingQuoteAmount)}`} />
        <Stat label="Pending invoices" value={`${data.totals.pendingInvoiceCount} · ${fmt(data.totals.pendingInvoiceAmount)}`} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        {([
          ["accounts", `Accounts (${data.accounts.length})`],
          ["edges", `Operator edges (${data.edges.length})`],
          ["quotes", `Quotes (${data.quotes.length})`],
          ["invoices", `Invoices (${data.invoices.length})`],
          ["jobs", `Jobs (${data.jobs.length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSection(k)}
            style={{
              background: "transparent", border: 0, cursor: "pointer",
              padding: "8px 12px", fontSize: 12, fontWeight: section === k ? 700 : 500,
              color: section === k ? "#111827" : "#6b7280",
              borderBottom: section === k ? "2px solid #D85A30" : "2px solid transparent",
            }}
          >{label}</button>
        ))}
      </div>

      {section === "accounts" ? (
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search company, contact, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, minWidth: 280 }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          style={{ padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}
        >
          <option value="all">All tiers</option>
          <option value="L2">L2 (under a CHG operator)</option>
          <option value="L3">L3 (sub of an L2)</option>
          <option value="sole">Sole (no inviter)</option>
        </select>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{rows.length} of {data.accounts.length}</span>
      </div>
      ) : null}

      {section === "accounts" ? (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {["Account", "Tier", "Plan", "Upstream", "Downstream", "Jobs", "Quotes", "Invoices", "Invites", "Last login"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{a.companyName}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{a.contactName} · {a.email}</div>
                  {a.trade ? <div style={{ fontSize: 11, color: "#9ca3af" }}>{a.trade}</div> : null}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: a.tier === "L2" ? "#dbeafe" : a.tier === "L3" ? "#e0e7ff" : "#f3f4f6", color: a.tier === "L2" ? "#1e40af" : a.tier === "L3" ? "#3730a3" : "#374151" }}>{a.tier}</span>
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{a.planTier}</td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#374151" }}>{a.upstream.length === 0 ? "—" : a.upstream.map((u, i) => <div key={i}>{u}</div>)}</td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#374151" }}>{a.downstream.length === 0 ? "—" : `${a.downstream.length} sub${a.downstream.length === 1 ? "" : "s"}`}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{a.jobs}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{a.quotes} <span style={{ color: "#6b7280", fontSize: 11 }}>({fmt(a.quotesAmount)})</span></td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{a.invoices} <span style={{ color: "#6b7280", fontSize: 11 }}>({fmt(a.invoicesAmount)})</span></td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{a.invitesSent}</td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString() : "never"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>No contractor accounts match.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      ) : null}

      {section === "edges" ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fafafa" }}>{["Kind", "Upstream", "Contractor", "Created"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", fontWeight: 600 }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.edges.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>{e.kind}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{e.upstream}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{e.contractor}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.edges.length === 0 ? <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>No operator edges yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {section === "quotes" ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fafafa" }}>{["#", "Job", "From", "To", "Amount", "Status", "Sent"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", fontWeight: 600 }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.quotes.map((q) => (
                <tr key={q.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>{q.number}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{q.jobName}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{q.from}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{q.to}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{fmt(q.amount)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{q.status}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{new Date(q.sentAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.quotes.length === 0 ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>No quotes yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {section === "invoices" ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fafafa" }}>{["#", "From", "To", "Amount", "Status", "Submitted", "Paid"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", fontWeight: 600 }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>{i.number}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{i.from}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{i.to}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{fmt(i.amount)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{i.status}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{new Date(i.submittedAt).toLocaleDateString()}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{i.paidAt ? new Date(i.paidAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {data.invoices.length === 0 ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>No invoices yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {section === "jobs" ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fafafa" }}>{["Job", "Contractor", "Status", "Created"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", textAlign: "left", fontWeight: 600 }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>{j.name}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{j.contractor}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{j.status}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "#6b7280" }}>{new Date(j.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.jobs.length === 0 ? <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>No jobs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

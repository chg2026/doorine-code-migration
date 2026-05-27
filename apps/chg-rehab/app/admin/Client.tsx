"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BillingPanel from "./BillingPanel";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import { useBillingGateProps } from "@/lib/useBillingHealth";
import type { UnsubscribeLinkDiagnostic } from "@/lib/contactUnsubscribe";

type PermRow = {
  id: string;
  label: string;
  ord: number;
  pm: string;
  gc: string;
  sub: string;
  inspector: string;
  adminLock: boolean;
  locked: boolean;
};

type Settings = {
  strictPaymentGate: boolean;
  blockAssignmentIfDocsMissing: boolean;
  expiryAlertThresholdDays: number;
  projectIdPrefix: string;
  defaultProjectMode: string;
  timezone: string;
  dateFormat: string;
  warehouseLowStockThreshold: number;
  contractorPortalEnabled: boolean;
  meta: Record<string, unknown>;
};

type UserRow = { id: string; email: string | null; name: string; role: string };

type InviteRow = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
};

type RemovedUserRow = {
  id: string;
  name: string;
  role: string;
  deactivatedAt: string | null;
};

type StaleAlertLogEntry = {
  id: string;
  sentAt: string;
  staleForMs: number | null;
  thresholdMs: number;
  throttleMs: number;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  recipients: Array<{ email: string; delivered: boolean; reason?: string }>;
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "ProjectManager", label: "PM" },
  { value: "GeneralContractor", label: "GC" },
  { value: "Subcontractor", label: "Subcontractor" },
  { value: "Inspector", label: "Inspector" },
];

type Panel =
  | "general"
  | "timezone"
  | "users"
  | "rehab-settings"
  | "warehouse-settings"
  | "docs-settings"
  | "compliance"
  | "contractor-portal"
  | "notifications"
  | "billing";

const PANELS: { key: Panel; label: string; section: string }[] = [
  { key: "general", label: "General settings", section: "Platform" },
  { key: "timezone", label: "Timezone & display", section: "Platform" },
  { key: "users", label: "Users & permissions", section: "Platform" },
  { key: "rehab-settings", label: "Rehab Manager", section: "Modules" },
  { key: "warehouse-settings", label: "Warehouse", section: "Modules" },
  { key: "docs-settings", label: "Documents Hub", section: "Modules" },
  { key: "compliance", label: "Compliance requirements", section: "Compliance" },
  { key: "contractor-portal", label: "Contractor portal", section: "Compliance" },
  { key: "notifications", label: "Notifications", section: "Account" },
  { key: "billing", label: "Billing & plan", section: "Account" },
];

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#111827",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 6,
        fontSize: 12,
        zIndex: 9999,
      }}
    >
      {msg}
    </div>
  );
}

export default function AdminClient({
  currentUserRole,
  currentUserId,
  companyName,
  settings: initialSettings,
  perms: initialPerms,
  users: initialUsers,
  invites: initialInvites,
  removedUsers: initialRemovedUsers = [],
  outboundEmailConfigured = false,
  unsubscribeLinkDiagnostic,
  lastNotificationSweepAt = null,
  lastStaleAlertAt = null,
  lastManualSweepAt = null,
  lastManualSweepByUserId = null,
  lastManualSweepByName = null,
  staleAlertThresholdMs,
  staleAlertThrottleMs,
  recentStaleAlerts = [],
  recentStaleAlertsHasMore = false,
}: {
  currentUserRole: string;
  currentUserId: string;
  companyName: string;
  settings: Settings;
  perms: PermRow[];
  users: UserRow[];
  invites: InviteRow[];
  removedUsers?: RemovedUserRow[];
  outboundEmailConfigured?: boolean;
  unsubscribeLinkDiagnostic: UnsubscribeLinkDiagnostic;
  lastNotificationSweepAt?: string | null;
  lastStaleAlertAt?: string | null;
  lastManualSweepAt?: string | null;
  lastManualSweepByUserId?: string | null;
  lastManualSweepByName?: string | null;
  staleAlertThresholdMs: number;
  staleAlertThrottleMs: number;
  recentStaleAlerts?: StaleAlertLogEntry[];
  recentStaleAlertsHasMore?: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const queryPanel = params.get("panel");
  const initialPanel: Panel =
    queryPanel && PANELS.some((p) => p.key === queryPanel) ? (queryPanel as Panel) : "general";
  const [panel, setPanel] = useState<Panel>(initialPanel);

  useEffect(() => {
    if (queryPanel && PANELS.some((p) => p.key === queryPanel)) {
      setPanel(queryPanel as Panel);
    }
  }, [queryPanel]);

  const selectPanel = (next: Panel) => {
    setPanel(next);
    router.replace(`/admin?panel=${next}`);
  };
  const [toast, setToast] = useState<string | null>(null);
  const [savedCompanyName, setCompanyName] = useState(companyName);

  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [perms, setPerms] = useState<PermRow[]>(initialPerms);
  const [permDirty, setPermDirty] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [removedUsers, setRemovedUsers] =
    useState<RemovedUserRow[]>(initialRemovedUsers);

  const isAdmin = currentUserRole === "Admin";

  const showToast = (m: string) => setToast(m);

  async function saveSettings(patch: Partial<Settings>) {
    const merged = { ...settings, ...patch };
    setSettings(merged);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Settings saved");
    } catch {
      showToast("Save failed");
    }
  }

  async function saveCompany(name: string) {
    setCompanyName(name);
    try {
      const res = await fetch("/api/admin/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      showToast("Company name saved");
    } catch {
      showToast("Save failed");
    }
  }

  function updatePerm(rowIdx: number, key: "pm" | "gc" | "sub" | "inspector", val: string) {
    setPerms((rs) => rs.map((r, i) => (i === rowIdx ? { ...r, [key]: val } : r)));
    setPermDirty(true);
  }
  function discardPerms() {
    setPerms(initialPerms);
    setPermDirty(false);
  }
  async function savePerms() {
    setPermSaving(true);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: perms.map((p) => ({
            id: p.id,
            pm: p.pm,
            gc: p.gc,
            sub: p.sub,
            inspector: p.inspector,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setPermDirty(false);
      showToast("Permission matrix saved · Changes apply immediately to all active sessions");
    } catch {
      showToast("Save failed");
    } finally {
      setPermSaving(false);
    }
  }

  const sections = useMemo(() => {
    const s = new Map<string, typeof PANELS>();
    for (const p of PANELS) {
      if (!s.has(p.section)) s.set(p.section, []);
      s.get(p.section)!.push(p);
    }
    return s;
  }, []);

  return (
    <div className="module" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">Admin Settings</span>
          <span className="proj-chip">Account owner only</span>
        </div>
        <div className="proj-r">
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            Changes apply to all users in your account
          </span>
        </div>
      </div>

      <div className="admin-layout">
        <div className="admin-left">
          {Array.from(sections.entries()).map(([sec, items]) => (
            <div key={sec}>
              <div className="admin-nav-section">{sec}</div>
              {items.map((p) => (
                <div
                  key={p.key}
                  className={"admin-nav-item" + (panel === p.key ? " active" : "")}
                  onClick={() => selectPanel(p.key)}
                >
                  {p.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="admin-main">
          {panel === "general" && (
            <GeneralPanel
              isAdmin={isAdmin}
              companyName={savedCompanyName}
              settings={settings}
              onSettings={saveSettings}
              onCompany={saveCompany}
            />
          )}
          {panel === "timezone" && (
            <TimezonePanel isAdmin={isAdmin} settings={settings} onSettings={saveSettings} />
          )}
          {panel === "users" && (
            <UsersPanel
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              perms={perms}
              users={users}
              invites={invites}
              removedUsers={removedUsers}
              dirty={permDirty}
              saving={permSaving}
              onUpdate={updatePerm}
              onDiscard={discardPerms}
              onSave={savePerms}
              onUsersChange={setUsers}
              onInvitesChange={setInvites}
              onRemovedUsersChange={setRemovedUsers}
              onToast={showToast}
              onManagePlan={() => selectPanel("billing")}
            />
          )}
          {panel === "rehab-settings" && (
            <RehabPanel isAdmin={isAdmin} settings={settings} onSettings={saveSettings} />
          )}
          {panel === "warehouse-settings" && (
            <WarehousePanel isAdmin={isAdmin} settings={settings} onSettings={saveSettings} />
          )}
          {panel === "docs-settings" && (
            <DocsPanel isAdmin={isAdmin} settings={settings} onSettings={saveSettings} />
          )}
          {panel === "compliance" && (
            <CompliancePanel isAdmin={isAdmin} settings={settings} onSettings={saveSettings} />
          )}
          {panel === "contractor-portal" && (
            <ContractorPortalPanel
              isAdmin={isAdmin}
              settings={settings}
              onSettings={saveSettings}
            />
          )}
          {panel === "notifications" && (
            <NotificationsPanel
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              settings={settings}
              onSettings={saveSettings}
              outboundEmailConfigured={outboundEmailConfigured}
              unsubscribeLinkDiagnostic={unsubscribeLinkDiagnostic}
              lastNotificationSweepAt={lastNotificationSweepAt}
              lastStaleAlertAt={lastStaleAlertAt}
              lastManualSweepAt={lastManualSweepAt}
              lastManualSweepByUserId={lastManualSweepByUserId}
              lastManualSweepByName={lastManualSweepByName}
              staleAlertThresholdMs={staleAlertThresholdMs}
              staleAlertThrottleMs={staleAlertThrottleMs}
              initialRecentStaleAlerts={recentStaleAlerts}
              initialRecentStaleAlertsHasMore={recentStaleAlertsHasMore}
            />
          )}
          {panel === "billing" && (
            <BillingPanel
              isAdmin={isAdmin}
              companyName={savedCompanyName}
              onToast={showToast}
            />
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── Panels ─────────────────────────────────────────────────────────

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 20 }}>{children}</h2>;
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="toggle-slider"></span>
    </label>
  );
}

function GeneralPanel({
  isAdmin,
  companyName,
  settings,
  onSettings,
  onCompany,
}: {
  isAdmin: boolean;
  companyName: string;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  onCompany: (n: string) => void;
}) {
  const meta = settings.meta || {};
  const featureFlag = (key: string, def = true) =>
    typeof meta[key] === "boolean" ? (meta[key] as boolean) : def;
  const [name, setName] = useState(companyName);
  return (
    <div className="admin-panel active">
      <PanelTitle>General settings</PanelTitle>
      <div className="admin-group">
        <div className="admin-group-title">Company information</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Company name</div>
            <div className="admin-desc">Displayed in headers and exported documents.</div>
          </div>
          <input
            className="admin-input"
            style={{ width: 200 }}
            value={name}
            disabled={!isAdmin}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== companyName && onCompany(name)}
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Project ID prefix</div>
            <div className="admin-desc">Used to generate project IDs (e.g. CHG-2247).</div>
          </div>
          <input
            className="admin-input"
            style={{ width: 100 }}
            value={settings.projectIdPrefix}
            disabled={!isAdmin}
            onChange={(e) => onSettings({ projectIdPrefix: e.target.value })}
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Default project mode</div>
            <div className="admin-desc">
              Internally Managed = full PM control. Contractor-Led = GC autonomy, PM reviews
              milestones.
            </div>
          </div>
          <select
            className="admin-select"
            value={settings.defaultProjectMode}
            disabled={!isAdmin}
            onChange={(e) => onSettings({ defaultProjectMode: e.target.value })}
          >
            <option>Internally Managed</option>
            <option>Contractor-Led</option>
          </select>
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Feature visibility</div>
        {(
          [
            ["warehouseModule", "Warehouse module", "Allow users to access the company warehouse and allocate materials to projects.", "all users with warehouse permission"],
            ["penaltyTracking", "Penalty tracking", "Track and display penalty per diem on projects. If disabled, no penalty accrual or alerts.", "Schedule tab, Overview KPI"],
            ["returnTracking", "Return tracking", "Allow logging of material returns and credits in the budget module.", "Budget tab, Invoice log"],
            ["contractorTags", "Contractor tags", "Allow PMs to add compliance, scheduling, and communication tags to contractor cards.", "Overview team sidebar, Contacts module"],
          ] as const
        ).map(([key, lbl, desc, affects]) => (
          <div className="admin-row" key={key}>
            <div className="admin-info">
              <div className="admin-lbl">{lbl}</div>
              <div className="admin-desc">{desc}</div>
              <div className="admin-affects">Affects: {affects}</div>
            </div>
            <Toggle
              checked={featureFlag(key)}
              disabled={!isAdmin}
              onChange={(v) =>
                onSettings({ meta: { ...meta, [key]: v } as Record<string, unknown> })
              }
            />
          </div>
        ))}
      </div>
      <div className="save-bar">
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          Changes save automatically
        </span>
        <button className="btn btn-primary">Save changes</button>
      </div>
    </div>
  );
}

function TimezonePanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const tzOptions: { val: string; label: string }[] = [
    { val: "America/New_York", label: "Eastern Time (ET)" },
    { val: "America/Chicago", label: "Central Time (CT)" },
    { val: "America/Denver", label: "Mountain Time (MT)" },
    { val: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { val: "America/Anchorage", label: "Alaska Time (AKT)" },
    { val: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  ];
  return (
    <div className="admin-panel active">
      <PanelTitle>Timezone & display</PanelTitle>
      <div className="admin-group">
        <div className="admin-group-title">Company timezone</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Company timezone</div>
            <div className="admin-desc">
              All timestamps throughout the platform — payment approvals, document uploads,
              activity log entries — display in this timezone with a label (e.g., &quot;10:22 AM ET&quot;).
              Cannot be overridden per user.
            </div>
            <div className="admin-affects">Affects: every timestamp on every screen</div>
          </div>
          <select
            className="admin-select"
            value={settings.timezone}
            disabled={!isAdmin}
            onChange={(e) => onSettings({ timezone: e.target.value })}
          >
            {tzOptions.map((o) => (
              <option key={o.val} value={o.val}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Date format</div>
            <div className="admin-desc">How dates display throughout the platform.</div>
          </div>
          <select
            className="admin-select"
            value={settings.dateFormat}
            disabled={!isAdmin}
            onChange={(e) => onSettings({ dateFormat: e.target.value })}
          >
            <option value="MMM D, YYYY">Apr 26, 2026</option>
            <option value="MM/DD/YYYY">04/26/2026</option>
            <option value="YYYY-MM-DD">2026-04-26</option>
          </select>
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

function UsersPanel({
  isAdmin,
  currentUserId,
  perms,
  users,
  invites,
  removedUsers,
  dirty,
  saving,
  onUpdate,
  onDiscard,
  onSave,
  onUsersChange,
  onInvitesChange,
  onRemovedUsersChange,
  onToast,
  onManagePlan,
}: {
  isAdmin: boolean;
  currentUserId: string;
  perms: PermRow[];
  users: UserRow[];
  invites: InviteRow[];
  removedUsers: RemovedUserRow[];
  dirty: boolean;
  saving: boolean;
  onUpdate: (i: number, k: "pm" | "gc" | "sub" | "inspector", v: string) => void;
  onDiscard: () => void;
  onSave: () => void;
  onUsersChange: (next: UserRow[]) => void;
  onInvitesChange: (next: InviteRow[]) => void;
  onRemovedUsersChange: (next: RemovedUserRow[]) => void;
  onToast: (m: string) => void;
  onManagePlan: () => void;
}) {
  const roles: { key: "pm" | "gc" | "sub" | "inspector"; label: string }[] = [
    { key: "pm", label: "PM" },
    { key: "gc", label: "GC" },
    { key: "sub", label: "Subcontractor" },
    { key: "inspector", label: "Inspector" },
  ];
  return (
    <div className="admin-panel active">
      <PanelTitle>Users & permissions</PanelTitle>
      <div className="admin-group">
        <div
          className="admin-group-title"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span>
            Role permission matrix{" "}
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-tertiary)" }}>
              — click any cell to change access level
            </span>
          </span>
          <span
            style={{
              fontSize: 9,
              color: "var(--text-tertiary)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              style={{
                background: "#EAF3DE",
                color: "#27500A",
                padding: "1px 6px",
                borderRadius: 3,
                fontWeight: 500,
              }}
            >
              Edit
            </span>
            <span
              style={{
                background: "#E8EFF1",
                color: "#143641",
                padding: "1px 6px",
                borderRadius: 3,
                fontWeight: 500,
              }}
            >
              View
            </span>
            <span
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-tertiary)",
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              No access
            </span>
          </span>
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="perm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Feature / Action</th>
                <th style={{ textAlign: "center" }}>Admin</th>
                {roles.map((r) => (
                  <th key={r.key} style={{ textAlign: "center" }}>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((row, ri) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 400 }}>{row.label}</td>
                  <td style={{ textAlign: "center" }}>
                    {row.locked ? (
                      <span className="perm-locked-none">Locked — none</span>
                    ) : row.adminLock ? (
                      <span className="perm-locked">🔒 Admin only</span>
                    ) : (
                      <span className="perm-locked">🔒 Full edit</span>
                    )}
                  </td>
                  {roles.map((r) => {
                    const val = row[r.key];
                    if (row.locked) {
                      return (
                        <td key={r.key} style={{ textAlign: "center" }}>
                          <span className="perm-locked-none">Locked</span>
                        </td>
                      );
                    }
                    const cls =
                      val === "edit" ? "val-edit" : val === "view" ? "val-view" : "val-none";
                    // adminLock rows: only Admin can change them. Non-admins
                    // see a read-only chip showing the current grant rather
                    // than a disabled dropdown that pretends to be editable.
                    if (row.adminLock && !isAdmin) {
                      return (
                        <td key={r.key} style={{ textAlign: "center" }}>
                          <span className={"perm-sel " + cls} style={{ display: "inline-block" }}>
                            {val === "edit" ? "✏ Edit" : val === "view" ? "👁 View" : "—"}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={r.key} style={{ textAlign: "center" }}>
                        <select
                          className={"perm-sel " + cls}
                          value={val}
                          disabled={!isAdmin}
                          onChange={(e) => onUpdate(ri, r.key, e.target.value)}
                        >
                          <option value="edit">✏ Edit</option>
                          <option value="view">👁 View</option>
                          <option value="none">— No access</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dirty && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#FFF8E6",
              borderRadius: 5,
              border: "0.5px solid #F5C842",
              fontSize: 11,
              color: "#7A5800",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>⚠ Unsaved permission changes</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-sm" disabled={saving} onClick={onDiscard}>
                Discard
              </button>
              <button className="btn-sm btn-primary" disabled={saving} onClick={onSave}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
      <UserSeatsSection
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        users={users}
        invites={invites}
        removedUsers={removedUsers}
        onUsersChange={onUsersChange}
        onInvitesChange={onInvitesChange}
        onRemovedUsersChange={onRemovedUsersChange}
        onToast={onToast}
        onManagePlan={onManagePlan}
      />
      <div className="save-bar">
        <button
          className="btn btn-primary"
          disabled={!isAdmin || !dirty || saving}
          onClick={onSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function UserSeatsSection({
  isAdmin,
  currentUserId,
  users,
  invites,
  removedUsers,
  onUsersChange,
  onInvitesChange,
  onRemovedUsersChange,
  onToast,
  onManagePlan,
}: {
  isAdmin: boolean;
  currentUserId: string;
  users: UserRow[];
  invites: InviteRow[];
  removedUsers: RemovedUserRow[];
  onUsersChange: (next: UserRow[]) => void;
  onInvitesChange: (next: InviteRow[]) => void;
  onRemovedUsersChange: (next: RemovedUserRow[]) => void;
  onToast: (m: string) => void;
  onManagePlan: () => void;
}) {
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [pendingReactivateId, setPendingReactivateId] = useState<string | null>(
    null
  );
  const [reactivateRoleById, setReactivateRoleById] = useState<
    Record<string, string>
  >({});
  const [removedExpanded, setRemovedExpanded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const billingGate = useBillingGateProps();
  const [reactivateSeatLimitInfo, setReactivateSeatLimitInfo] = useState<
    { seatsInUse: number; seatLimit: number; plan?: string } | null
  >(null);

  const adminCount = useMemo(
    () => users.filter((u) => u.role === "Admin").length,
    [users]
  );

  async function removeUser(user: UserRow) {
    if (user.id === currentUserId) return;
    if (user.role === "Admin" && adminCount <= 1) return;
    const label = user.name || user.email || "this teammate";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${label} from the company? They'll lose access immediately. Their past activity stays in the log.`
      )
    ) {
      return;
    }
    setPendingRemoveId(user.id);
    const previous = users;
    onUsersChange(users.filter((u) => u.id !== user.id));
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onUsersChange(previous);
        onToast(j.error || `Couldn't remove user (${res.status})`);
        return;
      }
      // Show them in the "Removed teammates" disclosure right away so admins
      // can reactivate without a page refresh.
      onRemovedUsersChange([
        {
          id: user.id,
          name: user.name || label,
          role: user.role,
          deactivatedAt: new Date().toISOString(),
        },
        ...removedUsers,
      ]);
      onToast(`${label} removed from the team`);
    } catch {
      onUsersChange(previous);
      onToast("Couldn't remove user");
    } finally {
      setPendingRemoveId(null);
    }
  }

  async function changeRole(user: UserRow, role: string) {
    if (role === user.role) return;
    setPendingRoleId(user.id);
    const previous = users;
    onUsersChange(users.map((u) => (u.id === user.id ? { ...u, role } : u)));
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onUsersChange(previous);
        onToast(j.error || `Couldn't update role (${res.status})`);
        return;
      }
      onToast(`${user.name} is now ${roleLabel(role)}`);
    } catch {
      onUsersChange(previous);
      onToast("Couldn't update role");
    } finally {
      setPendingRoleId(null);
    }
  }

  function handleInviteCreated(
    invite: InviteRow,
    joinUrl: string,
    emailDelivered: boolean
  ) {
    onInvitesChange([invite, ...invites]);
    setLastInviteUrl(joinUrl);
    onToast(
      emailDelivered
        ? `Invite link emailed to you — forward it to ${invite.email}`
        : `Invite link created — copy it below to share with ${invite.email}`
    );
  }

  async function revokeInvite(inviteId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Cancel this pending invite?")
    ) return;
    const previous = invites;
    onInvitesChange(invites.filter((i) => i.id !== inviteId));
    try {
      const res = await fetch(`/api/admin/invites/${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onInvitesChange(previous);
        onToast(j.error || `Couldn't revoke invite (${res.status})`);
        return;
      }
      onToast("Invite cancelled");
    } catch {
      onInvitesChange(previous);
      onToast("Couldn't revoke invite");
    }
  }

  async function reactivateUser(user: RemovedUserRow) {
    const role = reactivateRoleById[user.id] ?? user.role;
    setPendingReactivateId(user.id);
    setReactivateSeatLimitInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        seatsInUse?: number;
        seatLimit?: number;
        plan?: string;
        user?: { id: string; email: string | null; name: string; role: string };
      };
      if (!res.ok) {
        if (
          res.status === 402 &&
          j.code === "seat_limit_reached" &&
          typeof j.seatsInUse === "number" &&
          typeof j.seatLimit === "number"
        ) {
          setReactivateSeatLimitInfo({
            seatsInUse: j.seatsInUse,
            seatLimit: j.seatLimit,
            plan: j.plan,
          });
          onToast("Out of seats — upgrade your plan to bring them back");
          return;
        }
        onToast(
          billingAwareErrorMessage(
            res.status,
            j,
            `Couldn't reactivate teammate (${res.status})`
          )
        );
        return;
      }
      const restored = j.user ?? {
        id: user.id,
        email: null,
        name: user.name,
        role,
      };
      onUsersChange([
        ...users,
        {
          id: restored.id,
          email: restored.email,
          name: restored.name || user.name,
          role: restored.role,
        },
      ]);
      onRemovedUsersChange(removedUsers.filter((r) => r.id !== user.id));
      setReactivateRoleById((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      onToast(`${restored.name || user.name} is back on the team`);
    } catch {
      onToast("Couldn't reactivate teammate");
    } finally {
      setPendingReactivateId(null);
    }
  }

  return (
    <div className="admin-group" style={{ marginTop: 20 }}>
      <div className="admin-group-title">User seats</div>
      {users.map((u) => {
        const isMe = u.id === currentUserId;
        const isLastAdmin = u.role === "Admin" && adminCount <= 1;
        const rowBusy = pendingRoleId === u.id || pendingRemoveId === u.id;
        const disabled = !isAdmin || isMe || rowBusy;
        const removeDisabled = !isAdmin || isMe || isLastAdmin || rowBusy;
        const removeTitle = isMe
          ? "You can't remove yourself"
          : isLastAdmin
            ? "Promote another admin first"
            : "Remove from company";
        return (
          <div className="admin-row" key={u.id}>
            <div className="admin-info">
              <div className="admin-lbl">
                {u.name}
                {isMe && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      color: "var(--text-tertiary)",
                      fontWeight: 400,
                    }}
                  >
                    (you)
                  </span>
                )}
              </div>
              <div className="admin-desc">
                {u.email ?? ""} · {roleLabel(u.role)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {rowBusy && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {pendingRemoveId === u.id ? "Removing…" : "Saving…"}
                </span>
              )}
              <select
                className="admin-select"
                value={u.role}
                disabled={disabled}
                onChange={(e) => changeRole(u, e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-sm"
                disabled={removeDisabled}
                title={removeTitle}
                onClick={() => removeUser(u)}
                style={{
                  color: removeDisabled ? "var(--text-tertiary)" : "#A8231C",
                  borderColor: removeDisabled
                    ? "var(--border-mid)"
                    : "rgba(168,35,28,0.4)",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      {invites.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Pending invites
          </div>
          {invites.map((inv) => (
            <div
              className="admin-row"
              key={inv.id}
              style={{ background: "#FAFBFC" }}
            >
              <div className="admin-info">
                <div className="admin-lbl">{inv.email}</div>
                <div className="admin-desc">
                  Invited as {roleLabel(inv.role)} · expires{" "}
                  {new Date(inv.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    background: "#FFF8E6",
                    color: "#7A5800",
                    padding: "2px 8px",
                    borderRadius: 3,
                    border: "0.5px solid #F5C842",
                  }}
                >
                  Pending
                </span>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => revokeInvite(inv.id)}
                  style={{ color: "#A8231C", borderColor: "rgba(168,35,28,0.4)" }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {removedUsers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setRemovedExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            aria-expanded={removedExpanded}
          >
            <span style={{ display: "inline-block", width: 8 }}>
              {removedExpanded ? "▾" : "▸"}
            </span>
            <span>
              Removed teammates ({removedUsers.length})
            </span>
          </button>
          {removedExpanded && (
            <>
              {reactivateSeatLimitInfo && (
                <div
                  role="alert"
                  style={{
                    background: "#FEF6E7",
                    border: "1px solid #F4D38A",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#7A4B0B" }}>
                    You&apos;re out of seats
                  </div>
                  <div style={{ fontSize: 11, color: "#7A4B0B", lineHeight: 1.5 }}>
                    Your
                    {reactivateSeatLimitInfo.plan
                      ? ` ${reactivateSeatLimitInfo.plan}`
                      : ""}{" "}
                    plan includes{" "}
                    <strong>{reactivateSeatLimitInfo.seatLimit}</strong>{" "}
                    {reactivateSeatLimitInfo.seatLimit === 1 ? "seat" : "seats"}{" "}
                    and you&apos;re using{" "}
                    <strong>{reactivateSeatLimitInfo.seatsInUse}</strong>.
                    Upgrade your plan to bring this teammate back.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={onManagePlan}
                    >
                      Manage plan
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => setReactivateSeatLimitInfo(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              {removedUsers.map((u) => {
                const rowBusy = pendingReactivateId === u.id;
                const selectedRole = reactivateRoleById[u.id] ?? u.role;
                const reactivateDisabled =
                  !isAdmin || rowBusy || billingGate.disabled;
                return (
                  <div
                    className="admin-row"
                    key={u.id}
                    style={{ background: "#FAFBFC" }}
                  >
                    <div className="admin-info">
                      <div className="admin-lbl">{u.name}</div>
                      <div className="admin-desc">
                        Removed
                        {u.deactivatedAt
                          ? ` ${new Date(u.deactivatedAt).toLocaleDateString()}`
                          : ""}{" "}
                        · was {roleLabel(u.role)}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      {rowBusy && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                          }}
                        >
                          Reactivating…
                        </span>
                      )}
                      <select
                        className="admin-select"
                        value={selectedRole}
                        disabled={reactivateDisabled}
                        onChange={(e) =>
                          setReactivateRoleById((prev) => ({
                            ...prev,
                            [u.id]: e.target.value,
                          }))
                        }
                        title="Pick the role they should come back as"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        disabled={reactivateDisabled}
                        title={billingGate.disabled ? billingGate.title : undefined}
                        style={billingGate.disabled ? billingGate.style : undefined}
                        aria-disabled={reactivateDisabled || undefined}
                        onClick={() => reactivateUser(u)}
                      >
                        Reactivate
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          disabled={!isAdmin || billingGate.disabled}
          onClick={() => setInviteOpen(true)}
          title={billingGate.title}
          style={billingGate.style}
          aria-disabled={!isAdmin || billingGate.disabled || undefined}
        >
          + Invite user
        </button>
      </div>

      {lastInviteUrl && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "#EAF3DE",
            borderRadius: 6,
            border: "0.5px solid rgba(29,158,117,0.3)",
            fontSize: 11,
            color: "#27500A",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Invite link ready — share this with your teammate
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <input
              readOnly
              value={lastInviteUrl}
              className="admin-input"
              style={{ flex: 1, fontSize: 11 }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lastInviteUrl);
                  onToast("Join link copied");
                } catch {
                  onToast("Copy failed — select the link manually");
                }
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setLastInviteUrl(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {inviteOpen && (
        <InviteUserModal
          existingEmails={new Set([
            ...users.map((u) => (u.email || "").toLowerCase()),
            ...invites.map((i) => i.email.toLowerCase()),
          ])}
          onClose={() => setInviteOpen(false)}
          onCreated={(inv, url, delivered) => {
            handleInviteCreated(inv, url, delivered);
            setInviteOpen(false);
          }}
          onManagePlan={() => {
            setInviteOpen(false);
            onManagePlan();
          }}
        />
      )}
    </div>
  );
}

function roleLabel(role: string): string {
  const found = ROLE_OPTIONS.find((r) => r.value === role);
  return found?.label || role;
}

function InviteUserModal({
  existingEmails,
  onClose,
  onCreated,
  onManagePlan,
}: {
  existingEmails: Set<string>;
  onClose: () => void;
  onCreated: (invite: InviteRow, joinUrl: string, emailDelivered: boolean) => void;
  onManagePlan: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ProjectManager");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seatLimitInfo, setSeatLimitInfo] = useState<{
    seatsInUse: number;
    seatLimit: number;
    plan?: string;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSeatLimitInfo(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr("Enter a valid email address");
      return;
    }
    if (existingEmails.has(trimmed)) {
      setErr("Someone with that email already has access or a pending invite");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        seatsInUse?: number;
        seatLimit?: number;
        plan?: string;
        invite?: InviteRow;
        joinUrl?: string;
        emailDelivered?: boolean;
      };
      if (!res.ok || !j.invite || !j.joinUrl) {
        if (
          res.status === 402 &&
          j.code === "seat_limit_reached" &&
          typeof j.seatsInUse === "number" &&
          typeof j.seatLimit === "number"
        ) {
          setSeatLimitInfo({
            seatsInUse: j.seatsInUse,
            seatLimit: j.seatLimit,
            plan: j.plan,
          });
          return;
        }
        setErr(billingAwareErrorMessage(res.status, j, `Couldn't create invite (${res.status})`));
        return;
      }
      onCreated(j.invite, j.joinUrl, Boolean(j.emailDelivered));
    } catch {
      setErr("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          width: 440,
          maxWidth: "100%",
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--border-lo)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>Invite a teammate</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 16,
              cursor: "pointer",
              color: "var(--text-tertiary)",
            }}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={submit}
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <div style={{ marginBottom: 4 }}>
              Email address <span style={{ color: "#A32D2D" }}>*</span>
            </div>
            <input
              autoFocus
              type="email"
              required
              className="admin-input"
              style={{ width: "100%" }}
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <div style={{ marginBottom: 4 }}>Role</div>
            <select
              className="admin-select"
              style={{ width: "100%" }}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
            }}
          >
            We&apos;ll generate a join link your teammate can use to sign in.
            They&apos;ll join your company with the role you select.
          </div>
          {seatLimitInfo ? (
            <div
              role="alert"
              style={{
                background: "#FEF6E7",
                border: "1px solid #F4D38A",
                borderRadius: 6,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7A4B0B" }}>
                You&apos;re out of seats
              </div>
              <div style={{ fontSize: 11, color: "#7A4B0B", lineHeight: 1.5 }}>
                Your{seatLimitInfo.plan ? ` ${seatLimitInfo.plan}` : ""} plan
                includes <strong>{seatLimitInfo.seatLimit}</strong>{" "}
                {seatLimitInfo.seatLimit === 1 ? "seat" : "seats"} and you&apos;re
                using <strong>{seatLimitInfo.seatsInUse}</strong> of{" "}
                <strong>{seatLimitInfo.seatLimit}</strong>. Upgrade your plan to
                invite more teammates.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  onClick={onManagePlan}
                >
                  Manage plan
                </button>
              </div>
            </div>
          ) : (
            err && <div style={{ color: "#791F1F", fontSize: 11 }}>{err}</div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="btn-sm"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-sm btn-primary"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RehabPanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const meta = settings.meta || {};
  const f = (k: string, def = true) =>
    typeof meta[k] === "boolean" ? (meta[k] as boolean) : def;
  const v = (k: string, def: string | number) =>
    meta[k] !== undefined ? (meta[k] as string | number) : def;

  return (
    <div className="admin-panel active">
      <PanelTitle>Rehab Manager settings</PanelTitle>
      <div className="admin-group">
        <div className="admin-group-title">Payment gate</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Strict payment gate</div>
            <div className="admin-desc">
              When ON: all checklist items must be verified before a draw can be released. When OFF:
              gate shows warnings but PM can override without completing every item.
            </div>
            <div className="admin-affects">
              Affects: Checklist & Payments tab — gate lock behavior
            </div>
          </div>
          <Toggle
            checked={settings.strictPaymentGate}
            disabled={!isAdmin}
            onChange={(v) => onSettings({ strictPaymentGate: v })}
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Require exception documentation</div>
            <div className="admin-desc">
              When ON: filing an exception requires mandatory written documentation and at least
              one photo. Cannot be left blank.
            </div>
            <div className="admin-affects">Affects: Exception filing modal</div>
          </div>
          <Toggle
            checked={f("requireExceptionDocs")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({ meta: { ...meta, requireExceptionDocs: v } as Record<string, unknown> })
            }
          />
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Verification requirements</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Photos required on checklist items</div>
            <div className="admin-desc">
              Require photo uploads for checklist item verification. Configurable per phase by PM.
            </div>
            <div className="admin-affects">Affects: Checklist & Payments · Checklist items</div>
          </div>
          <Toggle
            checked={f("photosRequired")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({ meta: { ...meta, photosRequired: v } as Record<string, unknown> })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Video verification option</div>
            <div className="admin-desc">
              Allow PMs to require video documentation for certain checklist items in addition to
              photos.
            </div>
            <div className="admin-affects">Affects: Checklist item configuration</div>
          </div>
          <Toggle
            checked={f("videoVerification", false)}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({ meta: { ...meta, videoVerification: v } as Record<string, unknown> })
            }
          />
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Penalty settings</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Default per diem rate</div>
            <div className="admin-desc">
              Default penalty per day past deadline. Can be overridden per project in project
              settings.
            </div>
            <div className="admin-affects">Affects: Schedule tab · Penalty KPI card</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>$</span>
            <input
              className="admin-input"
              style={{ width: 80 }}
              type="number"
              value={String(v("perDiemRate", 100))}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    perDiemRate: Number(e.target.value),
                  } as Record<string, unknown>,
                })
              }
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>/ day</span>
          </div>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Contractor-caused delay activates penalty</div>
            <div className="admin-desc">
              When delay is classified as contractor-caused, penalty clock starts automatically.
            </div>
          </div>
          <Toggle
            checked={f("contractorDelayPenalty")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, contractorDelayPenalty: v } as Record<string, unknown>,
              })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Material/permit delay pauses penalty</div>
            <div className="admin-desc">
              When delay is classified as material or permit issue, penalty clock pauses until
              resolved.
            </div>
          </div>
          <Toggle
            checked={f("materialDelayPauses")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, materialDelayPauses: v } as Record<string, unknown>,
              })
            }
          />
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Utility verification</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Utility verification before construction</div>
            <div className="admin-desc">
              Sets whether utilities must be verified before construction begins. Three options:
              Required (hard block), Optional (tracked but not blocking), Not tracked.
            </div>
            <div className="admin-affects">Affects: Project kickoff flow</div>
          </div>
          <select
            className="admin-select"
            value={String(v("utilityVerification", "Required — hard block"))}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: {
                  ...meta,
                  utilityVerification: e.target.value,
                } as Record<string, unknown>,
              })
            }
          >
            <option>Required — hard block</option>
            <option>Optional — tracked</option>
            <option>Not tracked</option>
          </select>
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

function WarehousePanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const meta = settings.meta || {};
  const v = (k: string, def: string) => (meta[k] !== undefined ? String(meta[k]) : def);
  return (
    <div className="admin-panel active">
      <PanelTitle>Warehouse settings</PanelTitle>
      <div className="admin-group">
        <div className="admin-group-title">Access & permissions</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Who can add items</div>
            <div className="admin-desc">
              Controls which roles can log new items into the warehouse inventory.
            </div>
            <div className="admin-affects">Affects: Warehouse · Add item button visibility</div>
          </div>
          <select
            className="admin-select"
            value={v("whAddItemsRole", "Admin + PM + GC")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, whAddItemsRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin + PM + GC</option>
            <option>Admin + PM</option>
            <option>Admin only</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Who can allocate to projects</div>
            <div className="admin-desc">
              Controls which roles can assign warehouse items to a project (making them visible in
              that project&apos;s Budget tab).
            </div>
          </div>
          <select
            className="admin-select"
            value={v("whAllocateRole", "Admin + PM")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, whAllocateRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin + PM</option>
            <option>Admin only</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Who can manage templates</div>
            <div className="admin-desc">
              Templates define the fields shown when adding a new item to a subcategory. System
              template names are always locked.
            </div>
          </div>
          <select
            className="admin-select"
            value={v("whTemplatesRole", "Admin only")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, whTemplatesRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin only</option>
            <option>Admin + PM</option>
          </select>
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Low stock alerts</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Low stock threshold</div>
            <div className="admin-desc">
              Items below this quantity will appear in the &quot;Low stock&quot; KPI card and generate an
              alert.
            </div>
            <div className="admin-affects">Affects: Warehouse KPI strip</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              className="admin-input"
              style={{ width: 60 }}
              type="number"
              value={settings.warehouseLowStockThreshold}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({ warehouseLowStockThreshold: Number(e.target.value) })
              }
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>units</span>
          </div>
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

function DocsPanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const meta = settings.meta || {};
  const v = (k: string, def: string) => (meta[k] !== undefined ? String(meta[k]) : def);
  const f = (k: string, def = true) =>
    typeof meta[k] === "boolean" ? (meta[k] as boolean) : def;
  return (
    <div className="admin-panel active">
      <PanelTitle>Documents Hub settings</PanelTitle>
      <div className="admin-group">
        <div className="admin-group-title">Document categories & permissions</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Who can create new document categories</div>
            <div className="admin-desc">
              Restricts who can create new formal document categories. Custom descriptions within
              Misc Admin are always available but formal category creation is admin-controlled.
            </div>
            <div className="admin-affects">Affects: Upload modal · Document category manager</div>
          </div>
          <select
            className="admin-select"
            value={v("docCreateCatRole", "Admin only")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, docCreateCatRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin only</option>
            <option>Admin + PM</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Document deletion</div>
            <div className="admin-desc">
              Documents are never auto-deleted. This controls who can manually delete a document.
              All deletions create a permanent audit log entry regardless of role.
            </div>
            <div className="admin-affects">Affects: Document detail modal · Audit log</div>
          </div>
          <select
            className="admin-select"
            value={v("docDeleteRole", "Admin only")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, docDeleteRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin only</option>
            <option>Admin + PM (own uploads)</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Misc Admin promotion</div>
            <div className="admin-desc">
              Who can promote a Misc Admin document to a formal category (making it permanently
              categorized).
            </div>
          </div>
          <select
            className="admin-select"
            value={v("docPromoteRole", "Admin only")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, docPromoteRole: e.target.value } as Record<string, unknown>,
              })
            }
          >
            <option>Admin only</option>
            <option>Admin + PM</option>
          </select>
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Document types requiring expiry date</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
          These document types show a mandatory expiry date field in the upload modal. The expiry
          date triggers alerts when the threshold is reached.
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Insurance / COI</div>
            <div className="admin-desc">COIs have legally defined expiry dates. Mandatory.</div>
          </div>
          <Toggle checked disabled />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Trade licenses / certifications</div>
          </div>
          <Toggle
            checked={f("expiryTradeLicense")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, expiryTradeLicense: v } as Record<string, unknown>,
              })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Loan documents</div>
          </div>
          <Toggle
            checked={f("expiryLoanDocs")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, expiryLoanDocs: v } as Record<string, unknown>,
              })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Permits</div>
          </div>
          <Toggle
            checked={f("expiryPermits", false)}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, expiryPermits: v } as Record<string, unknown>,
              })
            }
          />
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

function CompliancePanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const meta = settings.meta || {};
  const f = (k: string, def = true) =>
    typeof meta[k] === "boolean" ? (meta[k] as boolean) : def;
  return (
    <div className="admin-panel active">
      <PanelTitle>Compliance requirements</PanelTitle>
      <div
        style={{
          padding: "10px 14px",
          background: "var(--blue-bg)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--blue-txt)",
          marginBottom: 16,
        }}
      >
        These settings apply to all contractors in your account. Turning a requirement OFF means
        your platform will not block work or flag missing documents for that item. CHG internal
        standard: all ON.
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Contractor compliance documents</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">W-9 required</div>
            <div className="admin-desc">
              Contractor must have a W-9 on file in their contact profile before being assigned to a
              project.
            </div>
            <div className="admin-affects">
              Affects: Contacts module · Project team assignment
            </div>
          </div>
          <Toggle
            checked={f("w9Required")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({ meta: { ...meta, w9Required: v } as Record<string, unknown> })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Certificate of Insurance (COI) required</div>
            <div className="admin-desc">
              Contractor must have a valid, unexpired COI uploaded to their contact profile. COI
              cross-maps automatically to the Documents Hub (Individual level).
            </div>
            <div className="admin-affects">
              Affects: Contacts · Documents Hub · Expiry alerts
            </div>
          </div>
          <Toggle
            checked={f("coiRequired")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({ meta: { ...meta, coiRequired: v } as Record<string, unknown> })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Trade license required</div>
            <div className="admin-desc">
              Contractor must have a valid trade license on file (electricians, plumbers, HVAC).
              Expiry tracked.
            </div>
            <div className="admin-affects">Affects: Contacts module · Expiry tracking</div>
          </div>
          <Toggle
            checked={f("tradeLicenseRequired")}
            disabled={!isAdmin}
            onChange={(v) =>
              onSettings({
                meta: { ...meta, tradeLicenseRequired: v } as Record<string, unknown>,
              })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Block assignment if documents missing</div>
            <div className="admin-desc">
              When ON: system prevents assigning a contractor to a project if required compliance
              docs are missing or expired. When OFF: shows warning only.
            </div>
            <div className="admin-affects">Affects: Project team assignment flow</div>
          </div>
          <Toggle
            checked={settings.blockAssignmentIfDocsMissing}
            disabled={!isAdmin}
            onChange={(v) => onSettings({ blockAssignmentIfDocsMissing: v })}
          />
        </div>
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Document expiry alerts</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Expiry alert threshold</div>
            <div className="admin-desc">
              Documents within this many days of expiry appear in the &quot;Expiring soon&quot; filter in the
              Documents Hub with a count badge.
            </div>
            <div className="admin-affects">Affects: Documents Hub · Left nav expiry filter</div>
          </div>
          <select
            className="admin-select"
            value={String(settings.expiryAlertThresholdDays)}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({ expiryAlertThresholdDays: Number(e.target.value) })
            }
          >
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  function cryptoRandInt(max: number): number {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }

  const rand = (set: string) => set[cryptoRandInt(set.length)];
  const core: string[] = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 8; i++) core.push(rand(all));

  // Fisher-Yates shuffle using crypto randomness
  for (let i = core.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [core[i], core[j]] = [core[j], core[i]];
  }
  return core.join("");
}

function ProvisionContractorForm({ isAdmin }: { isAdmin: boolean }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | {
        type: "success";
        state: "created" | "upgraded" | "already_contractor";
        userId: string;
        usedPassword: string;
      }
    | { type: "error"; message: string }
  >({ type: "idle" });

  function handleGenerate() {
    const pw = generateStrongPassword();
    setPassword(pw);
    setShowPassword(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ type: "loading" });
    try {
      const res = await fetch("/api/admin/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ type: "error", message: json.error || "Request failed" });
        return;
      }
      setStatus({
        type: "success",
        state: json.state as "created" | "upgraded" | "already_contractor",
        userId: json.userId,
        usedPassword: password,
      });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  function handleReset() {
    setEmail("");
    setFullName("");
    setPassword("");
    setShowPassword(false);
    setStatus({ type: "idle" });
  }

  const isLoading = status.type === "loading";

  const successBannerConfig =
    status.type === "success"
      ? status.state === "already_contractor"
        ? {
            bg: "#fef3c7",
            border: "#fbbf24",
            headline: "Already a contractor.",
            body: "This email already has an active contractor account and can log in to the contractor portal.",
            showPassword: false,
          }
        : status.state === "upgraded"
        ? {
            bg: "#dbeafe",
            border: "#93c5fd",
            headline: "Contractor access activated.",
            body: "This user existed but was not yet a contractor. Their password has been updated and contractor access is now active.",
            showPassword: true,
          }
        : {
            bg: "#d1fae5",
            border: "#6ee7b7",
            headline: "Contractor account created.",
            body: "The contractor can now log in to the contractor portal.",
            showPassword: true,
          }
      : null;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {status.type === "success" && successBannerConfig && (
        <div
          style={{
            background: successBannerConfig.bg,
            border: `1px solid ${successBannerConfig.border}`,
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 12,
            color: "#111827",
          }}
        >
          <div>
            <strong>{successBannerConfig.headline}</strong> {successBannerConfig.body}
            {successBannerConfig.showPassword && status.usedPassword && (
              <div style={{ marginTop: 6 }}>
                Password set:{" "}
                <code
                  style={{
                    background: "#f3f4f6",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {status.usedPassword}
                </code>
                <span style={{ color: "#6b7280", marginLeft: 6 }}>
                  — copy this now, it will not be shown again.
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleReset}
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#374151",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Create another
          </button>
        </div>
      )}

      {status.type === "error" && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 12,
            color: "#7f1d1d",
          }}
        >
          {status.message}
        </div>
      )}

      {status.type !== "success" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
              Email address
            </label>
            <input
              className="admin-input"
              type="email"
              required
              disabled={!isAdmin || isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contractor@example.com"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
              Full name
            </label>
            <input
              className="admin-input"
              type="text"
              required
              minLength={2}
              disabled={!isAdmin || isLoading}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
              Password
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  className="admin-input"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  disabled={!isAdmin || isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  style={{ width: "100%", paddingRight: 68 }}
                />
                <button
                  type="button"
                  disabled={!isAdmin || isLoading}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    padding: 0,
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <button
                type="button"
                className="btn"
                disabled={!isAdmin || isLoading}
                onClick={handleGenerate}
                style={{ whiteSpace: "nowrap", fontSize: 12 }}
              >
                Generate
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <span style={{ fontSize: 11, color: "#ef4444" }}>
                Password must be at least 8 characters.
              </span>
            )}
            {password.length >= 8 && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Strength:{" "}
                <span
                  style={{
                    color:
                      password.length >= 12 &&
                      /[A-Z]/.test(password) &&
                      /[0-9]/.test(password) &&
                      /[^A-Za-z0-9]/.test(password)
                        ? "#059669"
                        : "#d97706",
                  }}
                >
                  {password.length >= 12 &&
                  /[A-Z]/.test(password) &&
                  /[0-9]/.test(password) &&
                  /[^A-Za-z0-9]/.test(password)
                    ? "Strong"
                    : "Moderate"}
                </span>
              </span>
            )}
          </div>
          <div style={{ paddingTop: 4 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isAdmin || isLoading}
              style={{ minWidth: 140 }}
            >
              {isLoading ? "Creating…" : "Create contractor login"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ContractorPortalPanel({
  isAdmin,
  settings,
  onSettings,
}: {
  isAdmin: boolean;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
}) {
  const meta = settings.meta || {};
  const v = (k: string, def: string) => (meta[k] !== undefined ? String(meta[k]) : def);
  return (
    <div className="admin-panel active">
      <PanelTitle>Contractor portal</PanelTitle>

      <div className="admin-group">
        <div className="admin-group-title">Provision contractor login</div>
        <div style={{ padding: "4px 0 8px" }}>
          <div className="admin-desc" style={{ marginBottom: 14 }}>
            Create a contractor portal account directly — no invite link required. The contractor
            can log in immediately with the credentials you set here.
          </div>
          <ProvisionContractorForm isAdmin={isAdmin} />
        </div>
      </div>

      <div className="admin-group">
        <div className="admin-group-title">Update cadence (Contractor-Led mode)</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Require contractor updates</div>
            <div className="admin-desc">
              In Contractor-Led mode, set how often the GC must submit a project update.
            </div>
            <div className="admin-affects">
              Affects: Contractor portal · Activity log reminders
            </div>
          </div>
          <select
            className="admin-select"
            value={v("contractorUpdateCadence", "Weekly")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: {
                  ...meta,
                  contractorUpdateCadence: e.target.value,
                } as Record<string, unknown>,
              })
            }
          >
            <option>Daily</option>
            <option>Weekly</option>
            <option>Milestone-only</option>
            <option>None</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Missing update escalation</div>
            <div className="admin-desc">
              What happens when a contractor misses an update. &quot;Flag in activity log&quot; creates a
              system entry. &quot;Notify PM&quot; sends an in-app notification.
            </div>
          </div>
          <select
            className="admin-select"
            value={v("missingUpdateEscalation", "Flag in activity log")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: {
                  ...meta,
                  missingUpdateEscalation: e.target.value,
                } as Record<string, unknown>,
              })
            }
          >
            <option>Flag in activity log</option>
            <option>Notify PM</option>
            <option>Flag + Notify PM</option>
            <option>No action</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">PM update requirement</div>
            <div className="admin-desc">
              Whether the PM must also post updates in Contractor-Led mode.
            </div>
          </div>
          <select
            className="admin-select"
            value={v("pmUpdateRequirement", "Optional")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: {
                  ...meta,
                  pmUpdateRequirement: e.target.value,
                } as Record<string, unknown>,
              })
            }
          >
            <option>Required matching contractor cadence</option>
            <option>Optional</option>
            <option>Not required</option>
          </select>
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary">Save</button>
      </div>
    </div>
  );
}

type EventChannels = { email: boolean; inApp: boolean };
type EventsMeta = Record<string, EventChannels>;

const NOTIFY_EVENTS: { key: string; lbl: string; desc: string }[] = [
  {
    key: "drawApprovals",
    lbl: "Draw approvals",
    desc: "When a draw request is approved, rejected, or returned for revisions.",
  },
  {
    key: "docExpiry",
    lbl: "Document expiry alerts",
    desc: "When a tracked document enters the expiry threshold window or lapses.",
  },
  {
    key: "allocations",
    lbl: "Warehouse allocations",
    desc: "When items are allocated to or returned from a project.",
  },
  {
    key: "missingUpdates",
    lbl: "Missing contractor updates",
    desc: "Based on the cadence configured in Contractor portal.",
  },
  {
    key: "exceptions",
    lbl: "Filed exceptions",
    desc: "When a checklist exception is filed on an active project.",
  },
];

function readEvents(meta: Record<string, unknown>): EventsMeta {
  const raw = meta.notifyEvents;
  const out: EventsMeta = {};
  const fallback = (k: string): boolean => {
    const legacyKey = "notify" + k[0].toUpperCase() + k.slice(1);
    const legacy = meta[legacyKey];
    return typeof legacy === "boolean" ? legacy : true;
  };
  for (const ev of NOTIFY_EVENTS) {
    const node =
      raw && typeof raw === "object" && raw !== null
        ? ((raw as Record<string, unknown>)[ev.key] as Record<string, unknown> | undefined)
        : undefined;
    const def = fallback(ev.key);
    out[ev.key] = {
      email: typeof node?.email === "boolean" ? (node.email as boolean) : def,
      inApp: typeof node?.inApp === "boolean" ? (node.inApp as boolean) : def,
    };
  }
  return out;
}

function formatRelativeTime(diffMs: number): string {
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

function formatDurationMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const sec = Math.round(safe / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"}`;
}

const SWEEP_STALE_THRESHOLD_MS = 30 * 60 * 1000;

// Bounds for the per-company stale-alert overrides. Must stay in sync with
// `STALE_THRESHOLD_BOUNDS_MS` / `STALE_THROTTLE_BOUNDS_MS` in
// `lib/notifications/sweep.ts` and the validator in
// `app/api/admin/settings/route.ts` — those are the authoritative limits and
// any drift here would let the form submit values the API rejects.
const STALE_THRESHOLD_MIN_MIN = 15;
const STALE_THRESHOLD_MAX_MIN = 24 * 60;
const STALE_THROTTLE_MIN_HR = 1;
const STALE_THROTTLE_MAX_HR = 7 * 24;

function readMinutes(raw: unknown, fallbackMinutes: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return fallbackMinutes;
  return Math.round(raw / 60_000);
}

function readHours(raw: unknown, fallbackHours: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return fallbackHours;
  return Math.round(raw / 3_600_000);
}

function clampMinutesToMs(
  value: string,
  min: number,
  max: number,
  fallbackMinutes: number
): number {
  const n = Number(value);
  const minutes = Number.isFinite(n) && n > 0 ? Math.round(n) : fallbackMinutes;
  return Math.max(min, Math.min(max, minutes)) * 60_000;
}

function clampHoursToMs(
  value: string,
  min: number,
  max: number,
  fallbackHours: number
): number {
  const n = Number(value);
  const hours = Number.isFinite(n) && n > 0 ? Math.round(n) : fallbackHours;
  return Math.max(min, Math.min(max, hours)) * 3_600_000;
}

// How long the "Last manual run: <name>" line stays visible after a manual
// run. Long enough that an admin who clicks the button can see who else just
// triggered it during a coordinated outage response, but short enough that
// the line doesn't permanently clutter the banner once the dust settles.
const MANUAL_RUN_DISPLAY_WINDOW_MS = 5 * 60 * 1000;

function UnsubscribeLinkDiagnosticRow({
  diagnostic,
}: {
  diagnostic: UnsubscribeLinkDiagnostic;
}) {
  const ok = diagnostic.ok;
  return (
    <div
      className="admin-group"
      style={{
        background: ok ? "#ECFDF5" : "#FEF2F2",
        border: `0.5px solid ${ok ? "#10B981" : "#EF4444"}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 12, color: ok ? "#065F46" : "#991B1B", lineHeight: 1.5 }}>
        <strong>
          {ok ? "Unsubscribe links are working." : "Unsubscribe links are NOT being generated."}
        </strong>{" "}
        {ok ? (
          <>
            Outbound contractor / vendor emails include a one-click unsubscribe link and a{" "}
            <code>List-Unsubscribe</code> header, satisfying Gmail and Yahoo bulk-sender rules.
            Public base URL is sourced from <code>{diagnostic.source}</code> ({diagnostic.origin}).
          </>
        ) : (
          <>
            {diagnostic.reason} Until this is fixed, outbound emails will be sent without an
            unsubscribe link, which hurts deliverability and silently breaks the unsubscribe
            feature for recipients.
          </>
        )}
      </div>
      {ok && diagnostic.sampleUrl ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#065F46",
            wordBreak: "break-all",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          Sample link: {diagnostic.sampleUrl}
        </div>
      ) : null}
    </div>
  );
}

function SweepStatus({
  isAdmin,
  currentUserId,
  lastSweepAt,
  lastStaleAlertAt,
  lastManualSweepAt,
  lastManualSweepByUserId,
  lastManualSweepByName,
  staleAlertThresholdMs,
  staleAlertThrottleMs,
}: {
  isAdmin: boolean;
  currentUserId: string;
  lastSweepAt: string | null;
  lastStaleAlertAt: string | null;
  lastManualSweepAt: string | null;
  lastManualSweepByUserId: string | null;
  lastManualSweepByName: string | null;
  staleAlertThresholdMs: number;
  staleAlertThrottleMs: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [currentSweepAt, setCurrentSweepAt] = useState<string | null>(lastSweepAt);
  const [currentStaleAlertAt, setCurrentStaleAlertAt] = useState<string | null>(
    lastStaleAlertAt
  );
  const [currentThresholdMs, setCurrentThresholdMs] = useState<number>(
    staleAlertThresholdMs
  );
  const [currentThrottleMs, setCurrentThrottleMs] = useState<number>(
    staleAlertThrottleMs
  );
  const [currentManualSweepAt, setCurrentManualSweepAt] = useState<string | null>(
    lastManualSweepAt
  );
  const [currentManualSweepByName, setCurrentManualSweepByName] = useState<
    string | null
  >(lastManualSweepByName);
  const [currentManualSweepByUserId, setCurrentManualSweepByUserId] = useState<
    string | null
  >(lastManualSweepByUserId);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  // Client-side cool-off so the button can't be hammered even if the user
  // clicks it the moment a request returns. The server enforces its own
  // throttle (HTTP 429) but blocking the button locally avoids the round-
  // trip and the brief flash of an error message.
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  useEffect(() => {
    setCurrentSweepAt(lastSweepAt);
  }, [lastSweepAt]);

  useEffect(() => {
    setCurrentStaleAlertAt(lastStaleAlertAt);
  }, [lastStaleAlertAt]);

  useEffect(() => {
    setCurrentThresholdMs(staleAlertThresholdMs);
  }, [staleAlertThresholdMs]);

  useEffect(() => {
    setCurrentThrottleMs(staleAlertThrottleMs);
  }, [staleAlertThrottleMs]);

  useEffect(() => {
    setCurrentManualSweepAt(lastManualSweepAt);
  }, [lastManualSweepAt]);

  useEffect(() => {
    setCurrentManualSweepByName(lastManualSweepByName);
  }, [lastManualSweepByName]);

  useEffect(() => {
    setCurrentManualSweepByUserId(lastManualSweepByUserId);
  }, [lastManualSweepByUserId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Tick once a second while a cooldown is active so the "Wait Xs" countdown
  // on the Run-sweep button updates in real time. Stops as soon as the
  // cooldown elapses to avoid a permanent 1 Hz re-render.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= cooldownUntil) clearInterval(t);
    }, 1_000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/admin/notifications/sweep-status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          lastDigestSweepAt: string | null;
          lastStaleAlertAt?: string | null;
          lastManualSweepAt?: string | null;
          lastManualSweepByUserId?: string | null;
          lastManualSweepByName?: string | null;
          staleAlertThresholdMs?: number;
          staleAlertThrottleMs?: number;
        };
        if (!cancelled) {
          setCurrentSweepAt(data.lastDigestSweepAt ?? null);
          setCurrentStaleAlertAt(data.lastStaleAlertAt ?? null);
          setCurrentManualSweepAt(data.lastManualSweepAt ?? null);
          setCurrentManualSweepByName(data.lastManualSweepByName ?? null);
          setCurrentManualSweepByUserId(data.lastManualSweepByUserId ?? null);
          if (typeof data.staleAlertThresholdMs === "number") {
            setCurrentThresholdMs(data.staleAlertThresholdMs);
          }
          if (typeof data.staleAlertThrottleMs === "number") {
            setCurrentThrottleMs(data.staleAlertThrottleMs);
          }
          setNow(Date.now());
        }
      } catch {
        // Ignore transient errors; the next poll will retry.
      }
    };
    void fetchStatus();
    const t = setInterval(fetchStatus, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const last = currentSweepAt ? new Date(currentSweepAt) : null;
  const valid = last && !Number.isNaN(last.getTime()) ? last : null;
  const diffMs = valid ? now - valid.getTime() : null;
  const stale = diffMs === null || diffMs > SWEEP_STALE_THRESHOLD_MS;
  // Whether the watchdog itself would be eligible to email admins right
  // now. The yellow banner appears earlier (30 min) as a heads-up, but
  // the outage-email subline below should only show once the sweep is
  // also past the email-alert threshold so we don't claim "no email
  // sent yet" before the watchdog is even allowed to send one.
  const alertEligible =
    diffMs === null || (currentThresholdMs > 0 && diffMs > currentThresholdMs);

  const lastAlert = currentStaleAlertAt ? new Date(currentStaleAlertAt) : null;
  const lastAlertValid =
    lastAlert && !Number.isNaN(lastAlert.getTime()) ? lastAlert : null;
  const lastAlertDiffMs = lastAlertValid ? now - lastAlertValid.getTime() : null;
  const nextAlertAt =
    lastAlertValid && currentThrottleMs > 0
      ? new Date(lastAlertValid.getTime() + currentThrottleMs)
      : null;
  const nextAlertDiffMs = nextAlertAt ? nextAlertAt.getTime() - now : null;

  // Derive the "Last manual run" line. Only shown while the timestamp is
  // within the display window so the banner is decluttered once the
  // recovery moment has passed. The name is denormalized on
  // NotificationState so a deleted or renamed user still gets a sensible
  // label; the user id is also stored server-side for future use but
  // isn't currently surfaced in the UI.
  const lastManual = currentManualSweepAt ? new Date(currentManualSweepAt) : null;
  const lastManualValid =
    lastManual && !Number.isNaN(lastManual.getTime()) ? lastManual : null;
  const lastManualDiffMs = lastManualValid
    ? now - lastManualValid.getTime()
    : null;
  const showLastManual =
    lastManualValid !== null &&
    lastManualDiffMs !== null &&
    lastManualDiffMs >= 0 &&
    lastManualDiffMs < MANUAL_RUN_DISPLAY_WINDOW_MS &&
    Boolean(currentManualSweepByName);

  // Schedule a re-render at the moment the manual-run line should drop
  // off. Without this the line would linger on screen for up to the
  // 30-second `now` interval after the window expires. Keyed on the raw
  // timestamp string (not the parsed Date) so the effect doesn't re-fire
  // every render when a fresh Date is constructed.
  useEffect(() => {
    if (!currentManualSweepAt) return;
    const ts = new Date(currentManualSweepAt).getTime();
    if (Number.isNaN(ts)) return;
    const expiresIn = MANUAL_RUN_DISPLAY_WINDOW_MS - (Date.now() - ts);
    if (expiresIn <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), expiresIn + 100);
    return () => clearTimeout(t);
  }, [currentManualSweepAt]);

  const palette = stale
    ? { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" }
    : { bg: "#ECFDF5", border: "#10B981", text: "#065F46" };

  const cooldownRemainingMs = Math.max(0, cooldownUntil - now);
  const runDisabled = !isAdmin || running || cooldownRemainingMs > 0;

  const runSweepNow = async () => {
    if (runDisabled) return;
    setRunning(true);
    setRunError(null);
    setRunMessage(null);
    try {
      const res = await fetch("/api/admin/notifications/run-sweep", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sweepError?: string | null;
        staleAlertError?: string | null;
        lastDigestSweepAt?: string | null;
        lastStaleAlertAt?: string | null;
        lastManualSweepAt?: string | null;
        lastManualSweepByUserId?: string | null;
        lastManualSweepByName?: string | null;
        staleAlertThresholdMs?: number;
        staleAlertThrottleMs?: number;
        manualThrottleMs?: number;
        retryAfterMs?: number;
        error?: string;
      };
      if (res.status === 429) {
        const wait = typeof data.retryAfterMs === "number" ? data.retryAfterMs : 5_000;
        setCooldownUntil(Date.now() + wait);
        setRunError(data.error || "Sweep was just run. Please wait a moment.");
        return;
      }
      if (!res.ok || data.sweepError) {
        setRunError(data.sweepError || data.error || "Failed to run sweep.");
        return;
      }
      if (typeof data.lastDigestSweepAt !== "undefined") {
        setCurrentSweepAt(data.lastDigestSweepAt ?? null);
      }
      if (typeof data.lastStaleAlertAt !== "undefined") {
        setCurrentStaleAlertAt(data.lastStaleAlertAt ?? null);
      }
      if (typeof data.lastManualSweepAt !== "undefined") {
        setCurrentManualSweepAt(data.lastManualSweepAt ?? null);
      }
      if (typeof data.lastManualSweepByName !== "undefined") {
        setCurrentManualSweepByName(data.lastManualSweepByName ?? null);
      }
      if (typeof data.lastManualSweepByUserId !== "undefined") {
        setCurrentManualSweepByUserId(data.lastManualSweepByUserId ?? null);
      }
      if (typeof data.staleAlertThresholdMs === "number") {
        setCurrentThresholdMs(data.staleAlertThresholdMs);
      }
      if (typeof data.staleAlertThrottleMs === "number") {
        setCurrentThrottleMs(data.staleAlertThrottleMs);
      }
      setNow(Date.now());
      setCooldownUntil(
        Date.now() + (typeof data.manualThrottleMs === "number" ? data.manualThrottleMs : 10_000)
      );
      setRunMessage(
        data.staleAlertError
          ? "Sweep ran, but the outage-alert check hit an error (see server logs)."
          : "Sweep ran successfully."
      );
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to run sweep.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="admin-group"
      style={{
        background: palette.bg,
        border: `0.5px solid ${palette.border}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: palette.text,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Notification sweep
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={runSweepNow}
            disabled={runDisabled}
            title={
              !isAdmin
                ? "Admin only"
                : running
                ? "Running…"
                : cooldownRemainingMs > 0
                ? `Available in ${Math.ceil(cooldownRemainingMs / 1000)}s`
                : "Force a sweep for this company now"
            }
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: 4,
              border: `0.5px solid ${palette.border}`,
              background: "#fff",
              color: palette.text,
              cursor: runDisabled ? "not-allowed" : "pointer",
              opacity: runDisabled ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {running
              ? "Running…"
              : cooldownRemainingMs > 0
              ? `Wait ${Math.ceil(cooldownRemainingMs / 1000)}s`
              : "Run sweep now"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: palette.text, lineHeight: 1.5 }}>
        {valid ? (
          <>
            Last successful sweep <strong>{formatRelativeTime(diffMs!)}</strong> (
            {valid.toLocaleString()}).
            {stale && (
              <>
                {" "}
                The sweep should run every 15 minutes. If this stays stale, check the
                scheduled deployment running <code>scripts/notification-sweep.ts</code>{" "}
                and the <code>CRON_SECRET</code> used by{" "}
                <code>/api/cron/notifications-sweep</code>.
              </>
            )}
          </>
        ) : (
          <>
            <strong>No notification sweep recorded yet.</strong> Document expiry and
            contractor lapse alerts will not fire until the scheduled job runs. Check
            that the scheduled deployment for <code>scripts/notification-sweep.ts</code>{" "}
            is enabled, or that an external pinger is calling{" "}
            <code>/api/cron/notifications-sweep</code> with a valid{" "}
            <code>CRON_SECRET</code>.
          </>
        )}
      </div>
      {showLastManual && (
        <div
          style={{
            fontSize: 12,
            color: palette.text,
            lineHeight: 1.5,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `0.5px dashed ${palette.border}`,
          }}
        >
          {currentManualSweepByUserId === currentUserId ? (
            <>
              Last manual run:{" "}
              <span style={{ opacity: 0.7 }}>you</span>,{" "}
              <strong>{formatRelativeTime(lastManualDiffMs!)}</strong> (
              {lastManualValid!.toLocaleString()}).
            </>
          ) : (
            <>
              Last manual run:{" "}
              <strong>{currentManualSweepByName}</strong>,{" "}
              <strong>{formatRelativeTime(lastManualDiffMs!)}</strong> (
              {lastManualValid!.toLocaleString()}).
            </>
          )}
        </div>
      )}
      {stale && alertEligible && (
        <div
          style={{
            fontSize: 12,
            color: palette.text,
            lineHeight: 1.5,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `0.5px dashed ${palette.border}`,
          }}
        >
          {lastAlertValid ? (
            <>
              Admins were last emailed about this{" "}
              <strong>{formatRelativeTime(lastAlertDiffMs!)}</strong> (
              {lastAlertValid.toLocaleString()}).
            </>
          ) : (
            <>
              <strong>No outage email sent yet.</strong> The sweep monitor will email
              admins the next time it runs and finds the sweep stalled.
            </>
          )}{" "}
          {nextAlertAt && nextAlertDiffMs !== null && nextAlertDiffMs > 0 ? (
            <>
              Another alert is throttled for the next{" "}
              <strong>{formatDurationMs(nextAlertDiffMs)}</strong> (next allowed{" "}
              {nextAlertAt.toLocaleString()}).
            </>
          ) : lastAlertValid ? (
            <>Another alert can fire on the next sweep cycle if the sweep is still stalled.</>
          ) : null}
        </div>
      )}
      {stale && !alertEligible && lastAlertValid && (
        <div
          style={{
            fontSize: 12,
            color: palette.text,
            lineHeight: 1.5,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `0.5px dashed ${palette.border}`,
          }}
        >
          Admins were last emailed about a previous outage{" "}
          <strong>{formatRelativeTime(lastAlertDiffMs!)}</strong> (
          {lastAlertValid.toLocaleString()}).
        </div>
      )}
      {(runError || runMessage) && (
        <div
          style={{
            fontSize: 12,
            color: runError ? "#991B1B" : palette.text,
            lineHeight: 1.5,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `0.5px dashed ${palette.border}`,
          }}
        >
          {runError ? <>{runError}</> : <>{runMessage}</>}
        </div>
      )}
    </div>
  );
}

function NotificationsPanel({
  isAdmin,
  currentUserId,
  settings,
  onSettings,
  outboundEmailConfigured,
  unsubscribeLinkDiagnostic,
  lastNotificationSweepAt,
  lastStaleAlertAt,
  lastManualSweepAt,
  lastManualSweepByUserId,
  lastManualSweepByName,
  staleAlertThresholdMs,
  staleAlertThrottleMs,
  initialRecentStaleAlerts,
  initialRecentStaleAlertsHasMore = false,
}: {
  isAdmin: boolean;
  currentUserId: string;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  outboundEmailConfigured: boolean;
  unsubscribeLinkDiagnostic: UnsubscribeLinkDiagnostic;
  lastNotificationSweepAt: string | null;
  lastStaleAlertAt: string | null;
  lastManualSweepAt: string | null;
  lastManualSweepByUserId: string | null;
  lastManualSweepByName: string | null;
  staleAlertThresholdMs: number;
  staleAlertThrottleMs: number;
  initialRecentStaleAlerts: StaleAlertLogEntry[];
  initialRecentStaleAlertsHasMore?: boolean;
}) {
  const meta = settings.meta || {};
  const events = readEvents(meta);

  const updateChannel = (evKey: string, channel: "email" | "inApp", v: boolean) => {
    const next: EventsMeta = { ...events, [evKey]: { ...events[evKey], [channel]: v } };
    onSettings({ meta: { ...meta, notifyEvents: next } as Record<string, unknown> });
  };

  const [deliveryProblemsVersion, setDeliveryProblemsVersion] = useState(0);

  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewCooldownUntil, setPreviewCooldownUntil] = useState(0);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (previewCooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(id);
  }, [previewCooldownUntil]);

  const previewCooldownRemainingMs = Math.max(0, previewCooldownUntil - nowTs);
  const previewDisabled = !isAdmin || sendingPreview || previewCooldownRemainingMs > 0;

  const sendPreview = async () => {
    if (previewDisabled) return;
    setSendingPreview(true);
    setPreviewMessage(null);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/notifications/weekly-recap-preview", {
        method: "POST",
      });
      const data: { ok?: boolean; sentTo?: string; error?: string; retryAfterMs?: number } =
        await res.json();
      if (res.status === 429) {
        const wait = typeof data.retryAfterMs === "number" ? data.retryAfterMs : 60_000;
        setPreviewCooldownUntil(Date.now() + wait);
        setPreviewError(data.error || "A preview was just sent. Please wait before sending another.");
        return;
      }
      if (!res.ok || !data.ok) {
        setPreviewError(data.error || "Failed to send preview.");
        return;
      }
      setPreviewCooldownUntil(Date.now() + 60_000);
      setPreviewMessage(`Preview sent to ${data.sentTo}.`);
    } catch {
      setPreviewError("Failed to send preview.");
    } finally {
      setSendingPreview(false);
    }
  };

  return (
    <div className="admin-panel active">
      <PanelTitle>Notifications</PanelTitle>
      <DeliveryProblems isAdmin={isAdmin} reloadTrigger={deliveryProblemsVersion} />
      <ResolvedDeliveryProblems
        isAdmin={isAdmin}
        onReopenSuccess={() => setDeliveryProblemsVersion((v) => v + 1)}
      />
      <SweepStatus
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        lastSweepAt={lastNotificationSweepAt}
        lastStaleAlertAt={lastStaleAlertAt}
        lastManualSweepAt={lastManualSweepAt}
        lastManualSweepByUserId={lastManualSweepByUserId}
        lastManualSweepByName={lastManualSweepByName}
        staleAlertThresholdMs={staleAlertThresholdMs}
        staleAlertThrottleMs={staleAlertThrottleMs}
      />
      <RecentOutageAlerts
        isAdmin={isAdmin}
        initialItems={initialRecentStaleAlerts}
        initialHasMore={initialRecentStaleAlertsHasMore}
      />
      {!outboundEmailConfigured && (
        <div
          className="admin-group"
          style={{
            background: "#FEF3C7",
            border: "0.5px solid #F59E0B",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
            <strong>Outbound email not configured.</strong> In-app notifications still
            work, but email notifications won&apos;t reach contractors, vendors, or
            teammates&apos; own inboxes until <code>RESEND_API_KEY</code> and{" "}
            <code>EMAIL_FROM</code> are set in the project secrets and the sender
            domain is verified in Resend.
          </div>
        </div>
      )}
      <UnsubscribeLinkDiagnosticRow diagnostic={unsubscribeLinkDiagnostic} />
      <div className="admin-group">
        <div className="admin-group-title">Event routing</div>
        <div
          className="admin-row"
          style={{ borderBottom: "0.5px solid var(--border-mid)", paddingBottom: 6 }}
        >
          <div className="admin-info">
            <div
              className="admin-lbl"
              style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase" }}
            >
              Event
            </div>
          </div>
          <div style={{ display: "flex", gap: 32, fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
            <span style={{ width: 40, textAlign: "center" }}>Email</span>
            <span style={{ width: 40, textAlign: "center" }}>In-app</span>
          </div>
        </div>
        {NOTIFY_EVENTS.map((ev) => (
          <div className="admin-row" key={ev.key}>
            <div className="admin-info">
              <div className="admin-lbl">{ev.lbl}</div>
              <div className="admin-desc">{ev.desc}</div>
            </div>
            <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
              <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
                <Toggle
                  checked={events[ev.key].email}
                  disabled={!isAdmin}
                  onChange={(v) => updateChannel(ev.key, "email", v)}
                />
              </div>
              <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
                <Toggle
                  checked={events[ev.key].inApp}
                  disabled={!isAdmin}
                  onChange={(v) => updateChannel(ev.key, "inApp", v)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Outage alerts</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Stale alert threshold</div>
            <div className="admin-desc">
              Email admins if the notification sweep hasn&apos;t completed for this long.
              Allowed range: 15 minutes to 24 hours. Defaults to 60 minutes when unset.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="admin-input"
              style={{ width: 80 }}
              type="number"
              min={STALE_THRESHOLD_MIN_MIN}
              max={STALE_THRESHOLD_MAX_MIN}
              step={5}
              value={readMinutes(meta.notifyStaleAlertThresholdMs, 60)}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyStaleAlertThresholdMs: clampMinutesToMs(
                      e.target.value,
                      STALE_THRESHOLD_MIN_MIN,
                      STALE_THRESHOLD_MAX_MIN,
                      60
                    ),
                  } as Record<string, unknown>,
                })
              }
            />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>minutes</span>
          </div>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Quiet period between stale alerts</div>
            <div className="admin-desc">
              Wait at least this long before re-emailing admins about the same outage.
              Allowed range: 1 hour to 7 days. Defaults to 6 hours when unset.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="admin-input"
              style={{ width: 80 }}
              type="number"
              min={STALE_THROTTLE_MIN_HR}
              max={STALE_THROTTLE_MAX_HR}
              step={1}
              value={readHours(meta.notifyStaleAlertThrottleMs, 6)}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyStaleAlertThrottleMs: clampHoursToMs(
                      e.target.value,
                      STALE_THROTTLE_MIN_HR,
                      STALE_THROTTLE_MAX_HR,
                      6
                    ),
                  } as Record<string, unknown>,
                })
              }
            />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>hours</span>
          </div>
        </div>
        <div className="admin-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="admin-info">
            <div className="admin-lbl">Weekly recap email</div>
            <div className="admin-desc">
              Email admins a 7-day summary of outage alerts (count, delivered /
              failed, longest staleness). Only sends when at least one alert
              fired in the past week.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Toggle
              checked={meta.notifyWeeklyAlertRecapDisabled !== true}
              disabled={!isAdmin}
              onChange={(v) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyWeeklyAlertRecapDisabled: !v,
                  } as Record<string, unknown>,
                })
              }
            />
            {isAdmin && (
              <button
                type="button"
                onClick={sendPreview}
                disabled={previewDisabled}
                title={
                  sendingPreview
                    ? "Sending…"
                    : previewCooldownRemainingMs > 0
                    ? `Available in ${Math.ceil(previewCooldownRemainingMs / 1000)}s`
                    : "Send a preview of this email to yourself"
                }
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "0.5px solid var(--border-mid)",
                  background: "#fff",
                  color: "var(--text-secondary)",
                  cursor: previewDisabled ? "not-allowed" : "pointer",
                  opacity: previewDisabled ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {sendingPreview
                  ? "Sending…"
                  : previewCooldownRemainingMs > 0
                  ? `Wait ${Math.ceil(previewCooldownRemainingMs / 1000)}s`
                  : "Send preview"}
              </button>
            )}
          </div>
          {(previewMessage || previewError) && (
            <div
              style={{
                width: "100%",
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 4,
                background: previewError ? "#FFF0F0" : "#F0FAF0",
                color: previewError ? "#A8231C" : "#1A6E35",
                border: `0.5px solid ${previewError ? "rgba(168,35,28,0.25)" : "rgba(26,110,53,0.25)"}`,
              }}
            >
              {previewMessage || previewError}
            </div>
          )}
        </div>
        {meta.notifyWeeklyAlertRecapDisabled !== true && (
          <div className="admin-row">
            <div className="admin-info">
              <div className="admin-lbl">Send recap on</div>
              <div className="admin-desc">
                Which day of the week the recap email is delivered (in the
                company timezone). Defaults to Monday.
              </div>
            </div>
            <select
              className="admin-select"
              value={String(meta.notifyWeeklyAlertRecapWeekday ?? "Monday")}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyWeeklyAlertRecapWeekday: e.target.value,
                  } as Record<string, unknown>,
                })
              }
            >
              <option>Sunday</option>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Wednesday</option>
              <option>Thursday</option>
              <option>Friday</option>
              <option>Saturday</option>
            </select>
          </div>
        )}
      </div>
      <div className="admin-group">
        <div className="admin-group-title">Delivery preferences</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Email digest frequency</div>
            <div className="admin-desc">
              How often to bundle non-urgent email notifications into a digest.
            </div>
          </div>
          <select
            className="admin-select"
            value={String(meta.notifyDigestFrequency ?? "Daily")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: {
                  ...meta,
                  notifyDigestFrequency: e.target.value,
                } as Record<string, unknown>,
              })
            }
          >
            <option>Realtime</option>
            <option>Hourly</option>
            <option>Daily</option>
            <option>Weekly</option>
          </select>
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Notification reply-to address</div>
            <div className="admin-desc">
              Where replies to outbound notification emails should be routed.
            </div>
          </div>
          <input
            className="admin-input"
            style={{ width: 240 }}
            placeholder="alerts@yourcompany.com"
            value={String(meta.notifyReplyTo ?? "")}
            disabled={!isAdmin}
            onChange={(e) =>
              onSettings({
                meta: { ...meta, notifyReplyTo: e.target.value } as Record<string, unknown>,
              })
            }
          />
        </div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Quiet hours</div>
            <div className="admin-desc">
              Suppress non-urgent emails outside this window (uses your account timezone).
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="admin-input"
              style={{ width: 80 }}
              type="time"
              value={String(meta.notifyQuietStart ?? "20:00")}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyQuietStart: e.target.value,
                  } as Record<string, unknown>,
                })
              }
            />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>to</span>
            <input
              className="admin-input"
              style={{ width: 80 }}
              type="time"
              value={String(meta.notifyQuietEnd ?? "07:00")}
              disabled={!isAdmin}
              onChange={(e) =>
                onSettings({
                  meta: {
                    ...meta,
                    notifyQuietEnd: e.target.value,
                  } as Record<string, unknown>,
                })
              }
            />
          </div>
        </div>
      </div>
      <div className="save-bar">
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          Changes save automatically
        </span>
      </div>
    </div>
  );
}

type DeliveryFailure = {
  id: string;
  kind: "user" | "contact";
  recipientId: string | null;
  recipientName: string;
  recipientEmail: string | null;
  event: string;
  title: string;
  reason: string;
  at: string;
  link: string | null;
};

function formatFailureReason(reason: string): string {
  // Friendly labels for the most common provider/internal codes. Anything we
  // don't recognise (e.g. raw `provider_error_422: …`) falls through verbatim
  // so admins still see the underlying detail.
  const known: Record<string, string> = {
    invalid_recipient: "Invalid email address",
    no_recipient_email: "No email on file",
    user_missing: "Recipient account no longer exists",
    user_opted_out: "Recipient unsubscribed",
    user_opted_out_event: "Recipient turned this notification off",
    provider_not_configured: "Email transport not configured",
    unknown: "Unknown error",
  };
  if (known[reason]) return known[reason];
  if (reason.startsWith("provider_error_")) {
    return `Email provider rejected (${reason.replace(/^provider_error_/, "").slice(0, 80)})`;
  }
  if (reason.startsWith("transport_error:")) {
    return `Network error${reason.length > 60 ? "" : `: ${reason.slice("transport_error:".length).trim()}`}`;
  }
  return reason;
}

function formatRetryError(code: string | undefined): string {
  switch (code) {
    case "not_found":
      return "Row no longer exists — refresh the list.";
    case "not_failed":
      return "This row already moved on — refresh the list.";
    case "no_recipient_email":
      return "No email on file — add one first.";
    case "user_opted_out":
      return "Recipient unsubscribed — they can't be re-emailed.";
    case "contact_opted_out":
      return "Contact unsubscribed — they can't be re-emailed.";
    case "provider_not_configured":
      return "Email transport isn't configured.";
    case "wrong_company":
      return "That row doesn't belong to your company.";
    case "bad_id":
      return "Bad row id.";
    default:
      return code ? `Retry failed: ${code}` : "Retry failed.";
  }
}

function formatFailureWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type RetryOutcome =
  | { kind: "delivered" }
  | { kind: "still_failing"; reason: string; at: string }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "error"; message: string };

function DeliveryProblems({ isAdmin, reloadTrigger = 0 }: { isAdmin: boolean; reloadTrigger?: number }) {
  const [items, setItems] = useState<DeliveryFailure[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryNote, setRetryNote] = useState<Record<string, { kind: "ok" | "err"; message: string }>>({});
  const [panelNote, setPanelNote] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const panelNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which failure rows are mid-resolve so the "Mark fixed" button
  // can show a "Resolving…" label and we can prevent double-clicks.
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  // Rows the admin has ticked for the bulk "Resolve selected" action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Set while a bulk action ("Resolve selected" / "Clear all") is in flight
  // so we can disable the toolbar buttons and prevent double-submits.
  const [bulkBusy, setBulkBusy] = useState(false);
  // Rate-limit countdown shown while we wait to auto-resume "Retry all".
  const [rateLimitCountdown, setRateLimitCountdown] = useState<{
    secsLeft: number;
    remainingCount: number;
  } | null>(null);
  // Queue saved when a "Retry all" run hits a 429 mid-way; used by the
  // auto-resume timer and the manual "Retry remaining" button.
  const pendingRetryQueueRef = useRef<DeliveryFailure[]>([]);
  const rateLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Kept current so the interval callback can always reference the latest
  // retryAll closure without capturing a stale one.
  const retryAllRef = useRef<((q?: DeliveryFailure[]) => Promise<void>) | null>(null);

  const flashPanelNote = (
    note: { kind: "ok" | "err"; message: string },
    durationMs = 4000
  ) => {
    setPanelNote(note);
    if (panelNoteTimer.current) clearTimeout(panelNoteTimer.current);
    panelNoteTimer.current = setTimeout(() => setPanelNote(null), durationMs);
  };

  useEffect(() => {
    return () => {
      if (panelNoteTimer.current) clearTimeout(panelNoteTimer.current);
      if (rateLimitIntervalRef.current) clearInterval(rateLimitIntervalRef.current);
    };
  }, []);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/notification-failures", { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as { items: DeliveryFailure[] };
        setItems(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Performs the network call for a single retry and returns a structured
  // outcome. Kept side-effect-free so both the per-row Retry button and the
  // panel-wide Retry-all loop can share the same wire format and rate-limit
  // handling.
  const runRetry = async (it: DeliveryFailure): Promise<RetryOutcome> => {
    try {
      const r = await fetch("/api/admin/notification-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, action: "retry" }),
      });
      if (r.status === 429) {
        const data = (await r.json().catch(() => ({}))) as { retryAfterMs?: number };
        return { kind: "rate_limited", retryAfterMs: data.retryAfterMs ?? 15000 };
      }
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        return { kind: "error", message: formatRetryError(data.error) };
      }
      const data = (await r.json()) as {
        delivered: boolean;
        reason: string | null;
        status: "Sent" | "Failed";
        at: string;
      };
      if (data.delivered) return { kind: "delivered" };
      return { kind: "still_failing", reason: data.reason ?? "unknown", at: data.at };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "Retry failed",
      };
    }
  };

  // Applies a runRetry outcome to local UI state. `silentPanelOk` skips the
  // per-row "Sent to X" panel flash so a Retry-all run can show one summary
  // toast instead of N rapid-fire ones.
  const applyRetryResult = (
    it: DeliveryFailure,
    res: RetryOutcome,
    opts: { silentPanelOk?: boolean } = {}
  ) => {
    if (res.kind === "delivered") {
      setItems((prev) => (prev ? prev.filter((row) => row.id !== it.id) : prev));
      setRetryNote((m) => {
        const { [it.id]: _omit, ...rest } = m;
        return rest;
      });
      if (!opts.silentPanelOk) {
        flashPanelNote({ kind: "ok", message: `Sent to ${it.recipientName}.` });
      }
    } else if (res.kind === "still_failing") {
      setItems((prev) =>
        prev
          ? prev.map((row) =>
              row.id === it.id ? { ...row, reason: res.reason, at: res.at } : row
            )
          : prev
      );
      setRetryNote((m) => ({
        ...m,
        [it.id]: { kind: "err", message: "Still failing — see updated reason." },
      }));
    } else if (res.kind === "rate_limited") {
      const secs = Math.max(1, Math.ceil(res.retryAfterMs / 1000));
      setRetryNote((m) => ({
        ...m,
        [it.id]: { kind: "err", message: `Please wait ${secs}s before retrying again.` },
      }));
    } else {
      setRetryNote((m) => ({
        ...m,
        [it.id]: { kind: "err", message: res.message },
      }));
    }
  };

  const retry = async (it: DeliveryFailure) => {
    setRetrying((m) => ({ ...m, [it.id]: true }));
    setRetryNote((m) => {
      const { [it.id]: _omit, ...rest } = m;
      return rest;
    });
    try {
      const res = await runRetry(it);
      applyRetryResult(it, res);
    } finally {
      setRetrying((m) => {
        const { [it.id]: _omit, ...rest } = m;
        return rest;
      });
    }
  };

  // Walks a queue of failure rows through the retry endpoint one at a time.
  // Accepts an optional `queueOverride` so the auto-resume path can pass the
  // saved pending queue instead of snapshotting `items` again.
  // Honors the server's per-row + per-admin rate limits — when a 429 is
  // returned the loop stops, saves the remaining items, and starts a live
  // countdown. When the countdown reaches zero the remaining queue is
  // re-submitted automatically; the admin can also hit "Retry remaining N"
  // to skip the wait and resume immediately.
  const retryAll = async (queueOverride?: DeliveryFailure[]) => {
    const queue = queueOverride ?? (items ? items.slice() : []);
    if (queue.length === 0 || retryingAll) return;

    // Cancel any in-progress countdown from a previous rate-limited run.
    if (rateLimitIntervalRef.current) {
      clearInterval(rateLimitIntervalRef.current);
      rateLimitIntervalRef.current = null;
    }
    setRateLimitCountdown(null);
    pendingRetryQueueRef.current = [];

    setRetryingAll(true);
    // Snapshot the queue: as rows succeed they're removed from `items`, so we
    // can't iterate over the live array.
    let succeeded = 0;
    let stillFailing = 0;
    let errored = 0;
    let processed = 0;
    let stoppedByRateLimit: number | null = null;
    try {
      for (const it of queue) {
        setRetrying((m) => ({ ...m, [it.id]: true }));
        setRetryNote((m) => {
          const { [it.id]: _omit, ...rest } = m;
          return rest;
        });
        const res = await runRetry(it);
        applyRetryResult(it, res, { silentPanelOk: true });
        setRetrying((m) => {
          const { [it.id]: _omit, ...rest } = m;
          return rest;
        });
        if (res.kind === "delivered") {
          succeeded++;
          processed++;
        } else if (res.kind === "still_failing") {
          stillFailing++;
          processed++;
        } else if (res.kind === "error") {
          errored++;
          processed++;
        } else {
          // Rate limited — stop the loop so we don't burn the rest of the
          // queue against a window we know is closed. Save the remaining
          // items (including the current one that got the 429) and start
          // a countdown so we can auto-resume when the window clears.
          stoppedByRateLimit = res.retryAfterMs;
          break;
        }
      }

      const stillFailingTotal = stillFailing + errored;
      if (stoppedByRateLimit !== null) {
        const remaining = queue.slice(processed);
        const secs = Math.max(1, Math.ceil(stoppedByRateLimit / 1000));

        // Save the remaining queue for the auto-resume timer.
        pendingRetryQueueRef.current = remaining;
        setRateLimitCountdown({ secsLeft: secs, remainingCount: remaining.length });

        // Show a brief progress summary while the countdown is running.
        if (processed > 0) {
          flashPanelNote(
            {
              kind: succeeded > 0 ? "ok" : "err",
              message: `Retried ${processed} of ${queue.length}: ${succeeded} sent, ${stillFailingTotal} still failing — auto-resuming ${remaining.length} below.`,
            },
            Math.max(6000, secs * 1000)
          );
        }

        // Tick the countdown every second. When it reaches zero, clear the
        // state and re-invoke retryAll on the saved queue (auto-resume).
        rateLimitIntervalRef.current = setInterval(() => {
          setRateLimitCountdown((prev) => {
            if (!prev) {
              if (rateLimitIntervalRef.current) {
                clearInterval(rateLimitIntervalRef.current);
                rateLimitIntervalRef.current = null;
              }
              return null;
            }
            const next = prev.secsLeft - 1;
            if (next <= 0) {
              if (rateLimitIntervalRef.current) {
                clearInterval(rateLimitIntervalRef.current);
                rateLimitIntervalRef.current = null;
              }
              // Auto-resume: fire after state has settled so `retryingAll`
              // is already false (set in the finally block below).
              const q = pendingRetryQueueRef.current;
              pendingRetryQueueRef.current = [];
              if (q.length > 0 && retryAllRef.current) {
                setTimeout(() => retryAllRef.current!(q), 0);
              }
              return null;
            }
            return { ...prev, secsLeft: next };
          });
        }, 1000);
      } else {
        flashPanelNote(
          {
            kind: stillFailingTotal === 0 ? "ok" : succeeded > 0 ? "ok" : "err",
            message: `Retried ${queue.length}: ${succeeded} sent, ${stillFailingTotal} still failing.`,
          },
          6000
        );
      }
    } finally {
      setRetryingAll(false);
    }
  };

  // Keep retryAllRef current on every render so the interval callback always
  // calls the latest closure (which captures up-to-date state).
  useEffect(() => {
    retryAllRef.current = retryAll;
  });

  // Generalised "mark fixed" helper used by both the per-row link and the
  // bulk-resolve toolbar. Posts every id in a single request so the badge
  // updates in one tick instead of N round-trips.
  const resolveMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    setResolvingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      const r = await fetch("/api/admin/notification-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Optimistically drop the resolved rows from the list so the badge
      // count updates immediately without waiting for a refetch.
      const dropped = new Set(ids);
      setItems((prev) => (prev ? prev.filter((x) => !dropped.has(x.id)) : prev));
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (ids.length > 1) {
        flashPanelNote({
          kind: "ok",
          message: `Resolved ${ids.length} delivery problem${ids.length === 1 ? "" : "s"}.`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve");
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  const resolveOne = (id: string) => resolveMany([id]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allShownSelected =
    !!items && items.length > 0 && items.every((it) => selectedIds.has(it.id));

  const toggleSelectAllShown = () => {
    if (!items) return;
    setSelectedIds((prev) => {
      if (items.every((it) => prev.has(it.id))) {
        // Currently every visible row is selected — treat as "clear".
        const next = new Set(prev);
        for (const it of items) next.delete(it.id);
        return next;
      }
      const next = new Set(prev);
      for (const it of items) next.add(it.id);
      return next;
    });
  };

  const resolveSelected = async () => {
    if (!items) return;
    // Only resolve ids that are still visible — guards against a stale
    // selection lingering after a refresh.
    const visible = new Set(items.map((it) => it.id));
    const ids = Array.from(selectedIds).filter((id) => visible.has(id));
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await resolveMany(ids);
    } finally {
      setBulkBusy(false);
    }
  };

  const clearAll = async () => {
    if (!items || items.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Mark all ${items.length} delivery problem${items.length === 1 ? "" : "s"} as resolved? They'll move to the resolved-history list.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await resolveMany(items.map((it) => it.id));
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load, reloadTrigger]);

  if (!isAdmin) return null;

  return (
    <div className="admin-group" style={{ marginBottom: 12 }}>
      <div
        className="admin-group-title"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <span>
          Delivery problems
          {items && items.length > 0 ? (
            <span
              style={{
                marginLeft: 8,
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: 10,
                padding: "1px 8px",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {items.length}
            </span>
          ) : null}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {items && items.length > 0 ? (() => {
            // Block Retry all while a single-row retry is already in flight
            // so we never fire two retries against the same row in parallel.
            const anyRowRetrying = Object.values(retrying).some(Boolean);
            const disabled = retryingAll || loading || anyRowRetrying;
            return (
              <button
                type="button"
                onClick={() => retryAll()}
                disabled={disabled}
                title={
                  anyRowRetrying && !retryingAll
                    ? "Wait for the in-progress retry to finish"
                    : "Re-send every visible failure in sequence"
                }
                style={{
                  background: "transparent",
                  border: "none",
                  color: disabled ? "#999" : "#0f62fe",
                  fontSize: 11,
                  cursor: disabled ? "default" : "pointer",
                  padding: 0,
                }}
              >
                {retryingAll ? "Retrying all…" : "Retry all"}
              </button>
            );
          })() : null}
          <button
            type="button"
            onClick={load}
            disabled={loading || retryingAll}
            style={{
              background: "transparent",
              border: "none",
              color: loading || retryingAll ? "#999" : "#0f62fe",
              fontSize: 11,
              cursor: loading || retryingAll ? "default" : "pointer",
              padding: 0,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
        Recent notification emails the provider rejected or couldn&apos;t deliver. Fix the
        address, then click <strong>Retry</strong> for instant feedback — or wait for the
        next sweep to pick it up.
      </div>
      {panelNote ? (
        <div
          style={{
            fontSize: 11,
            padding: "4px 8px",
            marginBottom: 8,
            borderRadius: 4,
            background: panelNote.kind === "ok" ? "#dcfce7" : "#fee2e2",
            color: panelNote.kind === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {panelNote.message}
        </div>
      ) : null}
      {rateLimitCountdown ? (
        <div
          style={{
            fontSize: 11,
            padding: "6px 10px",
            marginBottom: 8,
            borderRadius: 4,
            background: "#fef9c3",
            color: "#713f12",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>
            Rate limit reached — retrying remaining{" "}
            <strong>{rateLimitCountdown.remainingCount}</strong> in{" "}
            <strong>{rateLimitCountdown.secsLeft}s</strong>…
          </span>
          <button
            type="button"
            onClick={() => {
              const q = pendingRetryQueueRef.current;
              retryAll(q.length > 0 ? q : undefined);
            }}
            style={{
              background: "transparent",
              border: "1px solid #92400e",
              color: "#92400e",
              fontSize: 10,
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Retry remaining {rateLimitCountdown.remainingCount} now
          </button>
        </div>
      ) : null}
      {error ? (
        <div style={{ fontSize: 11, color: "#a51b1b", padding: 8 }}>
          Couldn&apos;t load delivery failures: {error}
        </div>
      ) : null}
      {!loading && items && items.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            padding: "12px 8px",
            background: "#f7f8fa",
            border: "0.5px solid var(--border-mid)",
            borderRadius: 4,
          }}
        >
          No recent delivery problems. Outbound notifications are reaching their recipients.
        </div>
      ) : null}
      {items && items.length > 0 ? (
        <div
          style={{
            border: "0.5px solid var(--border-mid)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {/*
            Bulk toolbar — lets admins tackle a whole batch of stale failures
            at once after fixing the underlying config (bad domain, rotated
            SMTP key, etc.) instead of clicking "Mark fixed" N times. The
            "select all visible" checkbox toggles the entire shown list, the
            "Resolve selected" button posts every ticked id in a single
            request, and "Clear all" resolves every visible row after a
            confirmation.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
              background: "#f7f8fa",
              borderBottom: "0.5px solid var(--border-mid)",
              fontSize: 11,
              color: "#444",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: bulkBusy ? "default" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={toggleSelectAllShown}
                disabled={bulkBusy}
                aria-label="Select all delivery problems shown"
              />
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : `Select all (${items.length})`}
              </span>
            </label>
            <button
              type="button"
              onClick={resolveSelected}
              disabled={bulkBusy || selectedIds.size === 0}
              style={{
                background: "transparent",
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
                color:
                  bulkBusy || selectedIds.size === 0 ? "#999" : "#0f62fe",
                fontSize: 11,
                padding: "1px 8px",
                cursor:
                  bulkBusy || selectedIds.size === 0 ? "default" : "pointer",
              }}
            >
              {bulkBusy && selectedIds.size > 0
                ? "Resolving…"
                : `Resolve selected${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={bulkBusy}
              title="Mark every delivery problem shown as resolved"
              style={{
                background: "transparent",
                border: "none",
                color: bulkBusy ? "#999" : "#0f62fe",
                fontSize: 11,
                padding: 0,
                marginLeft: "auto",
                cursor: bulkBusy ? "default" : "pointer",
                textDecoration: "underline",
              }}
            >
              {bulkBusy && selectedIds.size === 0
                ? "Clearing…"
                : `Clear all (${items.length})`}
            </button>
          </div>
          {items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                padding: "8px 10px",
                borderTop: idx === 0 ? "none" : "0.5px solid var(--border-mid)",
                background: selectedIds.has(it.id) ? "#eff6ff" : "#fff",
                fontSize: 12,
              }}
            >
              <div style={{ paddingTop: 2 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(it.id)}
                  onChange={() => toggleSelected(it.id)}
                  disabled={bulkBusy || resolvingIds.has(it.id)}
                  aria-label={`Select delivery problem for ${it.recipientName}`}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ color: "#111" }}>{it.recipientName}</strong>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#666",
                      background: it.kind === "contact" ? "#fef3c7" : "#dbeafe",
                      padding: "1px 6px",
                      borderRadius: 8,
                    }}
                  >
                    {it.kind === "contact" ? "Contact" : "Teammate"}
                  </span>
                  {it.recipientEmail ? (
                    <span style={{ color: "#666", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.recipientEmail}
                    </span>
                  ) : (
                    <span style={{ color: "#a51b1b", fontSize: 11 }}>(no email on file)</span>
                  )}
                </div>
                <div style={{ color: "#444", marginTop: 2 }}>{it.title}</div>
                <div style={{ color: "#a51b1b", fontSize: 11, marginTop: 2 }}>
                  {formatFailureReason(it.reason)}
                </div>
                {retryNote[it.id] ? (
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 2,
                      color: retryNote[it.id].kind === "ok" ? "#166534" : "#a51b1b",
                    }}
                  >
                    {retryNote[it.id].message}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 4,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 10, color: "#888" }}>{formatFailureWhen(it.at)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => retry(it)}
                    disabled={!!retrying[it.id] || retryingAll}
                    style={{
                      background: "transparent",
                      border: "0.5px solid var(--border-mid)",
                      borderRadius: 4,
                      color: retrying[it.id] || retryingAll ? "#999" : "#0f62fe",
                      fontSize: 11,
                      padding: "1px 8px",
                      cursor: retrying[it.id] || retryingAll ? "default" : "pointer",
                    }}
                  >
                    {retrying[it.id] ? "Retrying…" : "Retry"}
                  </button>
                  {it.link ? (
                    <a
                      href={it.link}
                      style={{ fontSize: 11, color: "#0f62fe", textDecoration: "none" }}
                    >
                      Fix →
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => resolveOne(it.id)}
                    disabled={resolvingIds.has(it.id) || retryingAll}
                    title="Mark this delivery problem as resolved"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: resolvingIds.has(it.id) || retryingAll ? "#999" : "#666",
                      fontSize: 11,
                      cursor: resolvingIds.has(it.id) || retryingAll ? "default" : "pointer",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    {resolvingIds.has(it.id) ? "Resolving…" : "Mark fixed"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { DeliveryProblems };

// Friendly labels for the small set of `resolvedReason` values our backend
// writes today. Anything unrecognised falls through verbatim so audits still
// see the raw code rather than silently mislabelling it.
function formatResolvedReason(reason: string | null | undefined): {
  label: string;
  fg: string;
  bg: string;
} {
  switch (reason) {
    case "auto_later_send_succeeded":
      return { label: "Auto-cleared (delivered later)", fg: "#166534", bg: "#dcfce7" };
    case "admin_dismissed":
      return { label: "Dismissed by admin", fg: "#3730a3", bg: "#e0e7ff" };
    default:
      return { label: reason || "Resolved", fg: "#374151", bg: "#e5e7eb" };
  }
}

function formatResolvedWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

type ResolvedDeliveryFailure = {
  id: string;
  kind: "user" | "contact";
  recipientId: string | null;
  recipientName: string;
  recipientEmail: string | null;
  event: string;
  title: string;
  reason: string;
  failedAt: string;
  resolvedAt: string;
  resolvedReason: string;
  resolvedById: string | null;
  resolvedByName: string | null;
  link: string | null;
};

/**
 * Audit-only view of resolved delivery failures. Lives under the live
 * "Delivery problems" panel as a collapsible section so the section is
 * out-of-the-way until an admin asks "what happened to that row I
 * dismissed last week?". The list is paginated with a `before` cursor so
 * tenants with months of history still load instantly.
 */
function ResolvedDeliveryProblems({ isAdmin, onReopenSuccess }: { isAdmin: boolean; onReopenSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ResolvedDeliveryFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reopeningIds, setReopeningIds] = useState<Set<string>>(new Set());
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Filter state
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState<"" | "auto" | "admin">("");

  // Debounce search so we don't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Track the in-flight load request so we can abort it when filters change
  // before the previous fetch resolves, preventing stale data from landing.
  const loadAbortRef = useRef<AbortController | null>(null);

  // Filter-aware load: used when debouncedQ or reasonFilter changes and when
  // the admin clicks Refresh. Resets items so stale rows don't flash.
  // Aborts any prior in-flight request before starting a new one.
  const loadFiltered = useMemo(
    () => async (qVal: string, reason: string) => {
      // Cancel any previous in-flight fetch so its response is ignored.
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      setLoading(true);
      setError(null);
      setItems([]);
      setNextCursor(null);
      try {
        const p = new URLSearchParams({ resolved: "1" });
        if (qVal) p.set("q", qVal);
        if (reason) p.set("reason", reason);
        const r = await fetch(`/api/admin/notification-failures?${p.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as {
          items: ResolvedDeliveryFailure[];
          nextCursor: string | null;
        };
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (err) {
        // Ignore errors from aborted requests — a newer fetch is already running.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        // Only clear loading if this controller is still the active one.
        if (loadAbortRef.current === controller) setLoading(false);
      }
    },
    []
  );

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const p = new URLSearchParams({ resolved: "1" });
      if (debouncedQ) p.set("q", debouncedQ);
      if (reasonFilter) p.set("reason", reasonFilter);
      p.set("before", nextCursor);
      const r = await fetch(
        `/api/admin/notification-failures?${p.toString()}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as {
        items: ResolvedDeliveryFailure[];
        nextCursor: string | null;
      };
      // Defensive de-dupe in case the cursor row reappears (e.g. another
      // admin resolved a new row with an identical timestamp).
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...data.items.filter((x) => !seen.has(x.id))];
      });
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const reopen = async (id: string) => {
    setReopeningIds((prev) => new Set(prev).add(id));
    setReopenError(null);
    try {
      const r = await fetch("/api/admin/notification-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action: "reopen" }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${r.status})`);
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      onReopenSuccess?.();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Failed to re-open");
    } finally {
      setReopeningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Lazy-load on first open; also re-run whenever filters change.
  useEffect(() => {
    if (!isAdmin || !open) return;
    loadFiltered(debouncedQ, reasonFilter);
  // We intentionally exclude loadFiltered from deps since it's stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, open, debouncedQ, reasonFilter]);

  if (!isAdmin) return null;

  return (
    <div className="admin-group" style={{ marginBottom: 12 }}>
      <div
        className="admin-group-title"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-expanded={open}
        >
          <span style={{ fontSize: 11, color: "#666", width: 10, display: "inline-block" }}>
            {open ? "▾" : "▸"}
          </span>
          <span>View resolved delivery problems</span>
        </button>
        {open ? (
          <button
            type="button"
            onClick={() => loadFiltered(debouncedQ, reasonFilter)}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "#0f62fe",
              fontSize: 11,
              cursor: loading ? "default" : "pointer",
              padding: 0,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: open ? 8 : 0 }}>
        Audit log of delivery problems that were dismissed by an admin or
        auto-cleared once a later send succeeded.
      </div>
      {open ? (
        <>
          {/* Search + filter bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <input
              type="search"
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                flex: "1 1 160px",
                minWidth: 120,
                fontSize: 11,
                padding: "3px 7px",
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
                outline: "none",
                background: "#fff",
              }}
            />
            {(["", "auto", "admin"] as const).map((val) => {
              const label =
                val === "" ? "All" : val === "auto" ? "Auto-cleared" : "Dismissed by admin";
              const active = reasonFilter === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setReasonFilter(val)}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: active
                      ? "0.5px solid #0f62fe"
                      : "0.5px solid var(--border-mid)",
                    background: active ? "#0f62fe" : "#fff",
                    color: active ? "#fff" : "#444",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {error ? (
            <div style={{ fontSize: 11, color: "#a51b1b", padding: 8 }}>
              Couldn&apos;t load resolved problems: {error}
            </div>
          ) : null}
          {reopenError ? (
            <div style={{ fontSize: 11, color: "#a51b1b", padding: 8 }}>
              Re-open failed: {reopenError}
            </div>
          ) : null}
          {loading && items.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "12px 8px" }}>
              Loading…
            </div>
          ) : null}
          {!loading && items.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                padding: "12px 8px",
                background: "#f7f8fa",
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
              }}
            >
              {debouncedQ || reasonFilter
                ? "No matching resolved problems."
                : "No resolved delivery problems yet. Anything you mark fixed or that auto-clears will show up here for audit."}
            </div>
          ) : null}
          {items.length > 0 ? (
            <div
              style={{
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              {items.map((it, idx) => {
                const reasonStyle = formatResolvedReason(it.resolvedReason);
                const isReopening = reopeningIds.has(it.id);
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      padding: "8px 10px",
                      borderTop: idx === 0 ? "none" : "0.5px solid var(--border-mid)",
                      background: "#fff",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong style={{ color: "#111" }}>{it.recipientName}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            color: "#666",
                            background: it.kind === "contact" ? "#fef3c7" : "#dbeafe",
                            padding: "1px 6px",
                            borderRadius: 8,
                          }}
                        >
                          {it.kind === "contact" ? "Contact" : "Teammate"}
                        </span>
                        {it.recipientEmail ? (
                          <span style={{ color: "#666", fontSize: 11 }}>{it.recipientEmail}</span>
                        ) : null}
                      </div>
                      <div style={{ color: "#444", marginTop: 2 }}>{it.title}</div>
                      <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                        Failed: {formatFailureReason(it.reason)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: reasonStyle.fg,
                          background: reasonStyle.bg,
                          padding: "1px 6px",
                          borderRadius: 8,
                        }}
                      >
                        {reasonStyle.label}
                      </span>
                      <span style={{ fontSize: 10, color: "#888" }}>
                        {formatResolvedWhen(it.resolvedAt)}
                      </span>
                      {it.resolvedByName ? (
                        <span style={{ fontSize: 10, color: "#666" }}>
                          by {it.resolvedByName}
                        </span>
                      ) : it.resolvedReason === "auto_later_send_succeeded" ? (
                        <span style={{ fontSize: 10, color: "#666" }}>by system</span>
                      ) : null}
                      <button
                        type="button"
                        disabled={isReopening}
                        onClick={() => reopen(it.id)}
                        style={{
                          marginTop: 2,
                          background: "transparent",
                          border: "0.5px solid var(--border-mid)",
                          borderRadius: 4,
                          color: isReopening ? "#999" : "#0f62fe",
                          fontSize: 10,
                          padding: "2px 8px",
                          cursor: isReopening ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isReopening ? "Re-opening…" : "Re-open"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {nextCursor ? (
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background: "transparent",
                  border: "0.5px solid var(--border-mid)",
                  borderRadius: 4,
                  color: "#0f62fe",
                  fontSize: 11,
                  padding: "2px 10px",
                  cursor: loadingMore ? "default" : "pointer",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatStaleAlertReason(reason: string | undefined): string {
  if (!reason) return "Failed to deliver";
  const known: Record<string, string> = {
    invalid_recipient: "Invalid email address",
    no_recipient_email: "No email on file",
    user_missing: "Recipient account no longer exists",
    user_opted_out: "Recipient unsubscribed",
    user_opted_out_event: "Recipient turned this notification off",
    provider_not_configured: "Email transport not configured",
    unknown: "Unknown error",
  };
  if (known[reason]) return known[reason];
  if (reason.startsWith("provider_error_")) {
    return `Email provider rejected (${reason.replace(/^provider_error_/, "").slice(0, 80)})`;
  }
  if (reason.startsWith("transport_error:")) {
    return `Network error: ${reason.slice("transport_error:".length).trim().slice(0, 80)}`;
  }
  return reason;
}

function RecentOutageAlerts({
  isAdmin,
  initialItems,
  initialHasMore = false,
}: {
  isAdmin: boolean;
  initialItems: StaleAlertLogEntry[];
  initialHasMore?: boolean;
}) {
  const [items, setItems] = useState<StaleAlertLogEntry[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/notifications/stale-alerts?page=0", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as { items: StaleAlertLogEntry[]; hasMore: boolean };
        setItems(data.items);
        setHasMore(data.hasMore);
        setNextPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/notifications/stale-alerts?page=${nextPage}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { items: StaleAlertLogEntry[]; hasMore: boolean };
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setNextPage((p) => p + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  if (!isAdmin) return null;

  const count = items.length;

  return (
    <div className="admin-group" style={{ marginBottom: 12 }}>
      <div
        className="admin-group-title"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-expanded={open}
        >
          <span style={{ fontSize: 11, color: "#666", width: 10, display: "inline-block" }}>
            {open ? "▾" : "▸"}
          </span>
          <span>Recent outage alerts</span>
          {count > 0 ? (
            <span
              style={{
                marginLeft: 4,
                background: "#fef3c7",
                color: "#92400e",
                borderRadius: 10,
                padding: "1px 8px",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {count}
            </span>
          ) : null}
        </button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <a
            href="/api/admin/notifications/stale-alerts/csv"
            download
            style={{
              color: "#0f62fe",
              fontSize: 11,
              textDecoration: "none",
            }}
            title="Download the full 30-day outage alert history as CSV"
          >
            Download CSV
          </a>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "#0f62fe",
              fontSize: 11,
              cursor: loading ? "default" : "pointer",
              padding: 0,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: open ? 8 : 0 }}>
        Last 30 days of outage emails sent by the sweep monitor. Use this to
        confirm admins were paged during a past incident or to spot a
        chronically broken sweep.
      </div>
      {open ? (
        <>
          {error ? (
            <div style={{ fontSize: 11, color: "#a51b1b", padding: 8 }}>
              Couldn&apos;t load outage alerts: {error}
            </div>
          ) : null}
          {!loading && count === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                padding: "12px 8px",
                background: "#f7f8fa",
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
              }}
            >
              No outage alerts in the last 30 days. The sweep has been
              running normally — or no admins were emailed because the
              monitor was throttled.
            </div>
          ) : null}
          {count > 0 ? (
            <div
              style={{
                border: "0.5px solid var(--border-mid)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              {items.map((it, idx) => {
                const isExpanded = expandedId === it.id;
                const allDelivered =
                  it.failedCount === 0 && it.deliveredCount > 0;
                const allFailed =
                  it.deliveredCount === 0 && it.recipientCount > 0;
                const statusBg = allDelivered
                  ? "#dcfce7"
                  : allFailed
                  ? "#fee2e2"
                  : "#fef3c7";
                const statusFg = allDelivered
                  ? "#166534"
                  : allFailed
                  ? "#991b1b"
                  : "#92400e";
                const statusLabel = allDelivered
                  ? "Delivered"
                  : allFailed
                  ? "All failed"
                  : `${it.deliveredCount}/${it.recipientCount} delivered`;
                return (
                  <div
                    key={it.id}
                    style={{
                      borderTop: idx === 0 ? "none" : "0.5px solid var(--border-mid)",
                      background: "#fff",
                      fontSize: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : it.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        width: "100%",
                        padding: "8px 10px",
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#666", width: 10 }}>
                            {isExpanded ? "▾" : "▸"}
                          </span>
                          <strong style={{ color: "#111" }}>
                            {new Date(it.sentAt).toLocaleString()}
                          </strong>
                          <span
                            style={{
                              fontSize: 10,
                              color: statusFg,
                              background: statusBg,
                              padding: "1px 6px",
                              borderRadius: 8,
                              fontWeight: 600,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div
                          style={{ color: "#444", marginTop: 2, marginLeft: 16 }}
                        >
                          {it.staleForMs !== null
                            ? `Sweep was stale for ${formatDurationMs(it.staleForMs)}`
                            : "Sweep had no recorded run"}
                          {" · "}
                          {it.recipientCount} admin
                          {it.recipientCount === 1 ? "" : "s"} paged
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ fontSize: 10, color: "#888" }}>
                          {formatFailureWhen(it.sentAt)}
                        </span>
                      </div>
                    </button>
                    {isExpanded ? (
                      <div
                        style={{
                          padding: "8px 10px 10px 26px",
                          borderTop: "0.5px dashed var(--border-mid)",
                          background: "#fafbfc",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "#666",
                            marginBottom: 6,
                          }}
                        >
                          Threshold {formatDurationMs(it.thresholdMs)} · throttle{" "}
                          {formatDurationMs(it.throttleMs)}
                        </div>
                        {it.recipients.length === 0 ? (
                          <div style={{ fontSize: 11, color: "#666" }}>
                            No per-recipient detail recorded.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            {it.recipients.map((r, i) => (
                              <div
                                key={`${r.email}-${i}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontSize: 11,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: r.delivered ? "#166534" : "#991b1b",
                                    background: r.delivered
                                      ? "#dcfce7"
                                      : "#fee2e2",
                                    padding: "1px 6px",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    minWidth: 60,
                                    textAlign: "center",
                                  }}
                                >
                                  {r.delivered ? "Delivered" : "Failed"}
                                </span>
                                <span style={{ color: "#222" }}>{r.email}</span>
                                {!r.delivered ? (
                                  <span
                                    style={{ color: "#a51b1b", fontSize: 11 }}
                                  >
                                    {formatStaleAlertReason(r.reason)}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {hasMore ? (
            <div style={{ marginTop: 6, textAlign: "center" }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore || loading}
                style={{
                  background: "transparent",
                  border: "0.5px solid var(--border-mid)",
                  borderRadius: 4,
                  color: "#0f62fe",
                  fontSize: 11,
                  cursor: loadingMore || loading ? "default" : "pointer",
                  padding: "4px 12px",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { goldBridgeFetch } from "@/lib/goldBridgeApi";
import UpgradeModal from "@/components/UpgradeModal";

type TeamRole = "Admin" | "Viewer";

type Member = {
  id: string;
  email: string;
  name?: string | null;
  role: TeamRole | string;
  status?: "active" | "pending" | string;
  inviteId?: string | null;
};

type Guest = {
  id: string;
  email: string;
  name?: string | null;
  role: TeamRole | string;
  status?: "active" | "pending" | string;
  inviteId?: string | null;
};

type MembersResponse = {
  members?: Member[];
  guests?: Guest[];
  invites?: Array<Member & { inviteId: string; kind?: "member" | "guest" }>;
};

type Billing = {
  plan?: string;
  seats_used?: number;
  seat_limit?: number;
  guests_used?: number;
  guest_limit?: number;
};

type MeResponse = {
  billing?: Billing;
};

const apiFetch = goldBridgeFetch;

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#111",
        color: "#fff",
        padding: "8px 14px",
        borderRadius: 4,
        fontSize: 12,
        zIndex: 1000,
      }}
    >
      {message}
    </div>
  );
}

function UsageBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit > 0 && used >= limit;
  return (
    <div style={{ minWidth: 220 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        <span>
          {used} / {limit > 0 ? limit : "—"}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--bg-mid, #f0f0f0)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "#dc2626" : "#111827",
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}

export default function TeamSettingsClient({
  userName,
  userEmail,
  role,
}: {
  userName: string;
  userEmail: string | null;
  role: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [pending, setPending] = useState<
    Array<Member & { inviteId: string; kind: "member" | "guest" }>
  >([]);
  const [billing, setBilling] = useState<Billing>({});
  const [toast, setToast] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("Viewer");
  const [inviting, setInviting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [showUpgradedBanner, setShowUpgradedBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setShowUpgradedBanner(true);
      params.delete("upgraded");
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : "");
      window.history.replaceState({}, "", next);
    }
  }, []);

  const isPersonalPlan = useMemo(() => {
    const plan = (billing.plan ?? "").toLowerCase();
    return plan === "personal" || plan === "free";
  }, [billing.plan]);

  const showUpgradeCta = useMemo(() => {
    const plan = (billing.plan ?? "").toLowerCase();
    return plan === "personal" && (billing.seat_limit ?? 0) === 0;
  }, [billing.plan, billing.seat_limit]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [team, me] = await Promise.all([
        apiFetch<MembersResponse>("/api/team/members"),
        apiFetch<MeResponse>("/api/auth/me"),
      ]);
      setMembers(team.members ?? []);
      setGuests(team.guests ?? []);
      setPending(
        (team.invites ?? []).map((i) => ({
          ...i,
          kind: (i.kind ?? "member") as "member" | "guest",
        })),
      );
      setBilling(me.billing ?? {});
    } catch (e) {
      setError((e as Error).message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      setInviteEmail("");
      setInviteRole("Viewer");
      showToast("Invite sent");
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the team?")) return;
    setBusyId(userId);
    try {
      await apiFetch(`/api/team/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      showToast("Removed");
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Remove failed");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelInvite(inviteId: string) {
    if (!confirm("Cancel this pending invite?")) return;
    setBusyId(inviteId);
    try {
      await apiFetch(`/api/team/invites/${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
      });
      showToast("Invite cancelled");
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  const seatLimit = billing.seat_limit ?? 0;
  const seatsUsed = billing.seats_used ?? members.length;
  const guestLimit = billing.guest_limit ?? 0;
  const guestsUsed = billing.guests_used ?? guests.length;

  const pendingMembers = pending.filter((p) => p.kind !== "guest");
  const pendingGuests = pending.filter((p) => p.kind === "guest");

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Team</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        {userName}
        {userEmail ? ` · ${userEmail}` : ""} · {role}
        {billing.plan ? ` · ${billing.plan} plan` : ""}
      </div>

      {showUpgradedBanner && (
        <div
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>You are now on the Team plan! Your team seats are ready.</span>
          <button
            onClick={() => setShowUpgradedBanner(false)}
            aria-label="Dismiss"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              lineHeight: 1,
              color: "#166534",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}{" "}
          <button
            onClick={() => void loadAll()}
            style={{
              marginLeft: 8,
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #991b1b",
              background: "transparent",
              color: "#991b1b",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="admin-panel active">
        {/* Team Members */}
        <div className="admin-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div>
              <div className="admin-group-title">Team Members</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.5,
                }}
              >
                People in your organization with access to CHG Rehab.
              </div>
            </div>
            <UsageBar used={seatsUsed} limit={seatLimit} label="Seats used" />
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              Loading…
            </div>
          ) : members.length === 0 && pendingMembers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              No team members yet.
            </div>
          ) : (
            <>
              {members.map((m) => (
                <div className="admin-row" key={`m-${m.id}`}>
                  <div className="admin-info">
                    <div className="admin-lbl">{m.name || m.email}</div>
                    <div className="admin-desc">
                      {m.email}
                      {m.name ? "" : ""} · {m.role}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => void removeMember(m.id)}
                      disabled={busyId === m.id}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "#991b1b",
                        cursor: busyId === m.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyId === m.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
              {pendingMembers.map((p) => (
                <div className="admin-row" key={`pm-${p.inviteId}`}>
                  <div className="admin-info">
                    <div className="admin-lbl">
                      {p.email}{" "}
                      <span
                        style={{
                          fontSize: 10,
                          marginLeft: 6,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--bg-mid, #f0f0f0)",
                          color: "var(--text-tertiary)",
                          textTransform: "uppercase",
                        }}
                      >
                        Pending
                      </span>
                    </div>
                    <div className="admin-desc">Invited as {p.role}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => void cancelInvite(p.inviteId)}
                      disabled={busyId === p.inviteId}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: busyId === p.inviteId ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyId === p.inviteId ? "Cancelling…" : "Cancel invite"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Invite form / upgrade prompt */}
          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid var(--border-mid, #e5e7eb)",
              borderRadius: 6,
              background: "var(--bg-soft, #fafafa)",
            }}
          >
            {showUpgradeCta || isPersonalPlan ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 13,
                }}
              >
                <span>Team members require a Team plan.</span>
                <button
                  type="button"
                  onClick={() => setUpgradeOpen(true)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 4,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Upgrade to Team
                </button>
              </div>
            ) : (
              <form
                onSubmit={sendInvite}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <input
                  className="admin-input"
                  type="email"
                  required
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{ flex: "1 1 240px", minWidth: 200 }}
                />
                <select
                  className="admin-input"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                  style={{ width: 120 }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 4,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    cursor: inviting ? "not-allowed" : "pointer",
                    opacity: inviting ? 0.7 : 1,
                  }}
                >
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Guests */}
        <div className="admin-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div>
              <div className="admin-group-title">Guests</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.5,
                }}
              >
                External collaborators (contractors, lenders, partners) with
                limited access.
              </div>
            </div>
            <UsageBar used={guestsUsed} limit={guestLimit} label="Guests used" />
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              Loading…
            </div>
          ) : guests.length === 0 && pendingGuests.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              No guests yet.
            </div>
          ) : (
            <>
              {guests.map((g) => (
                <div className="admin-row" key={`g-${g.id}`}>
                  <div className="admin-info">
                    <div className="admin-lbl">{g.name || g.email}</div>
                    <div className="admin-desc">
                      {g.email} · {g.role}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => void removeMember(g.id)}
                      disabled={busyId === g.id}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "#991b1b",
                        cursor: busyId === g.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyId === g.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
              {pendingGuests.map((p) => (
                <div className="admin-row" key={`pg-${p.inviteId}`}>
                  <div className="admin-info">
                    <div className="admin-lbl">
                      {p.email}{" "}
                      <span
                        style={{
                          fontSize: 10,
                          marginLeft: 6,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--bg-mid, #f0f0f0)",
                          color: "var(--text-tertiary)",
                          textTransform: "uppercase",
                        }}
                      >
                        Pending
                      </span>
                    </div>
                    <div className="admin-desc">Invited as {p.role}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => void cancelInvite(p.inviteId)}
                      disabled={busyId === p.inviteId}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: busyId === p.inviteId ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyId === p.inviteId ? "Cancelling…" : "Cancel invite"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <Toast message={toast} />

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlan={billing.plan}
        successUrl="https://chg.neuroaios.ai/settings/team?upgraded=true"
        cancelUrl="https://chg.neuroaios.ai/settings/team"
      />
    </div>
  );
}

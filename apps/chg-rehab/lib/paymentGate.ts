import { prisma } from "./prisma";
import { ChecklistStatus, DrawStatus, type Draw, type ChecklistItem, type Phase } from "@prisma/client";
import { getCompanySettings } from "./companySettings";

/**
 * Serializable draw projection. We strip Prisma's `Decimal` so the gate state
 * can be safely passed across the server/client boundary.
 */
export type GateDraw = {
  id: string;
  phaseId: string | null;
  number: number;
  title: string;
  amount: number;
  status: DrawStatus;
  approvedAt: string | null;
  paidAt: string | null;
  approvedById: string | null;
};

export type PhaseGateState = {
  phaseId: string;
  phaseNumber: number;
  totalItems: number;
  doneItems: number;
  /** True when every checklist item for this phase is verified (Done or NA). */
  isOpen: boolean;
  /** Pending or Approved draw associated with this phase, if any. */
  draw: GateDraw | null;
  /** Amount available to release (from draw, else 0). */
  releaseAmount: number;
  /** True if the draw for this phase has already been released (Approved or Paid). */
  isReleased: boolean;
};

function projectDraw(d: Draw | null | undefined): GateDraw | null {
  if (!d) return null;
  return {
    id: d.id,
    phaseId: d.phaseId,
    number: d.number,
    title: d.title,
    amount: Number(d.amount),
    status: d.status,
    approvedAt: d.approvedAt ? d.approvedAt.toISOString() : null,
    paidAt: d.paidAt ? d.paidAt.toISOString() : null,
    approvedById: d.approvedById ?? null,
  };
}

/**
 * The single source of truth for payment-gate state. Both the toggle endpoint
 * and the release endpoint must call this so the UI never decides whether the
 * gate is open — it only reflects what the server says.
 */
export async function getPhaseGate(phaseId: string): Promise<PhaseGateState> {
  const [phase, items, draw] = await Promise.all([
    prisma.phase.findUniqueOrThrow({ where: { id: phaseId } }),
    prisma.checklistItem.findMany({ where: { phaseId } }),
    prisma.draw.findFirst({ where: { phaseId }, orderBy: { number: "asc" } }),
  ]);

  return computeGate(phase, items, draw);
}

export function computeGate(
  phase: Pick<Phase, "id" | "number">,
  items: ChecklistItem[],
  draw: Draw | null
): PhaseGateState {
  const total = items.length;
  const done = items.filter(
    (i) => i.status === ChecklistStatus.Done || i.status === ChecklistStatus.NA
  ).length;
  const isReleased =
    !!draw && (draw.status === DrawStatus.Approved || draw.status === DrawStatus.Paid);
  const isOpen = total > 0 && done === total;
  const projected = projectDraw(draw);
  return {
    phaseId: phase.id,
    phaseNumber: phase.number,
    totalItems: total,
    doneItems: done,
    isOpen,
    draw: projected,
    releaseAmount: projected ? projected.amount : 0,
    isReleased,
  };
}

export type GateBlockReason = "no-draw" | "already-released" | "checklist-incomplete";

export function canReleaseDraw(
  gate: PhaseGateState,
  strictGate: boolean
): { ok: true } | { ok: false; reason: GateBlockReason; advisoryAllowed?: boolean } {
  if (!gate.draw) return { ok: false, reason: "no-draw" };
  if (gate.isReleased) return { ok: false, reason: "already-released" };
  if (!gate.isOpen) {
    return { ok: false, reason: "checklist-incomplete", advisoryAllowed: !strictGate };
  }
  return { ok: true };
}

/**
 * Centralised draw / payment-release gate driven by
 * CompanySetting.strictPaymentGate. Used by the Task #4 draw-approval API.
 *
 * Per the Admin Settings UI ("When ON: all checklist items must be verified
 * before a draw can be released"), strict mode requires every ChecklistItem
 * tied to a draw to be in `Done` or `NA` status before the draw can be
 * approved. When the draw is phase-scoped (`phaseId` set), only that phase's
 * checklist is evaluated; otherwise every phase on the project is evaluated.
 *
 * When strict mode is OFF this is a no-op (warning-only behaviour is
 * surfaced via the returned `pending` count for callers that want to log
 * or display it).
 */
export class PaymentGateError extends Error {
  status = 412;
  reasons: string[];
  pending: number;
  constructor(reasons: string[], pending: number) {
    super("Draw blocked by strict checklist gate: " + reasons.join("; "));
    this.reasons = reasons;
    this.pending = pending;
  }
}

export type PaymentGateOutcome = {
  enforced: boolean;
  pending: number;
  flagged: number;
};

export async function assertPaymentApprovable(
  companyId: string,
  draw: { projectId: string; phaseId: string | null }
): Promise<PaymentGateOutcome> {
  const settings = await getCompanySettings(companyId);

  const where = draw.phaseId
    ? { phaseId: draw.phaseId, phase: { project: { companyId } } }
    : { phase: { projectId: draw.projectId, project: { companyId } } };

  const items = await prisma.checklistItem.findMany({
    where,
    select: { status: true },
  });

  const pending = items.filter((i) => i.status === "Pending").length;
  const flagged = items.filter((i) => i.status === "Flagged").length;

  if (!settings.strictPaymentGate) {
    return { enforced: false, pending, flagged };
  }

  const reasons: string[] = [];
  if (pending > 0) reasons.push(`${pending} checklist item(s) still pending`);
  if (flagged > 0) reasons.push(`${flagged} checklist item(s) flagged`);
  if (reasons.length) throw new PaymentGateError(reasons, pending + flagged);

  return { enforced: true, pending: 0, flagged: 0 };
}

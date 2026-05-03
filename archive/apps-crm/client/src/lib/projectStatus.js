// Shared helpers for project status, on-time calculation, budget coloring,
// and phase status styling. Used by ProjectDashboard, ConstructionPage,
// UnitDashboard, and the upcoming overview dashboard.

export const PROJECT_STATUSES = [
  { value: 'planning',    label: 'Planning' },
  { value: 'active',      label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
]

export const PHASE_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked',     label: 'Blocked' },
  { value: 'complete',    label: 'Complete' },
]

export function projectStatusBadge(status) {
  const map = {
    planning:    'bg-gray-50 text-gray-700 ring-gray-600/20',
    active:      'bg-blue-50 text-blue-700 ring-blue-600/20',
    in_progress: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    on_hold:     'bg-amber-50 text-amber-700 ring-amber-600/20',
    completed:   'bg-green-50 text-green-700 ring-green-600/20',
    cancelled:   'bg-red-50 text-red-700 ring-red-600/20',
  }
  return map[status] || map.planning
}

export function phaseStatusBadge(status) {
  const map = {
    not_started: 'bg-gray-50 text-gray-700 ring-gray-600/20',
    in_progress: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    blocked:     'bg-red-50 text-red-700 ring-red-600/20',
    complete:    'bg-green-50 text-green-700 ring-green-600/20',
  }
  return map[status] || map.not_started
}

export function phaseRowAccent(status) {
  const map = {
    not_started: 'border-l-gray-300',
    in_progress: 'border-l-blue-500',
    blocked:     'border-l-red-500',
    complete:    'border-l-green-500',
  }
  return map[status] || map.not_started
}

// Returns {state: 'on_time'|'delayed'|'no_dates'|'completed', elapsedPct, completionPct, badgeClass, label}
export function computeOnTime(project) {
  const completionPct = Number(project?.overall_pct ?? 0)
  if (project?.status === 'completed') {
    return { state: 'completed', elapsedPct: 100, completionPct, badgeClass: 'bg-green-50 text-green-700 ring-green-600/20', label: 'Completed' }
  }
  if (!project?.start_date || !project?.target_completion) {
    return { state: 'no_dates', elapsedPct: 0, completionPct, badgeClass: 'bg-gray-50 text-gray-600 ring-gray-500/10', label: 'No timeline' }
  }
  const start = new Date(project.start_date).getTime()
  const end   = new Date(project.target_completion).getTime()
  const now   = Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { state: 'no_dates', elapsedPct: 0, completionPct, badgeClass: 'bg-gray-50 text-gray-600 ring-gray-500/10', label: 'No timeline' }
  }
  const elapsedPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
  // 5% tolerance window: completion within (elapsed - 5%) is still considered on-time.
  const delayed = completionPct < elapsedPct - 5
  return delayed
    ? { state: 'delayed', elapsedPct, completionPct, badgeClass: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Delayed' }
    : { state: 'on_time', elapsedPct, completionPct, badgeClass: 'bg-green-50 text-green-700 ring-green-600/20', label: 'On Time' }
}

// Budget health for a single bucket. Returns class + label for ratio.
export function budgetHealth(spent, budget) {
  const s = Number(spent || 0)
  const b = Number(budget || 0)
  if (b <= 0) {
    return { class: 'text-gray-500', label: s > 0 ? 'No budget' : '—', ratio: 0, over: false }
  }
  const ratio = s / b
  if (ratio > 1)    return { class: 'text-red-600',    label: 'Over budget',  ratio, over: true }
  if (ratio >= 0.9) return { class: 'text-amber-600',  label: 'Approaching limit', ratio, over: false }
  return { class: 'text-green-600', label: 'Healthy', ratio, over: false }
}

export const fmtUsd  = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

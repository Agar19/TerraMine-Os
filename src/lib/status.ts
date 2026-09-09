export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'

/**
 * Maps the status vocabularies used across the schema onto the six
 * semantic tones the UI knows about. One place to change how "overdue"
 * or "operational" reads anywhere in the platform.
 */
const TONE_MAP: Record<string, Tone> = {
  // healthy / complete
  active: 'ok', operating: 'ok', operational: 'ok', completed: 'ok', complete: 'ok',
  closed: 'ok', verified: 'ok', approved: 'ok', paid: 'ok', settled: 'ok', signed_off: 'ok',
  pass: 'ok', passed: 'ok', valid: 'ok', compliant: 'ok', conformant: 'ok', fit: 'ok',
  on_target: 'ok', green: 'ok', normal: 'ok', resolved: 'ok', delivered: 'ok', received: 'ok',
  present: 'ok', granted: 'ok', ok: 'ok', accepted: 'ok', effective: 'ok', satisfactory: 'ok',
  cleared: 'ok', fired: 'ok', assayed: 'ok', validated: 'ok', taken: 'ok', in_vault: 'ok',

  // in progress / informational
  in_progress: 'info', planned: 'info', scheduled: 'info', open: 'info', draft: 'neutral',
  submitted: 'info', issued: 'info', confirmed: 'info', in_transit: 'info', drilling: 'info',
  development: 'info', commissioning: 'info', construction: 'info', reported: 'info',
  under_investigation: 'info', investigating: 'info', review: 'info', in_review: 'info',
  reporting: 'info', allocated: 'info', acknowledged: 'info', matched: 'info', charged: 'info',
  logged: 'info', collected: 'info', dispatched: 'info', at_lab: 'info', monitoring: 'info',
  prequalified: 'info', prospect: 'info', requested: 'info', pending: 'info', calculating: 'info',

  // needs attention
  warning: 'warn', watch: 'warn', standby: 'warn', maintenance: 'warn', on_hold: 'warn',
  awaiting_parts: 'warn', partially_received: 'warn', partially_paid: 'warn', expiring: 'warn',
  expiring_30d: 'warn', due_soon: 'warn', amber: 'warn', alert: 'warn', minor_non_conformance: 'warn',
  needs_improvement: 'warn', on_leave: 'warn', reorder: 'warn', overstocked: 'warn',
  care_maintenance: 'warn', suspended: 'warn', renewal_pending: 'warn', quarantined: 'warn',
  actions_pending: 'warn', due_this_week: 'warn', pass_with_defects: 'warn', retest: 'warn',
  fit_with_restrictions: 'warn', partially_accepted: 'warn', provisional: 'warn', claimed: 'warn',
  no_show: 'warn', incomplete: 'warn', partially_effective: 'warn', escalated: 'warn',
  temporarily_unfit: 'warn', expiring_90d: 'warn',

  // failure / breach
  breakdown: 'danger', overdue: 'danger', expired: 'danger', failed: 'danger', fail: 'danger',
  rejected: 'danger', disputed: 'danger', critical: 'danger', red: 'danger', alarm: 'danger',
  trip: 'danger', evacuate: 'danger', stockout: 'danger', major_non_conformance: 'danger',
  off_target: 'danger', unfit: 'danger', unsatisfactory: 'danger', absent: 'danger',
  blacklisted: 'danger', terminated: 'danger', forfeited: 'danger', medical_hold: 'danger',
  not_effective: 'danger', reopened: 'danger', written_off: 'danger', void: 'danger',
  aborted: 'danger', abandoned: 'danger', accepted_risk: 'danger', not_performed: 'danger',
  extreme: 'danger', high: 'warn', moderate: 'warn', low: 'neutral',

  // terminal but not a failure
  cancelled: 'neutral', decommissioned: 'neutral', disposed: 'neutral', superseded: 'neutral',
  archived: 'neutral', depleted: 'neutral', no_data: 'neutral', not_assessed: 'neutral',
  no_expiry: 'neutral', no_due_date: 'neutral', not_required: 'neutral', not_tested: 'neutral',
  on_track: 'ok', locked: 'neutral', off_roster: 'neutral', surrendered: 'neutral',
}

export function toneFor(status: unknown): Tone {
  if (status == null) return 'neutral'
  return TONE_MAP[String(status).toLowerCase()] ?? 'neutral'
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted ring-line',
  ok: 'bg-ok-soft text-ok ring-ok/25',
  warn: 'bg-warn-soft text-warn ring-warn/25',
  danger: 'bg-danger-soft text-danger ring-danger/25',
  info: 'bg-info-soft text-info ring-info/25',
  accent: 'bg-accent-soft text-accent ring-accent/25',
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
  accent: 'text-accent',
}

export const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-subtle',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
}

/** Risk score (1-25) to a tone, matching the 5x5 matrix in the schema. */
export function riskTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral'
  if (score >= 15) return 'danger'
  if (score >= 9) return 'warn'
  if (score >= 4) return 'info'
  return 'ok'
}

/** Direction-aware tone for a variance against target. */
export function varianceTone(variancePct: number | null, direction: 'higher_better' | 'lower_better' | 'target_band'): Tone {
  if (variancePct == null) return 'neutral'
  if (direction === 'target_band') return Math.abs(variancePct) <= 5 ? 'ok' : Math.abs(variancePct) <= 12 ? 'warn' : 'danger'
  const good = direction === 'higher_better' ? variancePct >= -2 : variancePct <= 2
  if (good) return 'ok'
  return Math.abs(variancePct) < 12 ? 'warn' : 'danger'
}

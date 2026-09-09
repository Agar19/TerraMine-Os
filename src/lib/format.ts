/**
 * Formatting helpers. Mining reporting has its own conventions —
 * tonnes to three significant places, grades to two decimals, rates per
 * million hours — so every screen goes through here rather than calling
 * toLocaleString ad hoc.
 */

export function num(value: unknown, dp = 0): string {
  const n = toNumber(value)
  if (n == null) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** 1 240 000 -> "1.24 Mt". Used wherever space is tight. */
export function tonnes(value: unknown, dp = 1): string {
  const n = toNumber(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(dp)} Mt`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(dp)} kt`
  return `${n.toFixed(0)} t`
}

export function compact(value: unknown, dp = 1): string {
  const n = toNumber(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(dp)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(dp)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(dp)}k`
  return n.toFixed(abs < 10 && !Number.isInteger(n) ? dp : 0)
}

export function money(value: unknown, currency = 'USD', dp = 0): string {
  const n = toNumber(value)
  if (n == null) return '—'
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

export function moneyCompact(value: unknown, currency = 'USD'): string {
  const n = toNumber(value)
  if (n == null) return '—'
  const symbol = currency === 'USD' ? '$' : `${currency} `
  const sign = n < 0 ? '-' : ''
  return `${sign}${symbol}${compact(Math.abs(n))}`
}

export function percent(value: unknown, dp = 1): string {
  const n = toNumber(value)
  if (n == null) return '—'
  return `${n.toFixed(dp)}%`
}

export function grade(value: unknown, unit = 'g/t', dp = 2): string {
  const n = toNumber(value)
  if (n == null) return '—'
  return `${n.toFixed(dp)} ${unit}`
}

export function date(value: unknown): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

export function dateTime(value: unknown): string {
  const d = toDate(value)
  if (!d) return '—'
  return `${d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })} ${d.toLocaleTimeString(
    undefined,
    { hour: '2-digit', minute: '2-digit' },
  )}`
}

export function time(value: unknown): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

export function isoDay(value: unknown): string {
  const d = toDate(value)
  return d ? d.toISOString().slice(0, 10) : ''
}

/** "3 days ago", "in 2 weeks" — for due dates and last-seen columns. */
export function relative(value: unknown): string {
  const d = toDate(value)
  if (!d) return '—'
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ]
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diffMs / ms), unit)
  }
  return 'just now'
}

export function daysBetween(a: unknown, b: unknown = new Date()): number | null {
  const d1 = toDate(a)
  const d2 = toDate(b)
  if (!d1 || !d2) return null
  return Math.round((d1.getTime() - d2.getTime()) / 86400000)
}

export function duration(hours: unknown): string {
  const n = toNumber(hours)
  if (n == null) return '—'
  if (n < 1) return `${Math.round(n * 60)} min`
  if (n < 24) return `${n.toFixed(1)} h`
  return `${Math.floor(n / 24)}d ${Math.round(n % 24)}h`
}

/** snake_case and lower_case enum values -> "Snake case". */
export function label(value: unknown): string {
  if (value == null || value === '') return '—'
  const s = String(value).replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Acronyms that must stay uppercase when a label is generated. */
const ACRONYMS = new Set([
  'id', 'no', 'rl', 'ch4', 'co', 'co2', 'o2', 'h2s', 'nox', 'so2', 'cv', 'rqd', 'ppv', 'db',
  'tph', 'kwh', 'ph', 'crm', 'qaqc', 'ppe', 'hse', 'lti', 'mti', 'rwi', 'fai', 'kpi', 'po',
  'pr', 'grn', 'wo', 'tsf', 'uom', 'bcm', 'p80', 'hgi', 'lom', 'pm',
])

/** Column name -> human header: "cv_kcal_kg" -> "CV kcal/kg". */
export function columnLabel(column: string): string {
  return column
    .replace(/_pct$/, '_%')
    .replace(/_kcal_kg$/, '_kcal/kg')
    .replace(/_m3$/, '_m³')
    .replace(/_m2$/, '_m²')
    .replace(/_km$/, '_km')
    .replace(/_id$/, '')
    .split('_')
    .filter(Boolean)
    .map((part, i) => {
      if (ACRONYMS.has(part.toLowerCase())) return part.toUpperCase()
      if (part === '%' || part.includes('/') || part.includes('³') || part.includes('²')) return part
      return i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    })
    .join(' ')
}

export function initials(name: unknown): string {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Deterministic hue from a string, for chips and avatars. */
export function hashHue(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 360
  return h
}

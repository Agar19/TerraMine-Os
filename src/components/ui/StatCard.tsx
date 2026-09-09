import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TONE_TEXT, type Tone } from '@/lib/status'
import { Sparkline } from '@/components/charts'
import { Skeleton } from './primitives'

export interface StatCardProps {
  label: string
  value: ReactNode
  unit?: string
  /** Percentage change against the comparison period. */
  delta?: number | null
  deltaLabel?: string
  /** Whether a rise is good. Drives the colour of the delta chip. */
  deltaDirection?: 'higher_better' | 'lower_better'
  hint?: ReactNode
  tone?: Tone
  spark?: number[]
  icon?: ReactNode
  to?: string
  loading?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  deltaDirection = 'higher_better',
  hint,
  tone = 'neutral',
  spark,
  icon,
  to,
  loading,
  className,
}: StatCardProps) {
  const good =
    delta == null || delta === 0
      ? null
      : deltaDirection === 'higher_better'
        ? delta > 0
        : delta < 0
  const deltaTone: Tone = good == null ? 'neutral' : good ? 'ok' : 'danger'

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-subtle">{label}</p>
        {icon && <span className={cn('shrink-0', TONE_TEXT[tone])}>{icon}</span>}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1.5 flex items-baseline gap-1">
          <span className={cn('text-2xl font-semibold tracking-tight tnum', TONE_TEXT[tone])}>{value}</span>
          {unit && <span className="text-xs text-subtle">{unit}</span>}
        </p>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {delta != null && (
            <span className={cn('inline-flex items-center gap-0.5 text-2xs font-medium', TONE_TEXT[deltaTone])}>
              {delta > 0 ? (
                <ArrowUpRight className="size-3" />
              ) : delta < 0 ? (
                <ArrowDownRight className="size-3" />
              ) : null}
              {Math.abs(delta).toFixed(1)}%
              {deltaLabel && <span className="ml-1 font-normal text-subtle">{deltaLabel}</span>}
            </span>
          )}
          {hint && <p className="truncate text-2xs text-subtle">{hint}</p>}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline values={spark} color={tone === 'neutral' ? 'var(--series-1)' : `var(--${tone})`} />
        )}
      </div>
    </>
  )

  const classes = cn(
    'rounded-card bg-elevated p-3.5 ring-1 ring-line shadow-[var(--shadow-card)] transition',
    to && 'hover:ring-line-strong hover:shadow-md',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={cn(classes, 'group block')}>
        {body}
        <span className="mt-2 inline-flex items-center gap-1 text-2xs text-subtle opacity-0 transition group-hover:opacity-100">
          View <ArrowRight className="size-3" />
        </span>
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5', className)}>{children}</div>
  )
}

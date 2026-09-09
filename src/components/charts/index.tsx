import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { compact, toNumber } from '@/lib/format'

/**
 * A small SVG chart kit.
 *
 * Deliberately hand-rolled rather than pulled from a library: every chart
 * on the platform then shares one set of marks, one hover behaviour and
 * one categorical palette, and it themes from the same CSS variables as
 * the rest of the UI. Slots are assigned in fixed order and never cycled,
 * so a series keeps its colour when a filter changes the series count.
 */
export const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const

export const SEQUENTIAL = ['var(--seq-100)', 'var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'] as const

export interface SeriesDef {
  key: string
  label: string
  color?: string
  /** Area/line charts only: draw as a dashed reference line (e.g. plan). */
  dashed?: boolean
}

type Row = Record<string, unknown>

interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

const DEFAULT_MARGIN: Margin = { top: 12, right: 12, bottom: 24, left: 44 }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(Math.round(w))
    })
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round a raw max up to a friendly axis bound and return tick values. */
function niceScale(max: number, min = 0, tickCount = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max === min) return { min: 0, max: 1, ticks: [0, 1] }
  const range = max - min || Math.abs(max) || 1
  const rawStep = range / tickCount
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalised = rawStep / magnitude
  const step = (normalised >= 7.5 ? 10 : normalised >= 3.5 ? 5 : normalised >= 1.5 ? 2 : 1) * magnitude
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { min: niceMin, max: niceMax, ticks }
}

export function Legend({
  series,
  className,
}: {
  series: { label: string; color: string }[]
  className?: string
}) {
  if (series.length < 2) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5 text-2xs text-muted">
          <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

interface TooltipState {
  x: number
  y: number
  index: number
}

function TooltipBox({
  x,
  y,
  width,
  children,
}: {
  x: number
  y: number
  width: number
  children: ReactNode
}) {
  // Flip to the left of the cursor when close to the right-hand edge.
  const flip = x > width - 150
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-32 rounded-md bg-slate-900/95 px-2.5 py-1.5 text-2xs text-white shadow-xl dark:bg-slate-800/95"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: y }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------ Trend chart */

export function TrendChart({
  data,
  xKey,
  series,
  height = 220,
  type = 'line',
  stacked = false,
  yFormat = (v: number) => compact(v),
  xFormat = (v: unknown) => String(v ?? ''),
  className,
  yLabel,
  referenceValue,
  referenceLabel,
}: {
  data: Row[]
  xKey: string
  series: SeriesDef[]
  height?: number
  type?: 'line' | 'area'
  stacked?: boolean
  yFormat?: (value: number) => string
  xFormat?: (value: unknown) => string
  className?: string
  yLabel?: string
  referenceValue?: number
  referenceLabel?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<TooltipState | null>(null)
  const margin = DEFAULT_MARGIN

  const colors = series.map((s, i) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length])

  const { points, scale, innerW, innerH } = useMemo(() => {
    const iw = Math.max(0, width - margin.left - margin.right)
    const ih = Math.max(0, height - margin.top - margin.bottom)
    let maxValue = referenceValue ?? 0
    let minValue = 0
    const stackTotals: number[] = []
    data.forEach((row, i) => {
      let total = 0
      for (const s of series) {
        const v = toNumber(row[s.key]) ?? 0
        total += v
        if (!stacked) {
          maxValue = Math.max(maxValue, v)
          minValue = Math.min(minValue, v)
        }
      }
      stackTotals[i] = total
      if (stacked) maxValue = Math.max(maxValue, total)
    })
    const s = niceScale(maxValue, minValue)
    return { points: stackTotals, scale: s, innerW: iw, innerH: ih }
  }, [data, series, stacked, height, width, margin.left, margin.right, margin.top, margin.bottom, referenceValue])

  void points
  const xAt = useCallback(
    (i: number) => (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    [data.length, innerW],
  )
  const yAt = useCallback(
    (v: number) => innerH - ((v - scale.min) / (scale.max - scale.min || 1)) * innerH,
    [innerH, scale.min, scale.max],
  )

  const paths = useMemo(() => {
    const running = Array.from({ length: data.length }, () => 0)
    return series.map((s) => {
      const coords = data.map((row, i) => {
        const v = toNumber(row[s.key]) ?? 0
        const base = stacked ? running[i] : 0
        if (stacked) running[i] += v
        return { x: xAt(i), y: yAt(base + v), y0: yAt(base) }
      })
      const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
      const area =
        coords.length > 0
          ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${coords[coords.length - 1].y0.toFixed(1)} ` +
            `${[...coords].reverse().slice(1).map((c) => `L${c.x.toFixed(1)},${c.y0.toFixed(1)}`).join(' ')} Z`
          : ''
      return { line, area, coords }
    })
  }, [data, series, stacked, xAt, yAt])

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (data.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const idx = data.length === 1 ? 0 : Math.round((px / innerW) * (data.length - 1))
    setHover({ index: Math.max(0, Math.min(data.length - 1, idx)), x: e.clientX - rect.left + margin.left, y: e.clientY - rect.top })
  }

  const showLegend = series.length >= 2

  return (
    <div className={cn('relative w-full', className)} ref={ref}>
      {showLegend && (
        <Legend className="mb-2" series={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />
      )}
      <svg width={width} height={height} role="img" aria-label={yLabel ?? 'Trend chart'}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yAt(t)} y2={yAt(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={-8} y={yAt(t)} dy="0.32em" textAnchor="end" className="fill-[var(--fg-subtle)] text-[10px] tnum">
                {yFormat(t)}
              </text>
            </g>
          ))}

          {referenceValue != null && (
            <g>
              <line
                x1={0}
                x2={innerW}
                y1={yAt(referenceValue)}
                y2={yAt(referenceValue)}
                stroke="var(--fg-subtle)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              {referenceLabel && (
                <text x={innerW} y={yAt(referenceValue) - 4} textAnchor="end" className="fill-[var(--fg-subtle)] text-[10px]">
                  {referenceLabel}
                </text>
              )}
            </g>
          )}

          {type === 'area' &&
            paths.map((p, i) => (
              <path key={`a${series[i].key}`} d={p.area} fill={colors[i]} opacity={stacked ? 0.85 : 0.14} />
            ))}
          {paths.map((p, i) => (
            <path
              key={`l${series[i].key}`}
              d={p.line}
              fill="none"
              stroke={colors[i]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={series[i].dashed ? '5 4' : undefined}
            />
          ))}

          {hover && (
            <g>
              <line
                x1={xAt(hover.index)}
                x2={xAt(hover.index)}
                y1={0}
                y2={innerH}
                stroke="var(--fg-subtle)"
                strokeWidth={1}
              />
              {paths.map((p, i) => {
                const c = p.coords[hover.index]
                if (!c) return null
                return (
                  <circle
                    key={`h${series[i].key}`}
                    cx={c.x}
                    cy={c.y}
                    r={4}
                    fill={colors[i]}
                    stroke="var(--bg-elevated)"
                    strokeWidth={2}
                  />
                )
              })}
            </g>
          )}

          {data.map((row, i) => {
            const step = Math.max(1, Math.ceil(data.length / (innerW > 520 ? 8 : 4)))
            if (i % step !== 0 && i !== data.length - 1) return null
            return (
              <text
                key={`x${i}`}
                x={xAt(i)}
                y={innerH + 15}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                className="fill-[var(--fg-subtle)] text-[10px]"
              >
                {xFormat(row[xKey])}
              </text>
            )
          })}

          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </g>
      </svg>

      {hover && data[hover.index] && (
        <TooltipBox x={hover.x} y={hover.y} width={width}>
          <p className="mb-1 font-medium opacity-80">{xFormat(data[hover.index][xKey])}</p>
          {series.map((s, i) => (
            <p key={s.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: colors[i] }} />
                {s.label}
              </span>
              <span className="tnum font-medium">{yFormat(toNumber(data[hover.index][s.key]) ?? 0)}</span>
            </p>
          ))}
        </TooltipBox>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Bar chart */

export function BarChart({
  data,
  xKey,
  series,
  height = 220,
  stacked = false,
  yFormat = (v: number) => compact(v),
  xFormat = (v: unknown) => String(v ?? ''),
  className,
}: {
  data: Row[]
  xKey: string
  series: SeriesDef[]
  height?: number
  stacked?: boolean
  yFormat?: (value: number) => string
  xFormat?: (value: unknown) => string
  className?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<TooltipState | null>(null)
  const margin = DEFAULT_MARGIN
  const colors = series.map((s, i) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length])
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const scale = useMemo(() => {
    let max = 0
    for (const row of data) {
      if (stacked) {
        max = Math.max(max, series.reduce((sum, s) => sum + (toNumber(row[s.key]) ?? 0), 0))
      } else {
        for (const s of series) max = Math.max(max, toNumber(row[s.key]) ?? 0)
      }
    }
    return niceScale(max)
  }, [data, series, stacked])

  const yAt = (v: number) => innerH - (v / (scale.max || 1)) * innerH
  const bandWidth = data.length > 0 ? innerW / data.length : 0
  const groupGap = Math.min(10, bandWidth * 0.25)
  const barWidth = stacked
    ? Math.max(2, bandWidth - groupGap)
    : Math.max(2, (bandWidth - groupGap) / series.length - 2)

  return (
    <div className={cn('relative w-full', className)} ref={ref}>
      {series.length >= 2 && (
        <Legend className="mb-2" series={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />
      )}
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yAt(t)} y2={yAt(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={-8} y={yAt(t)} dy="0.32em" textAnchor="end" className="fill-[var(--fg-subtle)] text-[10px] tnum">
                {yFormat(t)}
              </text>
            </g>
          ))}

          {data.map((row, i) => {
            const bandX = i * bandWidth
            let stackTop = 0
            return (
              <g
                key={i}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover({ index: i, x: bandX + bandWidth / 2 + margin.left, y: e.clientY - rect.top })
                }}
                onMouseLeave={() => setHover(null)}
              >
                <rect x={bandX} y={0} width={bandWidth} height={innerH} fill={hover?.index === i ? 'var(--bg-sunken)' : 'transparent'} />
                {series.map((s, si) => {
                  const v = toNumber(row[s.key]) ?? 0
                  const h = Math.max(0, innerH - yAt(v))
                  if (stacked) {
                    const y = innerH - stackTop - h
                    stackTop += h
                    return (
                      <rect
                        key={s.key}
                        x={bandX + groupGap / 2}
                        y={y}
                        width={barWidth}
                        height={Math.max(0, h - (si > 0 ? 2 : 0))}
                        fill={colors[si]}
                        rx={si === series.length - 1 ? 3 : 0}
                      />
                    )
                  }
                  return (
                    <rect
                      key={s.key}
                      x={bandX + groupGap / 2 + si * (barWidth + 2)}
                      y={innerH - h}
                      width={barWidth}
                      height={h}
                      fill={colors[si]}
                      rx={3}
                    />
                  )
                })}
              </g>
            )
          })}

          {data.map((row, i) => {
            const step = Math.max(1, Math.ceil(data.length / (innerW > 520 ? 10 : 5)))
            if (i % step !== 0) return null
            return (
              <text
                key={`x${i}`}
                x={i * bandWidth + bandWidth / 2}
                y={innerH + 15}
                textAnchor="middle"
                className="fill-[var(--fg-subtle)] text-[10px]"
              >
                {xFormat(row[xKey])}
              </text>
            )
          })}
        </g>
      </svg>
      {hover && data[hover.index] && (
        <TooltipBox x={hover.x} y={hover.y} width={width}>
          <p className="mb-1 font-medium opacity-80">{xFormat(data[hover.index][xKey])}</p>
          {series.map((s, i) => (
            <p key={s.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: colors[i] }} />
                {s.label}
              </span>
              <span className="tnum font-medium">{yFormat(toNumber(data[hover.index][s.key]) ?? 0)}</span>
            </p>
          ))}
        </TooltipBox>
      )}
    </div>
  )
}

/* ------------------------------------------------- Horizontal bar / pareto */

export function RankedBars({
  data,
  format = (v: number) => compact(v),
  className,
  color = SERIES_COLORS[0],
  max: maxOverride,
  emptyLabel = 'No data',
}: {
  data: { label: string; value: number; color?: string; hint?: string }[]
  format?: (value: number) => string
  className?: string
  color?: string
  max?: number
  emptyLabel?: string
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-xs text-subtle">{emptyLabel}</p>
  }
  const max = maxOverride ?? Math.max(...data.map((d) => Math.abs(d.value)), 1)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {data.map((d) => (
        <div key={d.label} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-xs text-muted" title={d.label}>
            {d.label}
          </span>
          <div className="h-4 overflow-hidden rounded bg-sunken">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${Math.max(1.5, (Math.abs(d.value) / max) * 100)}%`, background: d.color ?? color }}
              title={d.hint}
            />
          </div>
          <span className="tnum text-xs font-medium text-ink w-16 text-right">{format(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Donut */

export function Donut({
  data,
  size = 148,
  thickness = 18,
  centerValue,
  centerLabel,
  format = (v: number) => compact(v),
  className,
}: {
  data: { label: string; value: number; color?: string }[]
  size?: number
  thickness?: number
  centerValue?: string
  centerLabel?: string
  format?: (value: number) => string
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {total === 0 ? (
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
          ) : (
            data.map((d, i) => {
              const value = Math.max(0, d.value)
              const length = (value / total) * circumference
              const dash = `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={d.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={hover === i ? thickness + 3 : thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  className="transition-[stroke-width]"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              )
              offset += length
              return el
            })
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-ink tnum">
            {hover != null ? format(data[hover].value) : (centerValue ?? format(total))}
          </span>
          <span className="max-w-[80%] truncate text-2xs text-subtle">
            {hover != null ? data[hover].label : centerLabel}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center justify-between gap-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: d.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tnum text-2xs font-medium text-ink">
              {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Sparkline */

export function Sparkline({
  values,
  width = 96,
  height = 26,
  color = 'var(--series-1)',
  className,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}) {
  if (values.length < 2) return <div style={{ width, height }} className={className} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1
    const y = height - 2 - ((v - min) / range) * (height - 4)
    return [x, y] as const
  })
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${d} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <path d={area} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2} fill={color} />
    </svg>
  )
}

/* ------------------------------------------------------------- Heat strip */

export function HeatStrip({
  data,
  format = (v: number) => compact(v),
  className,
}: {
  data: { label: string; value: number }[]
  format?: (value: number) => string
  className?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className={cn('flex gap-0.5', className)}>
      {data.map((d) => {
        const ratio = d.value / max
        const step = ratio > 0.8 ? 4 : ratio > 0.6 ? 3 : ratio > 0.35 ? 2 : ratio > 0.12 ? 1 : 0
        return (
          <div
            key={d.label}
            title={`${d.label}: ${format(d.value)}`}
            className="h-6 flex-1 rounded-[2px]"
            style={{ background: SEQUENTIAL[step] }}
          />
        )
      })}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useSql } from '@/db/hooks'
import { date, num, percent } from '@/lib/format'
import { varianceTone } from '@/lib/status'
import { Badge, Card, CardHeader, Segmented, Select, EmptyState } from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'
import { HeatStrip, TrendChart } from '@/components/charts'

interface KpiRow {
  kpi_id: number
  code: string
  name: string
  module: string
  unit: string | null
  direction: 'higher_better' | 'lower_better' | 'target_band'
  site_id: number | null
  site_name: string | null
  period_start: string
  target_value: number | null
  actual_value: number | null
  variance_pct: number | null
  status: string | null
  commentary: string | null
}

const MODULES = [
  { value: 'all', label: 'All' },
  { value: 'production', label: 'Production' },
  { value: 'processing', label: 'Processing' },
  { value: 'safety', label: 'Safety' },
  { value: 'environment', label: 'Environment' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'workforce', label: 'Workforce' },
  { value: 'supply', label: 'Supply' },
  { value: 'finance', label: 'Finance' },
] as const

export default function Scorecard() {
  const [module, setModule] = useState<(typeof MODULES)[number]['value']>('all')
  const [siteId, setSiteId] = useState('')

  const sites = useSql<{ id: number; name: string }>('select id, name from sites order by name')

  const latest = useSql<KpiRow>(
    `select v.kpi_id, k.code, k.name, k.module, k.unit, k.direction,
            v.site_id, s.name as site_name, v.period_start::text,
            v.target_value::float8, v.actual_value::float8, v.variance_pct::float8, v.status, v.commentary
     from kpi_values v
     join kpi_definitions k on k.id = v.kpi_id
     left join sites s on s.id = v.site_id
     where v.period_start = (select max(period_start) from kpi_values)
       and ($1 = 'all' or k.module = $1)
       and ($2 = '' or v.site_id = $2::bigint)
     order by k.module, k.code`,
    [module, siteId],
  )

  const history = useSql<{ period_start: string; code: string; actual: number | null }>(
    `select v.period_start::text, k.code, v.actual_value::float8 as actual
     from kpi_values v join kpi_definitions k on k.id = v.kpi_id
     where ($1 = 'all' or k.module = $1) and ($2 = '' or v.site_id = $2::bigint)
     order by v.period_start`,
    [module, siteId],
  )

  const summary = useMemo(() => {
    const counts = { on_target: 0, watch: 0, off_target: 0 }
    for (const row of latest.rows) {
      if (row.status === 'on_target') counts.on_target++
      else if (row.status === 'watch') counts.watch++
      else if (row.status === 'off_target') counts.off_target++
    }
    return counts
  }, [latest.rows])

  const grouped = useMemo(() => {
    const map = new Map<string, KpiRow[]>()
    for (const row of latest.rows) {
      const list = map.get(row.module) ?? []
      list.push(row)
      map.set(row.module, list)
    }
    return [...map.entries()]
  }, [latest.rows])

  const trendSeries = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number>>()
    const codes = new Set<string>()
    for (const row of history.rows) {
      if (row.actual == null) continue
      codes.add(row.code)
      const bucket = byPeriod.get(row.period_start) ?? {}
      bucket[row.code] = (bucket[row.code] ?? 0) + row.actual
      byPeriod.set(row.period_start, bucket)
    }
    const topCodes = [...codes].slice(0, 4)
    const data = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, values]) => ({ period, ...values }))
    return { data, codes: topCodes }
  }, [history.rows])

  const total = latest.rows.length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Site scorecard"
        description="Every KPI in one place, measured against its target for the most recent reporting period."
        meta={latest.rows[0] ? `Period beginning ${date(latest.rows[0].period_start)}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Select
              className="h-8 w-auto min-w-40 py-1 text-xs"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="">All sites</option>
              {sites.rows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Segmented value={module} onChange={setModule} options={MODULES} />
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="On target" value={summary.on_target} total={total} tone="ok" />
        <SummaryTile label="Watch" value={summary.watch} total={total} tone="warn" />
        <SummaryTile label="Off target" value={summary.off_target} total={total} tone="danger" />
      </div>

      {trendSeries.data.length > 1 && trendSeries.codes.length > 0 && (
        <Card>
          <CardHeader title="KPI trend" subtitle="Reported actuals by period for the leading measures" />
          <TrendChart
            data={trendSeries.data}
            xKey="period"
            height={200}
            series={trendSeries.codes.map((code) => ({ key: code, label: code }))}
            xFormat={(v) => String(v).slice(0, 7)}
            yFormat={(v) => num(v, 0)}
          />
        </Card>
      )}

      {grouped.length === 0 && !latest.loading && (
        <Card>
          <EmptyState title="No KPI results" description="Nothing has been reported for this filter yet." />
        </Card>
      )}

      {grouped.map(([mod, rows]) => (
        <Card key={mod} padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title={mod.charAt(0).toUpperCase() + mod.slice(1)}
              subtitle={`${rows.length} measures`}
              action={
                <HeatStrip
                  className="w-40"
                  data={rows.map((r) => ({ label: r.code, value: Math.abs(r.variance_pct ?? 0) }))}
                />
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Code</th>
                  <th className="px-4 py-2 text-left font-medium">Measure</th>
                  <th className="px-4 py-2 text-left font-medium">Site</th>
                  <th className="px-4 py-2 text-right font-medium">Target</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Variance</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Commentary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.code}-${r.site_id}-${i}`} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{r.code}</td>
                    <td className="px-4 py-2">
                      {r.name}
                      {r.unit && <span className="ml-1.5 text-2xs text-subtle">{r.unit}</span>}
                    </td>
                    <td className="px-4 py-2 text-muted">{r.site_name ?? 'Group'}</td>
                    <td className="px-4 py-2 text-right tnum text-muted">{num(r.target_value, 2)}</td>
                    <td className="px-4 py-2 text-right tnum font-medium">{num(r.actual_value, 2)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge tone={varianceTone(r.variance_pct, r.direction)}>
                        {r.variance_pct != null && r.variance_pct > 0 ? '+' : ''}
                        {percent(r.variance_pct, 1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge status={r.status ?? 'no_data'} />
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-muted">{r.commentary ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: 'ok' | 'warn' | 'danger'
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--danger)'
  return (
    <div className="rounded-card bg-elevated p-3.5 ring-1 ring-line shadow-[var(--shadow-card)]">
      <p className="text-2xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tnum" style={{ color }}>
        {value}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="mt-1 text-2xs text-subtle">{percent(pct, 0)} of measures</p>
    </div>
  )
}

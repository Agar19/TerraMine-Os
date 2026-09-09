import { Link } from 'react-router-dom'
import { Activity, Anvil, FlaskConical, Scale } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, num, percent, tonnes } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Donut, RankedBars } from '@/components/charts'

export default function GeologyDashboard() {
  const totals = useSqlOne<{
    holes: number
    metres: number
    samples: number
    assays: number
    open_batches: number
    programs: number
  }>(`
    select
      (select count(*)::int from drillholes) as holes,
      (select coalesce(sum(final_depth_m), 0)::float8 from drillholes) as metres,
      (select count(*)::int from samples) as samples,
      (select count(*)::int from assays) as assays,
      (select count(*)::int from sample_batches where status in ('dispatched','at_lab')) as open_batches,
      (select count(*)::int from drill_programs where status = 'in_progress') as programs
  `)

  const resources = useSql<{ category: string; tonnes: number; metal: number; mine_name: string; commodity: string }>(`
    select r.category, r.tonnes::float8, coalesce(r.contained_metal, 0)::float8 as metal,
           m.name as mine_name, m.commodity
    from resource_statements r
    join mines m on m.id = r.mine_id
    where r.as_at = (select max(as_at) from resource_statements r2 where r2.mine_id = r.mine_id)
    order by r.tonnes desc
  `)

  const byCategory = useSql<{ category: string; t: number }>(`
    select category, sum(tonnes)::float8 as t
    from resource_statements r
    where r.as_at = (select max(as_at) from resource_statements r2 where r2.mine_id = r.mine_id)
    group by category
  `)

  const drilling = useSql<{ m: string; metres: number; holes: number }>(`
    select to_char(date_trunc('month', drilled_to), 'Mon') as m,
           coalesce(sum(final_depth_m), 0)::float8 as metres,
           count(*)::int as holes
    from drillholes where drilled_to >= current_date - 365
    group by date_trunc('month', drilled_to) order by date_trunc('month', drilled_to)
  `)

  const programs = useSql<{
    code: string
    name: string
    purpose: string
    planned_metres: number
    actual_metres: number
    status: string
  }>(`
    select code, name, purpose, coalesce(planned_metres, 0)::float8 as planned_metres,
           coalesce(actual_metres, 0)::float8 as actual_metres, status
    from drill_programs order by actual_metres desc limit 10
  `)

  const grades = useSql<{ element: string; avg_value: number; n: number; unit: string }>(`
    select element, round(avg(value)::numeric, 3)::float8 as avg_value, count(*)::int as n, min(unit) as unit
    from assays where value is not null
    group by element order by n desc limit 8
  `)

  const qaqc = useSql<{ qaqc_type: string; n: number }>(`
    select qaqc_type, count(*)::int as n from samples where qaqc_type is not null group by qaqc_type order by n desc
  `)

  const geotech = useSql<{ alarm_level: string; n: number }>(`
    select alarm_level, count(*)::int as n from geotech_monitoring
    where measured_at >= current_date - 30 group by alarm_level
  `)

  const reconciliation = useSql<{ mine_name: string; variance: number; pickups: number }>(`
    select m.name as mine_name, round(avg(sp.variance_pct)::numeric, 2)::float8 as variance, count(*)::int as pickups
    from survey_pickups sp join mines m on m.id = sp.mine_id
    where sp.pickup_date >= current_date - 180
    group by m.name order by abs(avg(sp.variance_pct)) desc
  `)

  const alarms = geotech.rows.filter((g) => g.alarm_level !== 'green').reduce((s, g) => s + g.n, 0)
  const t = totals.row

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Geology and resources"
        description="Drilling, sampling, the laboratory pipeline and the resource statement that flows from them."
      />

      <StatGrid>
        <StatCard label="Drillholes" value={num(t?.holes)} hint={`${compact(t?.metres)} m drilled`} icon={<Anvil className="size-4" />} loading={totals.loading} to="/m/drillholes" />
        <StatCard label="Samples collected" value={num(t?.samples)} hint={`${num(t?.assays)} assay results`} icon={<FlaskConical className="size-4" />} loading={totals.loading} to="/m/samples" />
        <StatCard label="Batches at the lab" value={num(t?.open_batches)} tone={(t?.open_batches ?? 0) > 8 ? 'warn' : 'info'} loading={totals.loading} to="/m/sample-batches" />
        <StatCard label="Active programmes" value={num(t?.programs)} icon={<Activity className="size-4" />} loading={totals.loading} to="/m/drill-programs" />
        <StatCard
          label="Geotech alarms, 30 days"
          value={num(alarms)}
          tone={alarms > 60 ? 'danger' : alarms > 20 ? 'warn' : 'ok'}
          icon={<Activity className="size-4" />}
          to="/m/geotechnical"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Drilling by month" subtitle="Metres completed over the last year" />
          <BarChart
            data={drilling.rows}
            xKey="m"
            height={220}
            series={[{ key: 'metres', label: 'Metres drilled' }]}
            yFormat={(v) => compact(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Resource by classification" subtitle="Latest statement, all mines" />
          <Donut
            data={byCategory.rows.map((c) => ({ label: c.category, value: c.t }))}
            centerLabel="tonnes"
            format={(v) => compact(v)}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Resource and reserve statement"
            subtitle="Most recent signed statement per mine, reported under JORC"
            action={
              <Link to="/m/resource-statements" className="text-2xs text-accent hover:underline">
                All statements
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Mine</th>
                <th className="px-4 py-2 text-left font-medium">Commodity</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Tonnes</th>
                <th className="px-4 py-2 text-right font-medium">Contained metal</th>
              </tr>
            </thead>
            <tbody>
              {resources.rows.map((r, i) => (
                <tr key={`${r.mine_name}-${r.category}-${i}`} className="border-b border-line/60">
                  <td className="px-4 py-2 font-medium text-ink">{r.mine_name}</td>
                  <td className="px-4 py-2 capitalize text-muted">{r.commodity.replace('_', ' ')}</td>
                  <td className="px-4 py-2">
                    <Badge tone={r.category === 'measured' || r.category === 'proven' ? 'ok' : r.category === 'indicated' || r.category === 'probable' ? 'info' : 'neutral'}>
                      {r.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tnum">{tonnes(r.tonnes)}</td>
                  <td className="px-4 py-2 text-right tnum">{compact(r.metal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Drill programme progress" subtitle="Metres against plan" />
          <div className="flex flex-col gap-2.5">
            {programs.rows.map((p) => {
              const pct = p.planned_metres > 0 ? (p.actual_metres / p.planned_metres) * 100 : 0
              return (
                <div key={p.code}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-ink" title={p.name}>
                      {p.code}
                    </span>
                    <span className="tnum text-2xs text-muted">
                      {compact(p.actual_metres)} / {compact(p.planned_metres)} m
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: pct >= 90 ? 'var(--ok)' : pct >= 50 ? 'var(--series-1)' : 'var(--warn)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Assay coverage" subtitle="Average value by element" />
          <RankedBars
            data={grades.rows.map((g) => ({
              label: `${g.element} (${g.unit})`,
              value: g.n,
              hint: `avg ${g.avg_value}`,
            }))}
            format={(v) => num(v)}
          />
        </Card>

        <Card>
          <CardHeader title="QAQC insertion" subtitle="Sample types submitted" />
          <RankedBars
            data={qaqc.rows.map((q) => ({
              label: q.qaqc_type.replace(/_/g, ' '),
              value: q.n,
              color: q.qaqc_type === 'primary' ? 'var(--series-1)' : 'var(--series-3)',
            }))}
            format={(v) => num(v)}
          />
          <p className="mt-3 text-2xs text-subtle">
            Industry practice is roughly one control sample in every twenty submitted.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Grade reconciliation"
          subtitle="Surveyed volumes against claimed production, last six months"
          icon={<Scale className="size-4" />}
        />
        <RankedBars
          data={reconciliation.rows.map((r) => ({
            label: r.mine_name,
            value: r.variance ?? 0,
            color: Math.abs(r.variance ?? 0) <= 3 ? 'var(--ok)' : Math.abs(r.variance ?? 0) <= 7 ? 'var(--warn)' : 'var(--danger)',
          }))}
          format={(v) => percent(v, 2)}
          max={12}
        />
      </Card>
    </div>
  )
}

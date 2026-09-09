import { Link } from 'react-router-dom'
import { AlertTriangle, Fuel, Gauge, Timer, Wrench } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, moneyCompact, num, percent, relative } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars, TrendChart } from '@/components/charts'

export default function FleetDashboard() {
  const totals = useSqlOne<{
    assets: number
    operational: number
    down: number
    availability: number | null
    open_wos: number
    overdue_pm: number
    cost_30d: number
    fuel_30d: number
  }>(`
    select
      (select count(*)::int from assets where status <> 'decommissioned') as assets,
      (select count(*)::int from assets where status = 'operational') as operational,
      (select count(*)::int from assets where status in ('breakdown','awaiting_parts')) as down,
      (select round(avg(availability_30d_pct)::numeric, 1)::float8 from v_asset_status where status <> 'decommissioned') as availability,
      (select count(*)::int from work_orders where status not in ('completed','verified','cancelled')) as open_wos,
      (select count(*)::int from v_maintenance_due where due_status = 'overdue') as overdue_pm,
      (select coalesce(sum(total_cost), 0)::float8 from work_orders where reported_at >= current_date - 30) as cost_30d,
      (select coalesce(sum(litres), 0)::float8 from fuel_transactions where transacted_at >= current_date - 30) as fuel_30d
  `)

  const downtimeTrend = useSql<{ d: string; planned: number; unplanned: number; operational: number }>(`
    select date_trunc('day', started_at)::date::text as d,
           coalesce(sum(duration_hours) filter (where category = 'planned_maintenance'), 0)::float8 as planned,
           coalesce(sum(duration_hours) filter (where category = 'unplanned_breakdown'), 0)::float8 as unplanned,
           coalesce(sum(duration_hours) filter (where category not in ('planned_maintenance','unplanned_breakdown')), 0)::float8 as operational
    from downtime_events
    where started_at >= current_date - 60 and duration_hours is not null
    group by date_trunc('day', started_at) order by 1
  `)

  const pareto = useSql<{ category: string; hours: number; events: number }>(`
    select category, coalesce(sum(hours), 0)::float8 as hours, coalesce(sum(events), 0)::int as events
    from v_downtime_pareto
    where month >= date_trunc('month', current_date) - interval '2 months'
    group by category order by hours desc
  `)

  const worstAssets = useSql<{
    asset_no: string
    name: string
    asset_type: string
    availability: number | null
    downtime: number
    breakdowns: number
    open_work_orders: number
    criticality: string
    status: string
  }>(`
    select asset_no, name, asset_type, availability_30d_pct::float8 as availability,
           downtime_hours_30d::float8 as downtime, breakdowns_30d as breakdowns,
           open_work_orders, criticality, status
    from v_asset_status
    where status <> 'decommissioned'
    order by downtime_hours_30d desc nulls last limit 12
  `)

  const dueSoon = useSql<{
    code: string
    asset_no: string
    asset_name: string
    service_type: string
    next_due_at: string | null
    due_status: string
  }>(`
    select code, asset_no, asset_name, service_type, next_due_at::text, due_status
    from v_maintenance_due
    where due_status in ('overdue','due_soon')
    order by next_due_at nulls last limit 12
  `)

  const byStatus = useSql<{ status: string; n: number }>(`
    select status, count(*)::int as n from assets where status <> 'decommissioned' group by status order by n desc
  `)

  const costByType = useSql<{ wo_type: string; cost: number }>(`
    select wo_type, coalesce(sum(total_cost), 0)::float8 as cost
    from work_orders where reported_at >= current_date - 90 group by wo_type order by cost desc
  `)

  const fuelByAsset = useSql<{ asset_no: string; litres: number; per_hour: number | null }>(`
    select a.asset_no, coalesce(sum(f.litres), 0)::float8 as litres,
           round((sum(f.litres) / nullif(count(*) * 12.0, 0))::numeric, 1)::float8 as per_hour
    from fuel_transactions f join assets a on a.id = f.asset_id
    where f.transacted_at >= current_date - 30
    group by a.asset_no order by litres desc limit 10
  `)

  const t = totals.row

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fleet and maintenance"
        description="Availability, downtime, the work order backlog and the preventive schedule for every asset."
      />

      <StatGrid>
        <StatCard
          label="Physical availability"
          value={percent(t?.availability)}
          hint="Rolling 30 days"
          tone={(t?.availability ?? 0) >= 85 ? 'ok' : 'warn'}
          icon={<Gauge className="size-4" />}
          loading={totals.loading}
        />
        <StatCard
          label="Assets in service"
          value={num(t?.operational)}
          hint={`of ${num(t?.assets)} registered`}
          icon={<Wrench className="size-4" />}
          loading={totals.loading}
          to="/m/assets"
        />
        <StatCard
          label="Down or awaiting parts"
          value={num(t?.down)}
          tone={(t?.down ?? 0) > 6 ? 'danger' : 'warn'}
          icon={<AlertTriangle className="size-4" />}
          loading={totals.loading}
        />
        <StatCard
          label="Open work orders"
          value={num(t?.open_wos)}
          hint={`${num(t?.overdue_pm)} services overdue`}
          tone={(t?.overdue_pm ?? 0) > 40 ? 'danger' : 'info'}
          icon={<Timer className="size-4" />}
          loading={totals.loading}
          to="/m/work-orders"
        />
        <StatCard
          label="Maintenance spend, 30 days"
          value={moneyCompact(t?.cost_30d)}
          hint={`${compact(t?.fuel_30d)} L fuel burned`}
          icon={<Fuel className="size-4" />}
          loading={totals.loading}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Downtime by day" subtitle="Hours lost over the last 60 days, split by cause" />
          <TrendChart
            data={downtimeTrend.rows}
            xKey="d"
            height={230}
            type="area"
            stacked
            series={[
              { key: 'planned', label: 'Planned maintenance', color: 'var(--series-1)' },
              { key: 'unplanned', label: 'Unplanned breakdown', color: 'var(--series-8)' },
              { key: 'operational', label: 'Operational delay', color: 'var(--series-4)' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '')}
            yFormat={(v) => `${num(v)} h`}
          />
        </Card>
        <Card>
          <CardHeader title="Fleet status" subtitle="Current state of the register" />
          <Donut
            data={byStatus.rows.map((s) => ({
              label: s.status.replace(/_/g, ' '),
              value: s.n,
              color:
                s.status === 'operational'
                  ? 'var(--ok)'
                  : s.status === 'breakdown'
                    ? 'var(--danger)'
                    : s.status === 'maintenance'
                      ? 'var(--series-4)'
                      : undefined,
            }))}
            centerLabel="assets"
            format={(v) => num(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Downtime pareto" subtitle="Hours by cause, last three months" />
          <RankedBars
            data={pareto.rows.map((p) => ({
              label: p.category.replace(/_/g, ' '),
              value: p.hours,
              hint: `${p.events} events`,
              color: p.category === 'unplanned_breakdown' ? 'var(--danger)' : undefined,
            }))}
            format={(v) => `${num(v)} h`}
          />
        </Card>
        <Card>
          <CardHeader title="Maintenance spend by work type" subtitle="Last 90 days" />
          <RankedBars
            data={costByType.rows.map((c) => ({ label: c.wo_type.replace(/_/g, ' '), value: c.cost }))}
            format={(v) => moneyCompact(v)}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Worst performing assets"
            subtitle="Ranked by downtime over the last 30 days"
            action={
              <Link to="/m/assets" className="text-2xs text-accent hover:underline">
                Asset register
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Asset</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Criticality</th>
                <th className="px-4 py-2 text-right font-medium">Downtime</th>
                <th className="px-4 py-2 text-right font-medium">Breakdowns</th>
                <th className="px-4 py-2 text-right font-medium">Availability</th>
                <th className="px-4 py-2 text-right font-medium">Open WOs</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {worstAssets.rows.map((a) => (
                <tr key={a.asset_no} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink">{a.asset_no}</span>
                    <span className="ml-2 text-subtle">{a.name}</span>
                  </td>
                  <td className="px-4 py-2 capitalize text-muted">{a.asset_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">
                    <Badge status={a.criticality} />
                  </td>
                  <td className="px-4 py-2 text-right tnum">{num(a.downtime, 1)} h</td>
                  <td className="px-4 py-2 text-right tnum">{a.breakdowns}</td>
                  <td className="px-4 py-2 text-right">
                    <Badge tone={(a.availability ?? 0) >= 85 ? 'ok' : (a.availability ?? 0) >= 70 ? 'warn' : 'danger'}>
                      {percent(a.availability, 0)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tnum">{a.open_work_orders}</td>
                  <td className="px-4 py-2">
                    <Badge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Services due"
            subtitle="Overdue and due within seven days"
            action={
              <Link to="/m/maintenance-plans" className="text-2xs text-accent hover:underline">
                All plans
              </Link>
            }
          />
          <ul className="flex flex-col gap-2">
            {dueSoon.rows.map((d) => (
              <li key={d.code} className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {d.asset_no} · {d.service_type.replace(/_/g, ' ')}
                  </p>
                  <p className="truncate text-2xs text-subtle">{d.asset_name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge status={d.due_status} />
                  <p className="mt-0.5 text-2xs text-subtle">{d.next_due_at ? relative(d.next_due_at) : '—'}</p>
                </div>
              </li>
            ))}
            {dueSoon.rows.length === 0 && (
              <li className="py-6 text-center text-xs text-subtle">Nothing overdue. Schedule is current.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Fuel consumption" subtitle="Litres by asset, last 30 days" />
          <RankedBars
            data={fuelByAsset.rows.map((f) => ({
              label: f.asset_no,
              value: f.litres,
              hint: f.per_hour ? `${f.per_hour} L/h` : undefined,
            }))}
            format={(v) => `${compact(v)} L`}
          />
        </Card>
      </div>
    </div>
  )
}

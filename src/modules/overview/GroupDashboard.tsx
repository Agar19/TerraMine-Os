import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Coins, Gauge, HardHat, Layers, PackageX, ShieldAlert, Truck,
} from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, moneyCompact, num, percent, relative, tonnes } from '@/lib/format'
import { toneFor } from '@/lib/status'
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Donut, RankedBars, TrendChart } from '@/components/charts'

export default function GroupDashboard() {
  const production = useSql<{ d: string; ore: number; waste: number; coal: number }>(`
    select record_date::text as d,
           coalesce(sum(ore_tonnes), 0)::float8 as ore,
           coalesce(sum(waste_tonnes), 0)::float8 as waste,
           coalesce(sum(coal_tonnes), 0)::float8 as coal
    from v_production_daily
    where record_date >= current_date - 60
    group by record_date order by record_date
  `)

  const headline = useSqlOne<{
    mtd_ore: number
    prev_ore: number
    mtd_waste: number
    people_underground: number
    gold_oz: number
    overdue_actions: number
    stock_alerts: number
    open_wos: number
  }>(`
    select
      (select coalesce(sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)), 0)::float8 from v_production_daily
        where record_date >= date_trunc('month', current_date)) as mtd_ore,
      -- Same elapsed days of the previous month, so the comparison is like for like.
      (select coalesce(sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)), 0)::float8 from v_production_daily
        where record_date between (date_trunc('month', current_date) - interval '1 month')::date
          and (date_trunc('month', current_date) - interval '1 month')::date
              + (current_date - date_trunc('month', current_date)::date)) as prev_ore,
      (select coalesce(sum(waste_tonnes), 0)::float8 from v_production_daily
        where record_date >= date_trunc('month', current_date)) as mtd_waste,
      (select count(*)::int from v_personnel_underground) as people_underground,
      (select coalesce(sum(fine_gold_oz), 0)::float8 from gold_pours
        where poured_at >= current_date - 30) as gold_oz,
      (select count(*)::int from v_open_actions where urgency = 'overdue') as overdue_actions,
      (select count(*)::int from v_stock_alerts where stock_status in ('reorder','stockout')) as stock_alerts,
      (select count(*)::int from work_orders where status not in ('completed','verified','cancelled')) as open_wos
  `)

  const fleet = useSqlOne<{ availability: number; breakdowns: number }>(`
    select round(avg(availability_30d_pct)::numeric, 1)::float8 as availability,
           coalesce(sum(breakdowns_30d), 0)::int as breakdowns
    from v_asset_status where status <> 'decommissioned'
  `)

  const safety = useSqlOne<{ recordables: number; ltis: number; near_misses: number; hipos: number }>(`
    select coalesce(sum(recordables), 0)::int as recordables,
           coalesce(sum(lost_time_injuries), 0)::int as ltis,
           coalesce(sum(near_misses), 0)::int as near_misses,
           coalesce(sum(high_potentials), 0)::int as hipos
    from v_safety_monthly where month >= date_trunc('month', current_date) - interval '11 months'
  `)

  const byCommodity = useSql<{ commodity: string; t: number }>(`
    select commodity, coalesce(sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)), 0)::float8 as t
    from v_production_daily
    where record_date >= current_date - 30
    group by commodity order by t desc
  `)

  const sites = useSql<{
    site_name: string
    mines: number
    ore: number
    waste: number
    grade: number | null
    incidents: number
    availability: number | null
  }>(`
    select s.name as site_name,
      (select count(*)::int from mines m where m.site_id = s.id) as mines,
      coalesce((select sum(coalesce(p.ore_tonnes, 0) + coalesce(p.coal_tonnes, 0)) from v_production_daily p
        where p.site_id = s.id and p.record_date >= current_date - 30), 0)::float8 as ore,
      coalesce((select sum(p.waste_tonnes) from v_production_daily p
        where p.site_id = s.id and p.record_date >= current_date - 30), 0)::float8 as waste,
      (select round(avg(p.avg_grade)::numeric, 2)::float8 from v_production_daily p
        where p.site_id = s.id and p.record_date >= current_date - 30 and p.avg_grade is not null) as grade,
      (select count(*)::int from incidents i where i.site_id = s.id and i.occurred_at >= current_date - 30) as incidents,
      (select round(avg(a.availability_30d_pct)::numeric, 1)::float8 from v_asset_status a where a.site_id = s.id) as availability
    from sites s order by ore desc
  `)

  const attainment = useSql<{ mine_name: string; attainment: number; commodity: string }>(`
    select mine_name, commodity, attainment_pct::float8 as attainment
    from v_plan_vs_actual
    where horizon = 'monthly' and period_start = date_trunc('month', current_date)::date
    order by attainment_pct desc nulls last
  `)

  const safetyTrend = useSql<{ m: string; recordables: number; near_misses: number; hipos: number }>(`
    select to_char(month, 'Mon') as m,
           sum(recordables)::int as recordables,
           sum(near_misses)::int as near_misses,
           sum(high_potentials)::int as hipos
    from v_safety_monthly
    where month >= date_trunc('month', current_date) - interval '11 months'
    group by month order by month
  `)

  const alerts = useSql<{ id: number; severity: string; title: string; body: string; link: string; created_at: string }>(
    `select id, severity, title, body, coalesce(link, '/alerts') as link, created_at
     from notifications order by created_at desc limit 6`,
  )

  const h = headline.row
  const oreDelta = h && h.prev_ore > 0 ? ((h.mtd_ore - h.prev_ore) / h.prev_ore) * 100 : null
  const stripRatio = h && h.mtd_ore > 0 ? h.mtd_waste / h.mtd_ore : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Group operations"
        description="Live position across every site, mine and plant in the group. All figures are calculated from shift-level records."
        meta={`Updated ${relative(new Date())}`}
        actions={
          <Button size="sm" variant="secondary" icon={<ArrowRight className="size-3.5" />}>
            <Link to="/scorecard">Site scorecard</Link>
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          label="Ore and coal, month to date"
          value={tonnes(h?.mtd_ore)}
          delta={oreDelta}
          deltaLabel="vs same days last month"
          icon={<Layers className="size-4" />}
          tone="accent"
          loading={headline.loading}
          spark={production.rows.slice(-20).map((r) => r.ore + r.coal)}
          to="/operations"
        />
        <StatCard
          label="Strip ratio, month to date"
          value={stripRatio != null ? stripRatio.toFixed(2) : '—'}
          unit="waste : ore"
          hint={`${tonnes(h?.mtd_waste)} waste moved`}
          icon={<Truck className="size-4" />}
          loading={headline.loading}
          to="/operations"
        />
        <StatCard
          label="Gold poured, 30 days"
          value={num(h?.gold_oz, 0)}
          unit="oz"
          icon={<Coins className="size-4" />}
          tone="accent"
          loading={headline.loading}
          to="/m/gold-pours"
        />
        <StatCard
          label="Fleet availability, 30 days"
          value={percent(fleet.row?.availability)}
          hint={`${num(fleet.row?.breakdowns)} unplanned breakdowns`}
          tone={(fleet.row?.availability ?? 0) >= 85 ? 'ok' : 'warn'}
          icon={<Gauge className="size-4" />}
          loading={fleet.loading}
          to="/maintenance"
        />
        <StatCard
          label="People underground now"
          value={num(h?.people_underground)}
          hint="Statutory tag board"
          icon={<HardHat className="size-4" />}
          tone="info"
          loading={headline.loading}
          to="/m/tag-board"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Material moved"
            subtitle="Daily ore, coal and waste across the group, last 60 days"
            action={
              <Link to="/m/production-records" className="text-2xs text-accent hover:underline">
                Records
              </Link>
            }
          />
          <TrendChart
            data={production.rows}
            xKey="d"
            type="area"
            stacked
            height={250}
            series={[
              { key: 'ore', label: 'Ore' },
              { key: 'coal', label: 'Coal' },
              { key: 'waste', label: 'Waste' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '')}
            yFormat={(v) => compact(v)}
          />
        </Card>

        <Card>
          <CardHeader title="Mix by commodity" subtitle="Ore and coal mined, last 30 days" />
          <Donut
            data={byCommodity.rows.map((r) => ({ label: r.commodity.replace('_', ' '), value: r.t }))}
            centerLabel="tonnes"
            format={(v) => compact(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Plan attainment this month"
            subtitle="Actual ore and coal against the approved monthly plan"
          />
          <RankedBars
            data={attainment.rows.map((r) => ({
              label: r.mine_name,
              value: r.attainment ?? 0,
              color:
                (r.attainment ?? 0) >= 95
                  ? 'var(--ok)'
                  : (r.attainment ?? 0) >= 80
                    ? 'var(--warn)'
                    : 'var(--danger)',
            }))}
            format={(v) => `${v.toFixed(0)}%`}
            max={120}
            emptyLabel="No active monthly plan"
          />
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Safety performance"
            subtitle="Recordable injuries, high potentials and near misses by month"
            action={
              <Link to="/safety" className="text-2xs text-accent hover:underline">
                Safety dashboard
              </Link>
            }
          />
          <BarChart
            data={safetyTrend.rows}
            xKey="m"
            height={210}
            series={[
              { key: 'near_misses', label: 'Near misses', color: 'var(--series-3)' },
              { key: 'recordables', label: 'Recordables', color: 'var(--series-2)' },
              { key: 'hipos', label: 'High potentials', color: 'var(--series-8)' },
            ]}
            yFormat={(v) => num(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-4 pb-0">
            <CardHeader title="Sites" subtitle="Last 30 days" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Site</th>
                  <th className="px-4 py-2 text-right font-medium">Mines</th>
                  <th className="px-4 py-2 text-right font-medium">Ore + coal</th>
                  <th className="px-4 py-2 text-right font-medium">Waste</th>
                  <th className="px-4 py-2 text-right font-medium">Avg grade</th>
                  <th className="px-4 py-2 text-right font-medium">Availability</th>
                  <th className="px-4 py-2 text-right font-medium">Incidents</th>
                </tr>
              </thead>
              <tbody>
                {sites.rows.map((s) => (
                  <tr key={s.site_name} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{s.site_name}</td>
                    <td className="px-4 py-2 text-right tnum">{s.mines}</td>
                    <td className="px-4 py-2 text-right tnum">{tonnes(s.ore)}</td>
                    <td className="px-4 py-2 text-right tnum text-muted">{tonnes(s.waste)}</td>
                    <td className="px-4 py-2 text-right tnum">{s.grade != null ? s.grade.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum">{percent(s.availability)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge tone={s.incidents > 8 ? 'danger' : s.incidents > 4 ? 'warn' : 'ok'}>
                        {s.incidents}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Needs attention" subtitle="Open items across the group" />
            <div className="flex flex-col gap-2">
              <AttentionRow
                icon={<ShieldAlert className="size-3.5" />}
                label="Overdue corrective actions"
                value={h?.overdue_actions ?? 0}
                to="/m/actions"
                tone="danger"
              />
              <AttentionRow
                icon={<PackageX className="size-3.5" />}
                label="Stock lines at or below reorder"
                value={h?.stock_alerts ?? 0}
                to="/supply"
                tone="warn"
              />
              <AttentionRow
                icon={<Truck className="size-3.5" />}
                label="Open work orders"
                value={h?.open_wos ?? 0}
                to="/m/work-orders"
                tone="info"
              />
              <AttentionRow
                icon={<AlertTriangle className="size-3.5" />}
                label="Recordable injuries, 12 months"
                value={safety.row?.recordables ?? 0}
                to="/m/incidents"
                tone="warn"
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Latest alerts"
              action={
                <Link to="/alerts" className="text-2xs text-accent hover:underline">
                  All
                </Link>
              }
            />
            {alerts.rows.length === 0 ? (
              <EmptyState title="Nothing to report" />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {alerts.rows.map((a) => (
                  <li key={a.id}>
                    <Link to={a.link} className="group block">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-ink group-hover:text-accent">{a.title}</p>
                        <Badge tone={toneFor(a.severity === 'critical' ? 'critical' : a.severity)}>
                          {a.severity}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-2xs text-muted">{a.body}</p>
                      <p className="text-2xs text-subtle">{relative(a.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <FinanceStrip />
    </div>
  )
}

function AttentionRow({
  icon,
  label,
  value,
  to,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  to: string
  tone: 'danger' | 'warn' | 'info'
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-inset"
    >
      <span
        className={
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-info'
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{label}</span>
      <span className="tnum text-sm font-semibold text-ink">{num(value)}</span>
    </Link>
  )
}

function FinanceStrip() {
  const { rows } = useSql<{ category: string; amount: number }>(`
    select category, sum(amount)::float8 as amount
    from cost_entries
    where entry_date >= date_trunc('month', current_date) - interval '2 months'
    group by category order by amount desc limit 8
  `)
  const revenue = useSqlOne<{ invoiced: number; outstanding: number }>(`
    select coalesce(sum(total_amount), 0)::float8 as invoiced,
           coalesce(sum(total_amount - received_amount) filter (where status not in ('paid','written_off')), 0)::float8 as outstanding
    from customer_invoices where invoice_date >= current_date - 90
  `)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Operating cost by category" subtitle="Last three months, all sites" />
        <RankedBars
          data={rows.map((r) => ({ label: r.category.replace(/_/g, ' '), value: r.amount }))}
          format={(v) => moneyCompact(v)}
        />
      </Card>
      <Card>
        <CardHeader title="Receivables" subtitle="Last 90 days" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Invoiced</p>
            <p className="text-2xl font-semibold tnum text-ink">{moneyCompact(revenue.row?.invoiced)}</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Outstanding</p>
            <p className="text-2xl font-semibold tnum text-warn">{moneyCompact(revenue.row?.outstanding)}</p>
          </div>
          <Link to="/commercial" className="text-2xs text-accent hover:underline">
            Sales dashboard →
          </Link>
        </div>
      </Card>
    </div>
  )
}

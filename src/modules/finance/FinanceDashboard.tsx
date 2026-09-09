import { Link } from 'react-router-dom'
import { Banknote, Calculator, PiggyBank, TrendingDown } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, moneyCompact, num, percent } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars, TrendChart } from '@/components/charts'

export default function FinanceDashboard() {
  const totals = useSqlOne<{
    cost_ytd: number
    cost_30d: number
    budget: number
    tonnes_ytd: number
    revenue_ytd: number
    capital: number
  }>(`
    select
      (select coalesce(sum(amount), 0)::float8 from cost_entries where entry_date >= date_trunc('year', current_date)) as cost_ytd,
      (select coalesce(sum(amount), 0)::float8 from cost_entries where entry_date >= current_date - 30) as cost_30d,
      (select coalesce(sum(total_amount), 0)::float8 from budgets where fiscal_year = extract(year from current_date)) as budget,
      (select coalesce(sum(total_tonnes), 0)::float8 from v_production_daily where record_date >= date_trunc('year', current_date)) as tonnes_ytd,
      (select coalesce(sum(total_amount), 0)::float8 from customer_invoices where invoice_date >= date_trunc('year', current_date)) as revenue_ytd,
      (select coalesce(sum(amount), 0)::float8 from cost_entries where cost_type = 'capital' and entry_date >= date_trunc('year', current_date)) as capital
  `)

  const monthly = useSql<{ m: string; operating: number; capital: number; overhead: number }>(`
    select to_char(date_trunc('month', entry_date), 'Mon') as m,
           coalesce(sum(amount) filter (where cost_type = 'operating'), 0)::float8 as operating,
           coalesce(sum(amount) filter (where cost_type = 'capital'), 0)::float8 as capital,
           coalesce(sum(amount) filter (where cost_type = 'overhead'), 0)::float8 as overhead
    from cost_entries where entry_date >= current_date - 365
    group by date_trunc('month', entry_date) order by date_trunc('month', entry_date)
  `)

  const byCategory = useSql<{ category: string; amount: number }>(`
    select category, coalesce(sum(amount), 0)::float8 as amount
    from cost_entries where entry_date >= current_date - 180
    group by category order by amount desc
  `)

  const unitCost = useSql<{ m: string; cost_per_tonne: number | null }>(`
    select to_char(month, 'Mon') as m,
           round(avg(cost_per_tonne_moved)::numeric, 2)::float8 as cost_per_tonne
    from v_cost_per_tonne
    where month >= date_trunc('month', current_date) - interval '11 months'
      and cost_per_tonne_moved is not null
    group by month order by month
  `)

  const variance = useSql<{
    cost_center_code: string
    cost_center_name: string
    budget_amount: number
    actual_amount: number
    variance: number
    spend_pct: number | null
  }>(`
    select coalesce(cost_center_code, '—') as cost_center_code,
           coalesce(cost_center_name, 'Unallocated') as cost_center_name,
           budget_amount::float8, actual_amount::float8, variance::float8, spend_pct::float8
    from v_budget_variance
    where budget_amount > 0
    order by abs(variance) desc limit 14
  `)

  const bySite = useSql<{ site_name: string; cost: number; tonnes: number }>(`
    select s.name as site_name, coalesce(sum(c.amount), 0)::float8 as cost,
           coalesce((select sum(p.total_tonnes) from v_production_daily p
             where p.site_id = s.id and p.record_date >= current_date - 90), 0)::float8 as tonnes
    from sites s left join cost_entries c on c.site_id = s.id and c.entry_date >= current_date - 90
    group by s.id, s.name order by cost desc
  `)

  const kpis = useSql<{ code: string; name: string; unit: string; actual: number | null; target: number | null; status: string | null }>(`
    select k.code, k.name, k.unit, v.actual_value::float8 as actual, v.target_value::float8 as target, v.status
    from kpi_values v join kpi_definitions k on k.id = v.kpi_id
    where k.module = 'finance' and v.period_start = (select max(period_start) from kpi_values)
    limit 8
  `)

  const t = totals.row
  const costPerTonne = t && t.tonnes_ytd > 0 ? t.cost_ytd / t.tonnes_ytd : null
  const budgetUsed = t && t.budget > 0 ? (t.cost_ytd / t.budget) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cost and performance"
        description="Where the money goes, against budget and against tonnes moved. Unit cost is the number that matters."
      />

      <StatGrid>
        <StatCard
          label="Operating cost, year to date"
          value={moneyCompact(t?.cost_ytd)}
          hint={`${moneyCompact(t?.cost_30d)} in the last 30 days`}
          icon={<Banknote className="size-4" />}
          loading={totals.loading}
          to="/m/cost-entries"
        />
        <StatCard
          label="Cost per tonne moved"
          value={costPerTonne != null ? `$${costPerTonne.toFixed(2)}` : '—'}
          icon={<Calculator className="size-4" />}
          deltaDirection="lower_better"
          tone={(costPerTonne ?? 0) <= 5 ? 'ok' : 'warn'}
          loading={totals.loading}
          spark={unitCost.rows.map((u) => u.cost_per_tonne ?? 0)}
        />
        <StatCard
          label="Budget consumed"
          value={percent(budgetUsed)}
          hint={`${moneyCompact(t?.budget)} approved`}
          tone={(budgetUsed ?? 0) <= 100 ? 'ok' : 'danger'}
          icon={<PiggyBank className="size-4" />}
          loading={totals.loading}
          to="/m/budgets"
        />
        <StatCard
          label="Capital spend"
          value={moneyCompact(t?.capital)}
          hint="Year to date"
          loading={totals.loading}
        />
        <StatCard
          label="Revenue invoiced"
          value={moneyCompact(t?.revenue_ytd)}
          hint={`${compact(t?.tonnes_ytd)} t moved`}
          tone="accent"
          loading={totals.loading}
          to="/commercial"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Cost by month" subtitle="Operating, capital and overhead over the last year" />
          <TrendChart
            data={monthly.rows}
            xKey="m"
            height={230}
            type="area"
            stacked
            series={[
              { key: 'operating', label: 'Operating', color: 'var(--series-1)' },
              { key: 'capital', label: 'Capital', color: 'var(--series-3)' },
              { key: 'overhead', label: 'Overhead', color: 'var(--series-4)' },
            ]}
            yFormat={(v) => moneyCompact(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Cost mix" subtitle="Last six months by category" />
          <Donut
            data={byCategory.rows.slice(0, 8).map((c) => ({ label: c.category.replace(/_/g, ' '), value: c.amount }))}
            centerLabel="spend"
            format={(v) => moneyCompact(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Unit cost trend"
            subtitle="Average cost per tonne moved by month"
            icon={<TrendingDown className="size-4" />}
          />
          <TrendChart
            data={unitCost.rows}
            xKey="m"
            height={200}
            series={[{ key: 'cost_per_tonne', label: 'Cost per tonne moved', color: 'var(--series-2)' }]}
            yFormat={(v) => `$${v.toFixed(2)}`}
          />
        </Card>
        <Card>
          <CardHeader title="Cost by site" subtitle="Last 90 days" />
          <RankedBars
            data={bySite.rows.map((s) => ({
              label: s.site_name,
              value: s.cost,
              hint: s.tonnes > 0 ? `$${(s.cost / s.tonnes).toFixed(2)}/t` : undefined,
            }))}
            format={(v) => moneyCompact(v)}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Budget variance by cost centre"
            subtitle="Largest absolute variances this fiscal year"
            action={
              <Link to="/m/budget-lines" className="text-2xs text-accent hover:underline">
                Budget detail
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Cost centre</th>
                <th className="px-4 py-2 text-right font-medium">Budget</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
                <th className="px-4 py-2 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {variance.rows.map((v, i) => (
                <tr key={`${v.cost_center_code}-${i}`} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink">{v.cost_center_code}</span>
                    <span className="ml-2 text-subtle">{v.cost_center_name}</span>
                  </td>
                  <td className="px-4 py-2 text-right tnum text-muted">{moneyCompact(v.budget_amount)}</td>
                  <td className="px-4 py-2 text-right tnum">{moneyCompact(v.actual_amount)}</td>
                  <td className={`px-4 py-2 text-right tnum ${v.variance > 0 ? 'text-danger' : 'text-ok'}`}>
                    {v.variance > 0 ? '+' : ''}
                    {moneyCompact(v.variance)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Badge tone={(v.spend_pct ?? 0) <= 100 ? 'ok' : (v.spend_pct ?? 0) <= 115 ? 'warn' : 'danger'}>
                      {percent(v.spend_pct, 0)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {kpis.rows.length > 0 && (
        <Card>
          <CardHeader title="Finance KPIs" subtitle="Latest reported period" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.rows.map((k) => (
              <div key={k.code} className="rounded-md bg-inset p-3">
                <p className="truncate text-2xs uppercase tracking-wide text-subtle">{k.name}</p>
                <p className="mt-1 text-lg font-semibold tnum text-ink">
                  {num(k.actual, 2)} <span className="text-2xs font-normal text-subtle">{k.unit}</span>
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-2xs text-subtle">Target {num(k.target, 2)}</span>
                  <Badge status={k.status ?? 'no_data'} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

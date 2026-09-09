import { Link } from 'react-router-dom'
import { Banknote, Scale, Ship, TrendingUp } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, moneyCompact, num, percent, tonnes } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars, TrendChart } from '@/components/charts'

export default function CommercialDashboard() {
  const totals = useSqlOne<{
    despatched: number
    revenue: number
    outstanding: number
    overdue: number
    in_transit: number
    contracts: number
    contracted: number
    delivered: number
    royalties: number
  }>(`
    select
      (select coalesce(sum(dry_tonnes), 0)::float8 from shipments where dispatched_on >= current_date - 90) as despatched,
      (select coalesce(sum(total_amount), 0)::float8 from customer_invoices where invoice_date >= current_date - 90) as revenue,
      (select coalesce(sum(total_amount - received_amount), 0)::float8 from customer_invoices where status not in ('paid','written_off')) as outstanding,
      (select count(*)::int from customer_invoices where status not in ('paid','written_off') and due_date < current_date) as overdue,
      (select count(*)::int from shipments where status in ('in_transit','loading')) as in_transit,
      (select count(*)::int from sales_contracts where status = 'active') as contracts,
      (select coalesce(sum(contracted_tonnes), 0)::float8 from sales_contracts where status = 'active') as contracted,
      (select coalesce(sum(delivered_tonnes), 0)::float8 from sales_contracts where status = 'active') as delivered,
      (select coalesce(sum(amount), 0)::float8 from royalties where period_start >= current_date - 365) as royalties
  `)

  const shipmentTrend = useSql<{ m: string; tonnes: number; value: number }>(`
    select to_char(date_trunc('month', dispatched_on), 'Mon') as m,
           coalesce(sum(dry_tonnes), 0)::float8 as tonnes,
           coalesce(sum(invoice_value), 0)::float8 as value
    from shipments where dispatched_on >= current_date - 365
    group by date_trunc('month', dispatched_on) order by date_trunc('month', dispatched_on)
  `)

  const byCommodity = useSql<{ commodity: string; t: number; value: number }>(`
    select c.commodity, coalesce(sum(s.dry_tonnes), 0)::float8 as t, coalesce(sum(s.invoice_value), 0)::float8 as value
    from shipments s join sales_contracts c on c.id = s.contract_id
    where s.dispatched_on >= current_date - 365
    group by c.commodity order by value desc
  `)

  const customers = useSql<{ name: string; t: number; value: number; invoices: number }>(`
    select cu.name, coalesce(sum(s.dry_tonnes), 0)::float8 as t, coalesce(sum(s.invoice_value), 0)::float8 as value,
           count(distinct ci.id)::int as invoices
    from customers cu
    left join shipments s on s.customer_id = cu.id and s.dispatched_on >= current_date - 365
    left join customer_invoices ci on ci.customer_id = cu.id and ci.invoice_date >= current_date - 365
    group by cu.id, cu.name having coalesce(sum(s.dry_tonnes), 0) > 0
    order by value desc limit 10
  `)

  const prices = useSql<{ d: string; gold: number | null; copper: number | null; coal: number | null }>(`
    select price_date::text as d,
           max(price) filter (where commodity = 'gold')::float8 as gold,
           max(price) filter (where commodity = 'copper')::float8 as copper,
           max(price) filter (where commodity = 'coal')::float8 as coal
    from commodity_prices where price_date >= current_date - 180
    group by price_date order by price_date
  `)

  const recent = useSql<{
    shipment_no: string
    customer: string
    dispatched_on: string | null
    dry_tonnes: number
    cv: number | null
    ash: number | null
    invoice_value: number
    status: string
  }>(`
    select s.shipment_no, coalesce(c.name, '—') as customer, s.dispatched_on::text,
           coalesce(s.dry_tonnes, 0)::float8 as dry_tonnes, s.cv_kcal_kg::float8 as cv,
           s.ash_pct::float8 as ash, coalesce(s.invoice_value, 0)::float8 as invoice_value, s.status
    from shipments s left join customers c on c.id = s.customer_id
    order by s.dispatched_on desc nulls last limit 12
  `)

  const weighbridge = useSqlOne<{ tickets: number; net: number }>(`
    select count(*)::int as tickets, coalesce(sum(net_kg), 0)::float8 / 1000 as net
    from weighbridge_tickets where weighed_at >= current_date - 30 and direction = 'outbound'
  `)

  const quality = useSqlOne<{ in_spec: number; total: number }>(`
    select count(*) filter (where within_spec)::int as in_spec, count(*)::int as total
    from quality_samples where sampled_at >= current_date - 90
  `)

  const t = totals.row
  const contractProgress = t && t.contracted > 0 ? (t.delivered / t.contracted) * 100 : null
  const inSpec = quality.row && quality.row.total > 0 ? (quality.row.in_spec / quality.row.total) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sales and logistics"
        description="Despatch, contracted commitment, product quality on delivery and the receivables position."
      />

      <StatGrid>
        <StatCard
          label="Despatched, 90 days"
          value={tonnes(t?.despatched)}
          hint={`${num(weighbridge.row?.tickets)} outbound weighbridge tickets`}
          icon={<Ship className="size-4" />}
          tone="accent"
          loading={totals.loading}
          to="/m/shipments"
        />
        <StatCard
          label="Invoiced, 90 days"
          value={moneyCompact(t?.revenue)}
          icon={<Banknote className="size-4" />}
          loading={totals.loading}
          to="/m/customer-invoices"
        />
        <StatCard
          label="Outstanding receivables"
          value={moneyCompact(t?.outstanding)}
          hint={`${num(t?.overdue)} invoices past due`}
          tone={(t?.overdue ?? 0) > 5 ? 'warn' : 'neutral'}
          loading={totals.loading}
        />
        <StatCard
          label="Contract delivery"
          value={percent(contractProgress)}
          hint={`${num(t?.contracts)} active contracts`}
          tone={(contractProgress ?? 0) >= 45 ? 'ok' : 'warn'}
          loading={totals.loading}
          to="/m/sales-contracts"
        />
        <StatCard
          label="Product within spec"
          value={percent(inSpec)}
          hint={`${num(t?.in_transit)} shipments in transit`}
          tone={(inSpec ?? 0) >= 90 ? 'ok' : 'warn'}
          icon={<Scale className="size-4" />}
          to="/m/quality-samples"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Despatch volume" subtitle="Dry tonnes shipped by month" />
          <TrendChart
            data={shipmentTrend.rows}
            xKey="m"
            height={220}
            type="area"
            series={[{ key: 'tonnes', label: 'Dry tonnes shipped' }]}
            yFormat={(v) => compact(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Revenue mix" subtitle="Invoice value by commodity, 12 months" />
          <Donut
            data={byCommodity.rows.map((c) => ({ label: c.commodity.replace('_', ' '), value: c.value }))}
            centerLabel="revenue"
            format={(v) => moneyCompact(v)}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Commodity prices"
          subtitle="Marks used for valuation, last 180 days"
          icon={<TrendingUp className="size-4" />}
          action={
            <Link to="/m/commodity-prices" className="text-2xs text-accent hover:underline">
              Price history
            </Link>
          }
        />
        <TrendChart
          data={prices.rows}
          xKey="d"
          height={200}
          series={[
            { key: 'gold', label: 'Gold (USD/oz)', color: 'var(--series-4)' },
            { key: 'copper', label: 'Copper (USD/t)', color: 'var(--series-2)' },
            { key: 'coal', label: 'Coal (USD/t)', color: 'var(--series-1)' },
          ]}
          xFormat={(v) => date(v).replace(/,.*/, '')}
          yFormat={(v) => compact(v)}
        />
        <p className="mt-2 text-2xs text-subtle">
          Three commodities on one axis compares scale, not level — read each series against its own trend.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Recent shipments"
              action={
                <Link to="/m/shipments" className="text-2xs text-accent hover:underline">
                  All shipments
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                  <th className="px-4 py-2 text-left font-medium">Customer</th>
                  <th className="px-4 py-2 text-left font-medium">Despatched</th>
                  <th className="px-4 py-2 text-right font-medium">Dry tonnes</th>
                  <th className="px-4 py-2 text-right font-medium">CV</th>
                  <th className="px-4 py-2 text-right font-medium">Ash</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.rows.map((s) => (
                  <tr key={s.shipment_no} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{s.shipment_no}</td>
                    <td className="px-4 py-2 text-muted">{s.customer}</td>
                    <td className="px-4 py-2 tnum text-muted">{s.dispatched_on ? date(s.dispatched_on) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum">{num(s.dry_tonnes, 0)}</td>
                    <td className="px-4 py-2 text-right tnum">{s.cv ? num(s.cv, 0) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum">{s.ash ? percent(s.ash) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum">{moneyCompact(s.invoice_value)}</td>
                    <td className="px-4 py-2">
                      <Badge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Top customers" subtitle="Value shipped, 12 months" />
            <RankedBars
              data={customers.rows.map((c) => ({
                label: c.name,
                value: c.value,
                hint: `${compact(c.t)} t`,
              }))}
              format={(v) => moneyCompact(v)}
            />
          </Card>
          <Card>
            <CardHeader title="Royalties" subtitle="Accrued and paid, 12 months" />
            <p className="text-2xl font-semibold tnum text-ink">{moneyCompact(t?.royalties)}</p>
            <p className="mt-1 text-2xs text-subtle">
              Government, landowner and community royalties across all sites.
            </p>
            <Link to="/m/royalties" className="mt-2 inline-block text-2xs text-accent hover:underline">
              Royalty register →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}

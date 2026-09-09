import { Link } from 'react-router-dom'
import { AlertTriangle, Boxes, PackageSearch, ShoppingCart, Truck } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { date, moneyCompact, num, percent, relative } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars, TrendChart } from '@/components/charts'

export default function SupplyDashboard() {
  const totals = useSqlOne<{
    stock_value: number
    lines: number
    reorder: number
    stockouts: number
    open_pos: number
    committed: number
    overdue_invoices: number
    payable: number
  }>(`
    select
      (select coalesce(sum(stock_value), 0)::float8 from v_stock_alerts) as stock_value,
      (select count(*)::int from v_stock_alerts) as lines,
      (select count(*)::int from v_stock_alerts where stock_status = 'reorder') as reorder,
      (select count(*)::int from v_stock_alerts where stock_status = 'stockout') as stockouts,
      (select count(*)::int from purchase_orders where status not in ('closed','cancelled')) as open_pos,
      (select coalesce(sum(total_amount - received_value), 0)::float8 from purchase_orders where status not in ('closed','cancelled')) as committed,
      (select count(*)::int from supplier_invoices where status not in ('paid','cancelled') and due_date < current_date) as overdue_invoices,
      (select coalesce(sum(total_amount - paid_amount), 0)::float8 from supplier_invoices where status not in ('paid','cancelled')) as payable
  `)

  const spend = useSql<{ m: string; ordered: number; received: number }>(`
    select to_char(date_trunc('month', order_date), 'Mon') as m,
           coalesce(sum(total_amount), 0)::float8 as ordered,
           coalesce(sum(received_value), 0)::float8 as received
    from purchase_orders where order_date >= current_date - 365
    group by date_trunc('month', order_date) order by date_trunc('month', order_date)
  `)

  const criticalAlerts = useSql<{
    item_code: string
    item_name: string
    warehouse_name: string
    quantity_on_hand: number
    reorder_point: number | null
    stock_status: string
    is_critical: boolean
    uom: string
  }>(`
    select item_code, item_name, warehouse_name, quantity_on_hand::float8, reorder_point::float8,
           stock_status, is_critical, uom
    from v_stock_alerts
    where stock_status in ('stockout','reorder')
    order by is_critical desc, quantity_on_hand asc limit 14
  `)

  const byCategory = useSql<{ category: string; value: number }>(`
    select i.category, coalesce(sum(sl.quantity_on_hand * coalesce(sl.average_cost, i.unit_cost, 0)), 0)::float8 as value
    from stock_levels sl join items i on i.id = sl.item_id
    group by i.category order by value desc
  `)

  const topSuppliers = useSql<{ name: string; spend: number; orders: number; rating: number | null }>(`
    select s.name, coalesce(sum(po.total_amount), 0)::float8 as spend, count(po.id)::int as orders, s.rating::float8
    from suppliers s join purchase_orders po on po.supplier_id = s.id
    where po.order_date >= current_date - 365
    group by s.id, s.name, s.rating order by spend desc limit 10
  `)

  const movement = useSql<{ movement_type: string; n: number; value: number }>(`
    select movement_type, count(*)::int as n, coalesce(sum(abs(total_value)), 0)::float8 as value
    from stock_movements where moved_at >= current_date - 90
    group by movement_type order by value desc
  `)

  const pendingPos = useSql<{
    po_number: string
    supplier: string
    order_date: string
    expected_date: string | null
    total_amount: number
    status: string
  }>(`
    select po.po_number, s.name as supplier, po.order_date::text, po.expected_date::text,
           po.total_amount::float8, po.status
    from purchase_orders po join suppliers s on s.id = po.supplier_id
    where po.status in ('issued','acknowledged','partially_received')
    order by po.expected_date nulls last limit 12
  `)

  const t = totals.row

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Supply chain"
        description="Inventory position, replenishment exposure, purchasing commitment and supplier performance."
      />

      <StatGrid>
        <StatCard
          label="Inventory value"
          value={moneyCompact(t?.stock_value)}
          hint={`${num(t?.lines)} stocked lines`}
          icon={<Boxes className="size-4" />}
          loading={totals.loading}
          to="/m/stock-levels"
        />
        <StatCard
          label="Below reorder point"
          value={num(t?.reorder)}
          tone={(t?.reorder ?? 0) > 60 ? 'warn' : 'info'}
          icon={<PackageSearch className="size-4" />}
          loading={totals.loading}
        />
        <StatCard
          label="Stockouts"
          value={num(t?.stockouts)}
          tone={(t?.stockouts ?? 0) > 0 ? 'danger' : 'ok'}
          icon={<AlertTriangle className="size-4" />}
          loading={totals.loading}
        />
        <StatCard
          label="Open purchase orders"
          value={num(t?.open_pos)}
          hint={`${moneyCompact(t?.committed)} still to receive`}
          icon={<ShoppingCart className="size-4" />}
          loading={totals.loading}
          to="/m/purchase-orders"
        />
        <StatCard
          label="Accounts payable"
          value={moneyCompact(t?.payable)}
          hint={`${num(t?.overdue_invoices)} invoices past due`}
          tone={(t?.overdue_invoices ?? 0) > 10 ? 'warn' : 'neutral'}
          loading={totals.loading}
          to="/m/supplier-invoices"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Purchasing" subtitle="Ordered against received value by month" />
          <TrendChart
            data={spend.rows}
            xKey="m"
            height={220}
            type="area"
            series={[
              { key: 'ordered', label: 'Ordered', color: 'var(--series-1)' },
              { key: 'received', label: 'Received', color: 'var(--series-3)' },
            ]}
            yFormat={(v) => moneyCompact(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Inventory by category" subtitle="Value on hand" />
          <Donut
            data={byCategory.rows.map((c) => ({ label: c.category.replace(/_/g, ' '), value: c.value }))}
            centerLabel="value"
            format={(v) => moneyCompact(v)}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Replenishment exposure"
            subtitle="Critical lines first"
            action={
              <Link to="/m/items" className="text-2xs text-accent hover:underline">
                Item catalogue
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Item</th>
                <th className="px-4 py-2 text-left font-medium">Warehouse</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2 text-right font-medium">Reorder at</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Critical</th>
              </tr>
            </thead>
            <tbody>
              {criticalAlerts.rows.map((a, i) => (
                <tr key={`${a.item_code}-${i}`} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink">{a.item_code}</span>
                    <span className="ml-2 text-subtle">{a.item_name}</span>
                  </td>
                  <td className="px-4 py-2 text-muted">{a.warehouse_name}</td>
                  <td className="px-4 py-2 text-right tnum">
                    {num(a.quantity_on_hand, 1)} {a.uom}
                  </td>
                  <td className="px-4 py-2 text-right tnum text-muted">{num(a.reorder_point, 0)}</td>
                  <td className="px-4 py-2">
                    <Badge status={a.stock_status} />
                  </td>
                  <td className="px-4 py-2">{a.is_critical ? <Badge tone="danger">Critical</Badge> : '—'}</td>
                </tr>
              ))}
              {criticalAlerts.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-subtle">
                    Every line is above its reorder point.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Top suppliers" subtitle="Spend over the last 12 months" />
          <RankedBars
            data={topSuppliers.rows.map((s) => ({
              label: s.name,
              value: s.spend,
              hint: `${s.orders} orders · rating ${s.rating ?? '—'}`,
            }))}
            format={(v) => moneyCompact(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Stock movement" subtitle="Value by type, last 90 days" />
          <RankedBars
            data={movement.rows.map((m) => ({
              label: m.movement_type.replace(/_/g, ' '),
              value: m.value,
              hint: `${m.n} transactions`,
            }))}
            format={(v) => moneyCompact(v)}
          />
        </Card>
        <Card>
          <CardHeader
            title="Deliveries expected"
            subtitle="Open orders by expected date"
            icon={<Truck className="size-4" />}
          />
          <ul className="flex flex-col gap-2">
            {pendingPos.rows.map((p) => (
              <li key={p.po_number} className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{p.po_number}</p>
                  <p className="truncate text-2xs text-subtle">{p.supplier}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-xs font-semibold text-ink">{moneyCompact(p.total_amount)}</p>
                  <p className="text-2xs text-subtle">
                    {p.expected_date ? relative(p.expected_date) : date(p.order_date)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Inventory health" subtitle="How much of the catalogue is sitting where it should" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Lines in stock" value={num((t?.lines ?? 0) - (t?.stockouts ?? 0))} />
          <Metric label="Reorder coverage" value={percent(t ? 100 - (t.reorder / Math.max(1, t.lines)) * 100 : null)} />
          <Metric label="Average line value" value={moneyCompact(t && t.lines > 0 ? t.stock_value / t.lines : 0)} />
          <Metric label="Committed spend" value={moneyCompact(t?.committed)} />
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-subtle">{label}</p>
      <p className="text-lg font-semibold tnum text-ink">{value}</p>
    </div>
  )
}

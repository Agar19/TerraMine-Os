import { Link } from 'react-router-dom'
import { Coins, Droplets, Gauge, Percent } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, moneyCompact, num, percent, tonnes } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { RankedBars, TrendChart } from '@/components/charts'

export default function ProcessingDashboard() {
  const totals = useSqlOne<{
    feed: number
    product: number
    recovery: number | null
    yield_pct: number | null
    gold_oz: number
    power: number
    downtime: number
  }>(`
    select
      coalesce(sum(feed_tonnes), 0)::float8 as feed,
      coalesce(sum(product_tonnes), 0)::float8 as product,
      round(avg(recovery_pct)::numeric, 2)::float8 as recovery,
      round(avg(yield_pct)::numeric, 2)::float8 as yield_pct,
      (select coalesce(sum(fine_gold_oz), 0)::float8 from gold_pours where poured_at >= current_date - 30) as gold_oz,
      coalesce(sum(power_kwh), 0)::float8 as power,
      coalesce(sum(downtime_hours), 0)::float8 as downtime
    from plant_runs where run_date >= current_date - 30
  `)

  const daily = useSql<{ d: string; feed: number; product: number }>(`
    select run_date::text as d,
           coalesce(sum(feed_tonnes), 0)::float8 as feed,
           coalesce(sum(product_tonnes), 0)::float8 as product
    from plant_runs where run_date >= current_date - 90
    group by run_date order by run_date
  `)

  const recovery = useSql<{ d: string; recovery: number | null; yield_pct: number | null }>(`
    select run_date::text as d,
           round(avg(recovery_pct)::numeric, 2)::float8 as recovery,
           round(avg(yield_pct)::numeric, 2)::float8 as yield_pct
    from plant_runs where run_date >= current_date - 90
    group by run_date order by run_date
  `)

  const plants = useSql<{
    plant_name: string
    plant_type: string
    feed: number
    throughput: number | null
    design: number | null
    recovery: number | null
    availability: number | null
    utilisation: number | null
  }>(`
    select plant_name, plant_type,
           coalesce(sum(feed_tonnes), 0)::float8 as feed,
           round(avg(throughput_tph)::numeric, 1)::float8 as throughput,
           max(design_throughput_tph)::float8 as design,
           round(avg(recovery_pct)::numeric, 2)::float8 as recovery,
           round(avg(availability_pct)::numeric, 1)::float8 as availability,
           round(avg(capacity_utilisation_pct)::numeric, 1)::float8 as utilisation
    from v_plant_performance where run_date >= current_date - 30
    group by plant_name, plant_type order by feed desc
  `)

  const reagents = useSql<{ reagent: string; cost: number; qty: number }>(`
    select reagent, coalesce(sum(total_cost), 0)::float8 as cost, coalesce(sum(quantity), 0)::float8 as qty
    from reagent_consumption where consumed_on >= current_date - 90
    group by reagent order by cost desc limit 10
  `)

  const pours = useSql<{ pour_number: string; poured_at: string; oz: number; fineness: number; status: string }>(`
    select pour_number, poured_at::text, fine_gold_oz::float8 as oz, fineness::float8, status
    from gold_pours order by poured_at desc limit 8
  `)

  const quality = useSqlOne<{ in_spec: number; total: number }>(`
    select count(*) filter (where within_spec)::int as in_spec, count(*)::int as total
    from quality_samples where sampled_at >= current_date - 90
  `)

  const tsf = useSql<{ code: string; freeboard: number | null; min_freeboard: number | null; alarm: string | null; consequence: string }>(`
    select f.code, r.freeboard_m::float8 as freeboard, f.min_freeboard_m::float8 as min_freeboard,
           r.alarm_level as alarm, f.consequence_category as consequence
    from tailings_facilities f
    left join lateral (
      select freeboard_m, alarm_level from tailings_readings tr
      where tr.facility_id = f.id order by measured_at desc limit 1
    ) r on true
    order by f.code
  `)

  const t = totals.row
  const inSpecPct = quality.row && quality.row.total > 0 ? (quality.row.in_spec / quality.row.total) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Processing"
        description="Metallurgical accounting across every plant: feed, recovery, yield, reagents and product quality."
      />

      <StatGrid>
        <StatCard label="Plant feed, 30 days" value={tonnes(t?.feed)} icon={<Gauge className="size-4" />} tone="accent" loading={totals.loading} />
        <StatCard label="Product, 30 days" value={tonnes(t?.product)} loading={totals.loading} />
        <StatCard
          label="Average recovery"
          value={percent(t?.recovery)}
          icon={<Percent className="size-4" />}
          tone={(t?.recovery ?? 0) >= 88 ? 'ok' : 'warn'}
          loading={totals.loading}
        />
        <StatCard label="Gold poured, 30 days" value={num(t?.gold_oz, 0)} unit="oz" icon={<Coins className="size-4" />} tone="accent" loading={totals.loading} to="/m/gold-pours" />
        <StatCard
          label="Product within spec"
          value={percent(inSpecPct)}
          hint={`${num(quality.row?.in_spec)} of ${num(quality.row?.total)} samples`}
          tone={(inSpecPct ?? 0) >= 90 ? 'ok' : 'warn'}
          to="/m/quality-samples"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Feed and product" subtitle="Daily tonnes across all plants, 90 days" />
          <TrendChart
            data={daily.rows}
            xKey="d"
            height={220}
            type="area"
            series={[
              { key: 'feed', label: 'Feed' },
              { key: 'product', label: 'Product' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '')}
          />
        </Card>
        <Card>
          <CardHeader title="Recovery and yield" subtitle="Daily average, 90 days" />
          <TrendChart
            data={recovery.rows}
            xKey="d"
            height={220}
            series={[
              { key: 'recovery', label: 'Recovery %', color: 'var(--series-3)' },
              { key: 'yield_pct', label: 'Yield %', color: 'var(--series-4)' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '')}
            yFormat={(v) => `${v.toFixed(0)}%`}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Plant performance"
            subtitle="Last 30 days"
            action={
              <Link to="/m/plant-runs" className="text-2xs text-accent hover:underline">
                Plant runs
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Plant</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Feed</th>
                <th className="px-4 py-2 text-right font-medium">Throughput</th>
                <th className="px-4 py-2 text-right font-medium">Design</th>
                <th className="px-4 py-2 text-right font-medium">Capacity used</th>
                <th className="px-4 py-2 text-right font-medium">Availability</th>
                <th className="px-4 py-2 text-right font-medium">Recovery</th>
              </tr>
            </thead>
            <tbody>
              {plants.rows.map((p) => (
                <tr key={p.plant_name} className="border-b border-line/60">
                  <td className="px-4 py-2 font-medium text-ink">{p.plant_name}</td>
                  <td className="px-4 py-2 uppercase text-muted">{p.plant_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right tnum">{tonnes(p.feed)}</td>
                  <td className="px-4 py-2 text-right tnum">{num(p.throughput, 1)} tph</td>
                  <td className="px-4 py-2 text-right tnum text-muted">{num(p.design, 0)} tph</td>
                  <td className="px-4 py-2 text-right">
                    <Badge tone={(p.utilisation ?? 0) >= 85 ? 'ok' : (p.utilisation ?? 0) >= 65 ? 'warn' : 'danger'}>
                      {percent(p.utilisation, 0)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tnum">{percent(p.availability, 0)}</td>
                  <td className="px-4 py-2 text-right tnum">{p.recovery != null ? percent(p.recovery) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Reagent spend" subtitle="Last 90 days" />
          <RankedBars
            data={reagents.rows.map((r) => ({ label: r.reagent, value: r.cost }))}
            format={(v) => moneyCompact(v)}
          />
        </Card>

        <Card>
          <CardHeader
            title="Recent gold pours"
            action={
              <Link to="/m/gold-pours" className="text-2xs text-accent hover:underline">
                All
              </Link>
            }
          />
          <ul className="flex flex-col gap-2">
            {pours.rows.map((p) => (
              <li key={p.pour_number} className="flex items-center justify-between gap-2 border-b border-line/60 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{p.pour_number}</p>
                  <p className="text-2xs text-subtle">
                    {date(p.poured_at)} · {(p.fineness * 100).toFixed(1)}% fine
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-xs font-semibold text-ink">{num(p.oz, 1)} oz</p>
                  <Badge status={p.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Tailings facilities"
            subtitle="Latest freeboard against the trigger"
            icon={<Droplets className="size-4" />}
            action={
              <Link to="/m/tailings-readings" className="text-2xs text-accent hover:underline">
                Monitoring
              </Link>
            }
          />
          <ul className="flex flex-col gap-2.5">
            {tsf.rows.map((f) => (
              <li key={f.code}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink">{f.code}</span>
                  <Badge status={f.alarm ?? 'green'} />
                </div>
                <div className="mt-1 flex items-baseline justify-between text-2xs text-muted">
                  <span>Consequence: {f.consequence?.replace('_', ' ')}</span>
                  <span className="tnum">
                    {num(f.freeboard, 2)} m / min {num(f.min_freeboard, 1)} m
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Energy and downtime" subtitle="Last 30 days across all plants" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Power consumed</p>
            <p className="text-lg font-semibold tnum text-ink">{compact(t?.power)} kWh</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Energy intensity</p>
            <p className="text-lg font-semibold tnum text-ink">
              {t && t.feed > 0 ? (t.power / t.feed).toFixed(1) : '—'} kWh/t
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Downtime</p>
            <p className="text-lg font-semibold tnum text-warn">{num(t?.downtime, 0)} h</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-subtle">Yield</p>
            <p className="text-lg font-semibold tnum text-ink">{percent(t?.yield_pct)}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

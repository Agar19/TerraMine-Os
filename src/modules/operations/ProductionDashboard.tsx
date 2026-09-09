import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Layers, Timer, Truck } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, num, percent, tonnes } from '@/lib/format'
import { Badge, Card, CardHeader, Segmented } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, RankedBars, TrendChart } from '@/components/charts'

const RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
] as const

export default function ProductionDashboard() {
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('90')
  const days = Number(range)

  const totals = useSqlOne<{
    ore: number
    waste: number
    coal: number
    bcm: number
    metal: number
    loads: number
    shifts: number
  }>(
    `select
       coalesce(sum(ore_tonnes), 0)::float8 as ore,
       coalesce(sum(waste_tonnes), 0)::float8 as waste,
       coalesce(sum(coal_tonnes), 0)::float8 as coal,
       coalesce(sum(total_bcm), 0)::float8 as bcm,
       coalesce(sum(contained_metal), 0)::float8 as metal,
       coalesce(sum(truck_loads), 0)::int as loads,
       (select count(*)::int from shifts where shift_date >= current_date - $1::int) as shifts
     from v_production_daily where record_date >= current_date - $1::int`,
    [days],
  )

  const daily = useSql<{ d: string; ore: number; waste: number; coal: number }>(
    `select record_date::text as d,
            coalesce(sum(ore_tonnes), 0)::float8 as ore,
            coalesce(sum(waste_tonnes), 0)::float8 as waste,
            coalesce(sum(coal_tonnes), 0)::float8 as coal
     from v_production_daily where record_date >= current_date - $1::int
     group by record_date order by record_date`,
    [days],
  )

  const byMine = useSql<{ mine_name: string; commodity: string; ore: number; waste: number; grade: number | null }>(
    `select mine_name, commodity,
            coalesce(sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)), 0)::float8 as ore,
            coalesce(sum(waste_tonnes), 0)::float8 as waste,
            round(avg(avg_grade)::numeric, 3)::float8 as grade
     from v_production_daily where record_date >= current_date - $1::int
     group by mine_name, commodity order by ore desc`,
    [days],
  )

  const shiftSplit = useSql<{ shift_type: string; t: number }>(
    `select shift_type, coalesce(sum(tonnes), 0)::float8 as t
     from production_records
     where record_date >= current_date - $1::int and shift_type is not null
     group by shift_type order by t desc`,
    [days],
  )

  const attainment = useSql<{
    mine_name: string
    plan: number
    plan_to_date: number
    actual: number
    attainment: number | null
    period_start: string
  }>(`
    select mine_name,
           (plan_ore_tonnes + plan_coal_tonnes)::float8 as plan,
           plan_to_date_tonnes::float8 as plan_to_date,
           (actual_ore_tonnes + actual_coal_tonnes)::float8 as actual,
           attainment_pct::float8 as attainment,
           period_start::text
    from v_plan_vs_actual
    where horizon = 'monthly' and period_start >= date_trunc('month', current_date) - interval '2 months'
    order by period_start desc, mine_name
  `)

  const blasting = useSqlOne<{ blasts: number; kg: number; pf: number; misfires: number; tonnes: number }>(
    `select count(*)::int as blasts,
            coalesce(sum(total_explosive_kg), 0)::float8 as kg,
            round(avg(powder_factor_kg_t)::numeric, 3)::float8 as pf,
            coalesce(sum(misfires), 0)::int as misfires,
            coalesce(sum(tonnes_blasted), 0)::float8 as tonnes
     from blasts where fired_at >= current_date - $1::int`,
    [days],
  )

  const haulage = useSqlOne<{ cycles: number; avg_cycle: number; avg_payload: number; queue: number }>(
    `select count(*)::int as cycles,
            round(avg(cycle_minutes)::numeric, 1)::float8 as avg_cycle,
            round(avg(payload_tonnes)::numeric, 1)::float8 as avg_payload,
            round(avg(queue_minutes)::numeric, 1)::float8 as queue
     from haulage_cycles where cycle_start >= current_date - $1::int`,
    [days],
  )

  const development = useSql<{ m: string; advance: number }>(
    `select to_char(date_trunc('month', record_date), 'Mon') as m,
            coalesce(sum(advance_m), 0)::float8 as advance
     from development_records
     where record_date >= current_date - $1::int
     group by date_trunc('month', record_date) order by date_trunc('month', record_date)`,
    [days],
  )

  const gas = useSql<{ alarm_level: string; n: number }>(`
    select alarm_level, count(*)::int as n from gas_readings
    where measured_at >= current_date - 30 group by alarm_level
  `)
  const gasAlarms = gas.rows.filter((r) => r.alarm_level !== 'normal').reduce((s, r) => s + r.n, 0)

  const t = totals.row
  const stripRatio = t && t.ore + t.coal > 0 ? t.waste / (t.ore + t.coal) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Production"
        description="Movement, grade and plan attainment across every mine, built from shift-level capture."
        actions={<Segmented value={range} onChange={setRange} options={RANGES} />}
      />

      <StatGrid>
        <StatCard label="Ore mined" value={tonnes(t?.ore)} icon={<Layers className="size-4" />} tone="accent" loading={totals.loading} />
        <StatCard label="Coal mined" value={tonnes(t?.coal)} icon={<Flame className="size-4" />} loading={totals.loading} />
        <StatCard label="Waste moved" value={tonnes(t?.waste)} hint={`${compact(t?.bcm)} bcm`} icon={<Truck className="size-4" />} loading={totals.loading} />
        <StatCard
          label="Strip ratio"
          value={stripRatio != null ? stripRatio.toFixed(2) : '—'}
          unit="w : o"
          loading={totals.loading}
        />
        <StatCard
          label="Shifts recorded"
          value={num(t?.shifts)}
          hint={`${num(t?.loads)} truck loads`}
          icon={<Timer className="size-4" />}
          loading={totals.loading}
        />
      </StatGrid>

      <Card>
        <CardHeader
          title="Daily movement"
          subtitle={`Ore, coal and waste over the last ${days} days`}
          action={
            <Link to="/m/production-records" className="text-2xs text-accent hover:underline">
              Open records
            </Link>
          }
        />
        <TrendChart
          data={daily.rows}
          xKey="d"
          height={260}
          series={[
            { key: 'ore', label: 'Ore' },
            { key: 'coal', label: 'Coal' },
            { key: 'waste', label: 'Waste' },
          ]}
          xFormat={(v) => date(v).replace(/,.*/, '')}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Output by mine" subtitle="Ore and coal, ranked" />
          <RankedBars
            data={byMine.rows.map((m) => ({ label: m.mine_name, value: m.ore, hint: m.commodity }))}
            format={(v) => tonnes(v)}
          />
        </Card>

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader title="Mine detail" subtitle="Average grade and stripping" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Mine</th>
                  <th className="px-4 py-2 text-left font-medium">Commodity</th>
                  <th className="px-4 py-2 text-right font-medium">Ore + coal</th>
                  <th className="px-4 py-2 text-right font-medium">Waste</th>
                  <th className="px-4 py-2 text-right font-medium">Strip</th>
                  <th className="px-4 py-2 text-right font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {byMine.rows.map((m) => (
                  <tr key={m.mine_name} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{m.mine_name}</td>
                    <td className="px-4 py-2 capitalize text-muted">{m.commodity.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-right tnum">{tonnes(m.ore)}</td>
                    <td className="px-4 py-2 text-right tnum text-muted">{tonnes(m.waste)}</td>
                    <td className="px-4 py-2 text-right tnum">{m.ore > 0 ? (m.waste / m.ore).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum">{m.grade != null ? m.grade.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Drill and blast" subtitle={`Last ${days} days`} />
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Blasts fired" value={num(blasting.row?.blasts)} />
            <Metric label="Tonnes blasted" value={tonnes(blasting.row?.tonnes)} />
            <Metric label="Explosives used" value={`${compact(blasting.row?.kg)} kg`} />
            <Metric label="Powder factor" value={`${blasting.row?.pf?.toFixed(3) ?? '—'} kg/t`} />
            <Metric
              label="Misfires"
              value={num(blasting.row?.misfires)}
              tone={(blasting.row?.misfires ?? 0) > 0 ? 'danger' : 'ok'}
            />
          </dl>
          <Link to="/m/blasts" className="mt-3 inline-block text-2xs text-accent hover:underline">
            Blast register →
          </Link>
        </Card>

        <Card>
          <CardHeader title="Haulage" subtitle="Fleet cycle performance" />
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Cycles recorded" value={num(haulage.row?.cycles)} />
            <Metric label="Average cycle" value={`${haulage.row?.avg_cycle ?? '—'} min`} />
            <Metric label="Average payload" value={`${haulage.row?.avg_payload ?? '—'} t`} />
            <Metric
              label="Queue time"
              value={`${haulage.row?.queue ?? '—'} min`}
              tone={(haulage.row?.queue ?? 0) > 5 ? 'warn' : 'ok'}
            />
          </dl>
          <Link to="/m/haulage" className="mt-3 inline-block text-2xs text-accent hover:underline">
            Cycle records →
          </Link>
        </Card>

        <Card>
          <CardHeader title="Underground environment" subtitle="Last 30 days" />
          <dl className="grid grid-cols-2 gap-3">
            <Metric
              label="Gas alarms"
              value={num(gasAlarms)}
              tone={gasAlarms > 40 ? 'danger' : gasAlarms > 10 ? 'warn' : 'ok'}
            />
            <Metric label="Readings taken" value={num(gas.rows.reduce((s, r) => s + r.n, 0))} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {gas.rows.map((r) => (
              <Badge key={r.alarm_level} status={r.alarm_level}>
                {r.alarm_level} · {r.n}
              </Badge>
            ))}
          </div>
          <Link to="/m/gas-readings" className="mt-3 inline-block text-2xs text-accent hover:underline">
            Gas monitoring →
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader title="Plan versus actual" subtitle="Monthly plans, last three months" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Period</th>
                  <th className="px-4 py-2 text-left font-medium">Mine</th>
                  <th className="px-4 py-2 text-right font-medium">Full plan</th>
                  <th className="px-4 py-2 text-right font-medium">Plan to date</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Attainment</th>
                </tr>
              </thead>
              <tbody>
                {attainment.rows.map((r) => (
                  <tr key={`${r.period_start}-${r.mine_name}`} className="border-b border-line/60">
                    <td className="px-4 py-2 tnum text-muted">{r.period_start.slice(0, 7)}</td>
                    <td className="px-4 py-2 font-medium text-ink">{r.mine_name}</td>
                    <td className="px-4 py-2 text-right tnum text-muted">{tonnes(r.plan)}</td>
                    <td className="px-4 py-2 text-right tnum">{tonnes(r.plan_to_date)}</td>
                    <td className="px-4 py-2 text-right tnum">{tonnes(r.actual)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge
                        tone={
                          (r.attainment ?? 0) >= 95 ? 'ok' : (r.attainment ?? 0) >= 80 ? 'warn' : 'danger'
                        }
                      >
                        {percent(r.attainment, 0)}
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
            <CardHeader title="Development advance" subtitle="Underground metres by month" />
            <BarChart
              data={development.rows}
              xKey="m"
              height={160}
              series={[{ key: 'advance', label: 'Metres advanced' }]}
              yFormat={(v) => num(v)}
            />
          </Card>
          <Card>
            <CardHeader title="Day versus night" subtitle="Tonnes by shift type" />
            <RankedBars
              data={shiftSplit.rows.map((s) => ({ label: s.shift_type, value: s.t }))}
              format={(v) => tonnes(v)}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-subtle">{label}</dt>
      <dd
        className={
          tone === 'danger'
            ? 'text-danger text-base font-semibold tnum'
            : tone === 'warn'
              ? 'text-warn text-base font-semibold tnum'
              : tone === 'ok'
                ? 'text-ok text-base font-semibold tnum'
                : 'text-ink text-base font-semibold tnum'
        }
      >
        {value}
      </dd>
    </div>
  )
}

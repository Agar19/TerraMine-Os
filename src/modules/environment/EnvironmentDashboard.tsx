import { Link } from 'react-router-dom'
import { Droplets, Leaf, Recycle, Zap } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { compact, date, num, percent } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars, TrendChart } from '@/components/charts'

export default function EnvironmentDashboard() {
  const totals = useSqlOne<{
    results: number
    breaches: number
    compliance: number | null
    water_recycled: number | null
    co2e: number
    waste: number
    rehab_ha: number
    disturbed_ha: number
    open_grievances: number
  }>(`
    select
      (select count(*)::int from environmental_monitoring where measured_at >= current_date - 90) as results,
      (select count(*)::int from environmental_monitoring where measured_at >= current_date - 90 and compliant = false) as breaches,
      (select round(100.0 * count(*) filter (where compliant) / nullif(count(*) filter (where compliant is not null), 0), 2)::float8
         from environmental_monitoring where measured_at >= current_date - 90) as compliance,
      (select round(100.0 * sum(recycled_m3) / nullif(sum(recycled_m3 + abstraction_m3), 0), 1)::float8
         from water_balance where record_date >= current_date - 90) as water_recycled,
      (select coalesce(sum(co2e_tonnes), 0)::float8 from energy_records where record_date >= current_date - 90) as co2e,
      (select coalesce(sum(quantity), 0)::float8 from waste_records where record_date >= current_date - 90) as waste,
      (select coalesce(sum(rehabilitated_hectares), 0)::float8 from rehabilitation_areas) as rehab_ha,
      (select coalesce(sum(disturbed_hectares), 0)::float8 from rehabilitation_areas) as disturbed_ha,
      (select count(*)::int from community_engagements where engagement_type = 'grievance' and status not in ('resolved','closed')) as open_grievances
  `)

  const complianceTrend = useSql<{ m: string; compliant: number; breaches: number }>(`
    select to_char(date_trunc('month', measured_at), 'Mon') as m,
           count(*) filter (where compliant)::int as compliant,
           count(*) filter (where compliant = false)::int as breaches
    from environmental_monitoring
    where measured_at >= current_date - 365
    group by date_trunc('month', measured_at) order by date_trunc('month', measured_at)
  `)

  const byMedium = useSql<{ medium: string; total: number; breaches: number }>(`
    select medium, count(*)::int as total, count(*) filter (where compliant = false)::int as breaches
    from environmental_monitoring where measured_at >= current_date - 90
    group by medium order by breaches desc, total desc
  `)

  const water = useSql<{ d: string; abstraction: number; recycled: number; discharged: number }>(`
    select record_date::text as d,
           coalesce(sum(abstraction_m3), 0)::float8 as abstraction,
           coalesce(sum(recycled_m3), 0)::float8 as recycled,
           coalesce(sum(discharged_m3), 0)::float8 as discharged
    from water_balance where record_date >= current_date - 90
    group by record_date order by record_date
  `)

  const energy = useSql<{ source: string; kwh: number; co2e: number }>(`
    select source, coalesce(sum(consumption_kwh), 0)::float8 as kwh, coalesce(sum(co2e_tonnes), 0)::float8 as co2e
    from energy_records where record_date >= current_date - 90 group by source order by kwh desc
  `)

  const waste = useSql<{ waste_stream: string; qty: number }>(`
    select waste_stream, coalesce(sum(quantity), 0)::float8 as qty
    from waste_records where record_date >= current_date - 180
    group by waste_stream order by qty desc
  `)

  const rehab = useSql<{ code: string; name: string; disturbed: number; done: number; status: string; cover: number | null }>(`
    select code, name, disturbed_hectares::float8 as disturbed, rehabilitated_hectares::float8 as done,
           status, vegetation_cover_pct::float8 as cover
    from rehabilitation_areas order by disturbed_hectares desc limit 10
  `)

  const breaches = useSql<{
    measured_at: string
    station_code: string
    parameter: string
    value: number
    limit_value: number | null
    unit: string | null
    medium: string
  }>(`
    select measured_at::text, station_code, parameter, value::float8, limit_value::float8, unit, medium
    from environmental_monitoring
    where compliant = false and measured_at >= current_date - 90
    order by measured_at desc limit 12
  `)

  const community = useSql<{ engagement_type: string; n: number }>(`
    select engagement_type, count(*)::int as n from community_engagements
    where occurred_on >= current_date - 365 group by engagement_type order by n desc
  `)

  const t = totals.row
  const rehabPct = t && t.disturbed_ha > 0 ? (t.rehab_ha / t.disturbed_ha) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Environment and community"
        description="Licence compliance, water and energy balance, waste, rehabilitation progress and community standing."
      />

      <StatGrid>
        <StatCard
          label="Monitoring compliance"
          value={percent(t?.compliance)}
          hint={`${num(t?.breaches)} exceedances in ${num(t?.results)} results`}
          tone={(t?.compliance ?? 0) >= 95 ? 'ok' : 'warn'}
          loading={totals.loading}
          to="/m/environmental-monitoring"
        />
        <StatCard
          label="Water recycled"
          value={percent(t?.water_recycled)}
          icon={<Droplets className="size-4" />}
          tone={(t?.water_recycled ?? 0) >= 60 ? 'ok' : 'warn'}
          loading={totals.loading}
          to="/m/water-balance"
        />
        <StatCard
          label="Emissions, 90 days"
          value={compact(t?.co2e)}
          unit="tCO2e"
          icon={<Zap className="size-4" />}
          deltaDirection="lower_better"
          loading={totals.loading}
          to="/m/energy"
        />
        <StatCard
          label="Waste generated, 90 days"
          value={`${compact(t?.waste)} t`}
          icon={<Recycle className="size-4" />}
          loading={totals.loading}
          to="/m/waste"
        />
        <StatCard
          label="Rehabilitation complete"
          value={percent(rehabPct)}
          hint={`${num(t?.rehab_ha, 1)} of ${num(t?.disturbed_ha, 1)} ha`}
          icon={<Leaf className="size-4" />}
          tone="ok"
          loading={totals.loading}
          to="/m/rehabilitation"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Water balance" subtitle="Abstraction, recycling and discharge, last 90 days" />
          <TrendChart
            data={water.rows}
            xKey="d"
            height={230}
            type="area"
            series={[
              { key: 'recycled', label: 'Recycled', color: 'var(--series-3)' },
              { key: 'abstraction', label: 'Abstracted', color: 'var(--series-1)' },
              { key: 'discharged', label: 'Discharged', color: 'var(--series-4)' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '')}
            yFormat={(v) => `${compact(v)} m³`}
          />
        </Card>
        <Card>
          <CardHeader title="Energy by source" subtitle="kWh, last 90 days" />
          <Donut
            data={energy.rows.map((e) => ({
              label: e.source.replace(/_/g, ' '),
              value: e.kwh,
              color: e.source === 'solar' ? 'var(--ok)' : e.source === 'diesel_generator' ? 'var(--series-2)' : undefined,
            }))}
            centerLabel="kWh"
            format={(v) => compact(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Results by medium" subtitle="Last 90 days, exceedances highlighted" />
          <RankedBars
            data={byMedium.rows.map((m) => ({
              label: m.medium.replace(/_/g, ' '),
              value: m.total,
              hint: `${m.breaches} exceedances`,
              color: m.breaches > 0 ? 'var(--warn)' : 'var(--series-1)',
            }))}
            format={(v) => num(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Compliance by month" subtitle="Results within and outside licence limits" />
          <TrendChart
            data={complianceTrend.rows}
            xKey="m"
            height={190}
            series={[
              { key: 'compliant', label: 'Within limit', color: 'var(--series-3)' },
              { key: 'breaches', label: 'Exceedance', color: 'var(--series-8)' },
            ]}
            yFormat={(v) => num(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Waste streams" subtitle="Tonnes, last 6 months" />
          <RankedBars
            data={waste.rows.map((w) => ({ label: w.waste_stream.replace(/_/g, ' '), value: w.qty }))}
            format={(v) => `${num(v, 1)} t`}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Recent exceedances"
              subtitle="Results outside licence limits, last 90 days"
              action={
                <Link to="/m/environmental-monitoring" className="text-2xs text-accent hover:underline">
                  All results
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Station</th>
                  <th className="px-4 py-2 text-left font-medium">Parameter</th>
                  <th className="px-4 py-2 text-right font-medium">Result</th>
                  <th className="px-4 py-2 text-right font-medium">Limit</th>
                </tr>
              </thead>
              <tbody>
                {breaches.rows.map((b, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="px-4 py-2 tnum text-muted">{date(b.measured_at)}</td>
                    <td className="px-4 py-2 font-medium text-ink">{b.station_code}</td>
                    <td className="px-4 py-2">
                      {b.parameter}
                      <span className="ml-1.5 text-2xs text-subtle">{b.medium.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-2 text-right tnum text-danger">
                      {num(b.value, 3)} {b.unit}
                    </td>
                    <td className="px-4 py-2 text-right tnum text-muted">{num(b.limit_value, 3)}</td>
                  </tr>
                ))}
                {breaches.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-subtle">
                      No exceedances in the last 90 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <div className="p-4 pb-0">
              <CardHeader title="Rehabilitation areas" subtitle="Progress against disturbed ground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="border-b border-line text-2xs text-subtle">
                    <th className="px-4 py-2 text-left font-medium">Area</th>
                    <th className="px-4 py-2 text-right font-medium">Disturbed</th>
                    <th className="px-4 py-2 text-right font-medium">Rehabilitated</th>
                    <th className="px-4 py-2 text-right font-medium">Cover</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rehab.rows.map((r) => (
                    <tr key={r.code} className="border-b border-line/60">
                      <td className="px-4 py-2 font-medium text-ink">{r.code}</td>
                      <td className="px-4 py-2 text-right tnum">{num(r.disturbed, 1)} ha</td>
                      <td className="px-4 py-2 text-right tnum">{num(r.done, 1)} ha</td>
                      <td className="px-4 py-2 text-right tnum">{percent(r.cover, 0)}</td>
                      <td className="px-4 py-2">
                        <Badge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Community engagement"
              subtitle={`Last 12 months · ${num(t?.open_grievances)} grievances open`}
              action={
                <Link to="/m/community" className="text-2xs text-accent hover:underline">
                  Register
                </Link>
              }
            />
            <RankedBars
              data={community.rows.map((c) => ({
                label: c.engagement_type.replace(/_/g, ' '),
                value: c.n,
                color: c.engagement_type === 'grievance' ? 'var(--warn)' : undefined,
              }))}
              format={(v) => num(v)}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

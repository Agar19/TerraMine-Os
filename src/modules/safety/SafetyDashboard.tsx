import { Link } from 'react-router-dom'
import { ClipboardCheck, HardHat, Radar, ShieldAlert, Siren } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { date, num, relative } from '@/lib/format'
import { riskTone } from '@/lib/status'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Donut, RankedBars, TrendChart } from '@/components/charts'

export default function SafetyDashboard() {
  const rates = useSql<{ m: string; trifr: number | null; ltifr: number | null; hours: number }>(`
    select to_char(month, 'Mon YY') as m,
           round(avg(trifr)::numeric, 2)::float8 as trifr,
           round(avg(ltifr)::numeric, 2)::float8 as ltifr,
           coalesce(sum(hours_worked), 0)::float8 as hours
    from v_safety_rates
    where month >= date_trunc('month', current_date) - interval '11 months'
    group by month order by month
  `)

  const totals = useSqlOne<{
    recordables: number
    ltis: number
    near_misses: number
    hipos: number
    days_lost: number
    open_incidents: number
    overdue_actions: number
    open_actions: number
    permits_active: number
    observations_30d: number
  }>(`
    select
      (select coalesce(sum(recordables), 0)::int from v_safety_monthly where month >= date_trunc('month', current_date) - interval '11 months') as recordables,
      (select coalesce(sum(lost_time_injuries), 0)::int from v_safety_monthly where month >= date_trunc('month', current_date) - interval '11 months') as ltis,
      (select coalesce(sum(near_misses), 0)::int from v_safety_monthly where month >= date_trunc('month', current_date) - interval '11 months') as near_misses,
      (select coalesce(sum(high_potentials), 0)::int from v_safety_monthly where month >= date_trunc('month', current_date) - interval '11 months') as hipos,
      (select coalesce(sum(days_lost), 0)::int from incidents where occurred_at >= current_date - 365) as days_lost,
      (select count(*)::int from incidents where status <> 'closed') as open_incidents,
      (select count(*)::int from v_open_actions where urgency = 'overdue') as overdue_actions,
      (select count(*)::int from corrective_actions where status in ('open','in_progress','overdue')) as open_actions,
      (select count(*)::int from permits_to_work where status = 'active') as permits_active,
      (select count(*)::int from safety_observations where observed_at >= current_date - 30) as observations_30d
  `)

  const byType = useSql<{ incident_type: string; n: number }>(`
    select incident_type, count(*)::int as n from incidents
    where occurred_at >= current_date - 365 group by incident_type order by n desc
  `)

  const monthly = useSql<{ m: string; near_misses: number; recordables: number; hipos: number; environmental: number }>(`
    select to_char(month, 'Mon') as m,
           sum(near_misses)::int as near_misses,
           sum(recordables)::int as recordables,
           sum(high_potentials)::int as hipos,
           sum(environmental)::int as environmental
    from v_safety_monthly
    where month >= date_trunc('month', current_date) - interval '11 months'
    group by month order by month
  `)

  const topHazards = useSql<{ hazard_code: string; title: string; residual_risk: number; risk_rating: string; category: string }>(`
    select hazard_code, title, residual_risk, risk_rating, category
    from hazards where status <> 'closed' order by residual_risk desc limit 10
  `)

  const recent = useSql<{
    incident_no: string
    occurred_at: string
    incident_type: string
    title: string
    potential_severity: string
    status: string
  }>(`
    select incident_no, occurred_at::text, incident_type, title, potential_severity, status
    from incidents order by occurred_at desc limit 10
  `)

  const actions = useSql<{ urgency: string; n: number }>(`
    select urgency, count(*)::int as n from v_open_actions
    where status not in ('completed','verified','cancelled') group by urgency order by n desc
  `)

  const causes = useSql<{ cause: string; n: number }>(`
    select coalesce(immediate_cause, 'Not recorded') as cause, count(*)::int as n
    from incidents where occurred_at >= current_date - 365
    group by 1 order by n desc limit 8
  `)

  const t = totals.row
  const latestRate = rates.rows[rates.rows.length - 1]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Health and safety"
        description="Frequency rates, the incident pipeline, hazard exposure and the action backlog. Rates use hours worked from the attendance record."
      />

      <StatGrid>
        <StatCard
          label="TRIFR"
          value={num(latestRate?.trifr, 2)}
          unit="per 1M hrs"
          hint="Target 3.50"
          tone={(latestRate?.trifr ?? 0) <= 3.5 ? 'ok' : 'danger'}
          deltaDirection="lower_better"
          icon={<ShieldAlert className="size-4" />}
          loading={rates.loading}
          spark={rates.rows.map((r) => r.trifr ?? 0)}
        />
        <StatCard
          label="LTIFR"
          value={num(latestRate?.ltifr, 2)}
          unit="per 1M hrs"
          hint="Target 0.80"
          tone={(latestRate?.ltifr ?? 0) <= 0.8 ? 'ok' : 'warn'}
          loading={rates.loading}
          spark={rates.rows.map((r) => r.ltifr ?? 0)}
        />
        <StatCard
          label="Recordables, 12 months"
          value={num(t?.recordables)}
          hint={`${num(t?.ltis)} lost time, ${num(t?.days_lost)} days lost`}
          icon={<Siren className="size-4" />}
          loading={totals.loading}
          to="/m/incidents"
        />
        <StatCard
          label="High potential events"
          value={num(t?.hipos)}
          hint={`${num(t?.near_misses)} near misses reported`}
          tone="warn"
          loading={totals.loading}
        />
        <StatCard
          label="Overdue actions"
          value={num(t?.overdue_actions)}
          hint={`${num(t?.open_actions)} open in total`}
          tone={(t?.overdue_actions ?? 0) > 20 ? 'danger' : 'warn'}
          icon={<ClipboardCheck className="size-4" />}
          loading={totals.loading}
          to="/m/actions"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Frequency rates"
            subtitle="Monthly TRIFR and LTIFR per million hours worked"
          />
          <TrendChart
            data={rates.rows}
            xKey="m"
            height={230}
            series={[
              { key: 'trifr', label: 'TRIFR', color: 'var(--series-2)' },
              { key: 'ltifr', label: 'LTIFR', color: 'var(--series-1)' },
            ]}
            referenceValue={3.5}
            referenceLabel="TRIFR target"
            yFormat={(v) => v.toFixed(1)}
          />
        </Card>
        <Card>
          <CardHeader title="Incidents by type" subtitle="Last 12 months" />
          <Donut
            data={byType.rows.slice(0, 7).map((b) => ({
              label: b.incident_type.replace(/_/g, ' '),
              value: b.n,
            }))}
            centerLabel="incidents"
            format={(v) => num(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reporting culture" subtitle="Near misses against recordable events by month" />
          <BarChart
            data={monthly.rows}
            xKey="m"
            height={210}
            series={[
              { key: 'near_misses', label: 'Near misses', color: 'var(--series-3)' },
              { key: 'recordables', label: 'Recordables', color: 'var(--series-2)' },
              { key: 'hipos', label: 'High potentials', color: 'var(--series-8)' },
              { key: 'environmental', label: 'Environmental', color: 'var(--series-4)' },
            ]}
            yFormat={(v) => num(v)}
          />
          <p className="mt-2 text-2xs text-subtle">
            A healthy operation reports many near misses for every recordable injury. A falling near-miss
            count is usually a reporting problem, not a safety improvement.
          </p>
        </Card>

        <Card>
          <CardHeader title="Immediate causes" subtitle="Last 12 months" icon={<Radar className="size-4" />} />
          <RankedBars data={causes.rows.map((c) => ({ label: c.cause, value: c.n }))} format={(v) => num(v)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Recent incidents"
              action={
                <Link to="/m/incidents" className="text-2xs text-accent hover:underline">
                  All incidents
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                  <th className="px-4 py-2 text-left font-medium">Occurred</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Potential</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.rows.map((r) => (
                  <tr key={r.incident_no} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{r.incident_no}</td>
                    <td className="px-4 py-2 tnum text-muted">{date(r.occurred_at)}</td>
                    <td className="px-4 py-2 capitalize text-muted">{r.incident_type.replace(/_/g, ' ')}</td>
                    <td className="max-w-xs truncate px-4 py-2">{r.title}</td>
                    <td className="px-4 py-2">
                      <Badge
                        tone={
                          r.potential_severity === 'catastrophic' || r.potential_severity === 'major'
                            ? 'danger'
                            : r.potential_severity === 'serious'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {r.potential_severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Action backlog" subtitle="Open corrective and preventive actions" />
            <RankedBars
              data={actions.rows.map((a) => ({
                label: a.urgency.replace(/_/g, ' '),
                value: a.n,
                color:
                  a.urgency === 'overdue'
                    ? 'var(--danger)'
                    : a.urgency === 'due_this_week'
                      ? 'var(--warn)'
                      : 'var(--series-1)',
              }))}
              format={(v) => num(v)}
            />
          </Card>

          <Card>
            <CardHeader title="Live controls" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Permits active</p>
                <p className="text-xl font-semibold tnum text-ink">{num(t?.permits_active)}</p>
                <Link to="/m/permits" className="text-2xs text-accent hover:underline">
                  Permits →
                </Link>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Observations, 30 d</p>
                <p className="text-xl font-semibold tnum text-ink">{num(t?.observations_30d)}</p>
                <Link to="/m/observations" className="text-2xs text-accent hover:underline">
                  Observations →
                </Link>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Open investigations</p>
                <p className="text-xl font-semibold tnum text-warn">{num(t?.open_incidents)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Hours worked, latest</p>
                <p className="text-xl font-semibold tnum text-ink">{num(latestRate?.hours, 0)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card padded={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Principal hazards"
            subtitle="Ranked by residual risk after controls"
            icon={<HardHat className="size-4" />}
            action={
              <Link to="/m/hazards" className="text-2xs text-accent hover:underline">
                Hazard register
              </Link>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Hazard</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Residual risk</th>
                <th className="px-4 py-2 text-left font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {topHazards.rows.map((h) => (
                <tr key={h.hazard_code} className="border-b border-line/60">
                  <td className="px-4 py-2 font-medium text-ink">{h.hazard_code}</td>
                  <td className="px-4 py-2">{h.title}</td>
                  <td className="px-4 py-2 capitalize text-muted">{h.category.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right tnum">{h.residual_risk}</td>
                  <td className="px-4 py-2">
                    <Badge tone={riskTone(h.residual_risk)}>{h.risk_rating}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-2xs text-subtle">
          Risk is scored on a five by five matrix. Anything at fifteen or above needs an accountable owner
          and a dated control plan. Last reviewed {relative(new Date())}.
        </p>
      </Card>
    </div>
  )
}

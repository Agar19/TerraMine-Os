import { Link } from 'react-router-dom'
import { Award, GraduationCap, HardHat, Stethoscope, Users } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { date, moneyCompact, num, percent, relative } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Donut, RankedBars } from '@/components/charts'

export default function WorkforceDashboard() {
  const totals = useSqlOne<{
    headcount: number
    contractors: number
    underground: number
    absent_rate: number | null
    expired: number
    expiring: number
    medicals_due: number
    open_er: number
    payroll_net: number | null
  }>(`
    select
      (select count(*)::int from employees where status = 'active') as headcount,
      (select count(*)::int from employees where status = 'active' and contractor_id is not null) as contractors,
      (select count(*)::int from v_personnel_underground) as underground,
      (select round(100.0 * count(*) filter (where status in ('absent','sick')) / nullif(count(*), 0), 2)::float8
         from attendance where work_date >= current_date - 30) as absent_rate,
      (select count(*)::int from v_competency_expiry where expiry_status = 'expired') as expired,
      (select count(*)::int from v_competency_expiry where expiry_status = 'expiring_30d') as expiring,
      (select count(*)::int from medical_examinations where next_due_on between current_date - 30 and current_date + 30) as medicals_due,
      (select count(*)::int from employee_relations_cases where status <> 'closed') as open_er,
      (select net_total::float8 from payroll_periods where status = 'paid' order by period_end desc limit 1) as payroll_net
  `)

  const byGroup = useSql<{ occupation_group: string; n: number }>(`
    select occupation_group, count(*)::int as n from employees
    where status = 'active' and occupation_group is not null
    group by occupation_group order by n desc
  `)

  const bySite = useSql<{ site_name: string; headcount: number; target: number | null; contractors: number }>(`
    select s.name as site_name,
           count(e.id) filter (where e.status = 'active')::int as headcount,
           s.workforce_target as target,
           count(e.id) filter (where e.status = 'active' and e.contractor_id is not null)::int as contractors
    from sites s left join employees e on e.site_id = s.id
    group by s.id, s.name, s.workforce_target order by headcount desc
  `)

  const attendance = useSql<{ d: string; present: number; absent: number; leave: number }>(`
    select work_date::text as d,
           count(*) filter (where status in ('present','late'))::int as present,
           count(*) filter (where status in ('absent','sick'))::int as absent,
           count(*) filter (where status in ('leave','training'))::int as leave
    from attendance where work_date >= current_date - 30
    group by work_date order by work_date
  `)

  const expiring = useSql<{
    employee_name: string
    competency_name: string
    expires_on: string | null
    expiry_status: string
    is_mandatory: boolean
  }>(`
    select employee_name, competency_name, expires_on::text, expiry_status, is_mandatory
    from v_competency_expiry
    where expiry_status in ('expired','expiring_30d')
    order by expires_on nulls last limit 14
  `)

  const training = useSql<{ m: string; completed: number; scheduled: number }>(`
    select to_char(date_trunc('month', coalesce(completed_on, scheduled_on)), 'Mon') as m,
           count(*) filter (where result = 'pass')::int as completed,
           count(*) filter (where result = 'scheduled')::int as scheduled
    from training_records
    where coalesce(completed_on, scheduled_on) >= current_date - 365
    group by date_trunc('month', coalesce(completed_on, scheduled_on))
    order by date_trunc('month', coalesce(completed_on, scheduled_on))
  `)

  const underground = useSql<{ person: string; mine_name: string; location: string; hours: number; entered_at: string }>(`
    select person, coalesce(mine_name, '—') as mine_name, coalesce(location, '—') as location,
           hours_underground::float8 as hours, entered_at::text
    from v_personnel_underground order by entered_at limit 12
  `)

  const t = totals.row
  const competencyCompliance =
    t && t.headcount > 0 ? Math.max(0, 100 - ((t.expired ?? 0) / (t.headcount * 5)) * 100) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Workforce"
        description="Headcount, attendance, statutory competency and the people currently underground."
      />

      <StatGrid>
        <StatCard
          label="Active headcount"
          value={num(t?.headcount)}
          hint={`${num(t?.contractors)} contractor personnel`}
          icon={<Users className="size-4" />}
          loading={totals.loading}
          to="/m/employees"
        />
        <StatCard
          label="Underground now"
          value={num(t?.underground)}
          hint="Statutory tag board"
          tone="info"
          icon={<HardHat className="size-4" />}
          loading={totals.loading}
          to="/m/tag-board"
        />
        <StatCard
          label="Absenteeism, 30 days"
          value={percent(t?.absent_rate)}
          tone={(t?.absent_rate ?? 0) <= 5 ? 'ok' : 'warn'}
          deltaDirection="lower_better"
          loading={totals.loading}
          to="/m/attendance"
        />
        <StatCard
          label="Expired competencies"
          value={num(t?.expired)}
          hint={`${num(t?.expiring)} expire within 30 days`}
          tone={(t?.expired ?? 0) > 0 ? 'danger' : 'ok'}
          icon={<Award className="size-4" />}
          loading={totals.loading}
          to="/m/employee-competencies"
        />
        <StatCard
          label="Last payroll, net"
          value={moneyCompact(t?.payroll_net)}
          hint={`${num(t?.open_er)} open ER cases`}
          loading={totals.loading}
          to="/m/payroll-periods"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Attendance" subtitle="Daily attendance status over the last 30 days" />
          <BarChart
            data={attendance.rows}
            xKey="d"
            height={220}
            stacked
            series={[
              { key: 'present', label: 'Present', color: 'var(--series-3)' },
              { key: 'leave', label: 'Leave or training', color: 'var(--series-4)' },
              { key: 'absent', label: 'Absent or sick', color: 'var(--series-8)' },
            ]}
            xFormat={(v) => date(v).replace(/,.*/, '').replace(/^\w+ /, '')}
            yFormat={(v) => num(v)}
          />
        </Card>
        <Card>
          <CardHeader title="Occupation mix" subtitle="Active employees" />
          <Donut
            data={byGroup.rows.map((g) => ({ label: g.occupation_group.replace(/_/g, ' '), value: g.n }))}
            centerLabel="employees"
            format={(v) => num(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader title="Headcount by site" subtitle="Actual against establishment" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Site</th>
                  <th className="px-4 py-2 text-right font-medium">Headcount</th>
                  <th className="px-4 py-2 text-right font-medium">Target</th>
                  <th className="px-4 py-2 text-right font-medium">Contractors</th>
                  <th className="px-4 py-2 text-right font-medium">Fill rate</th>
                </tr>
              </thead>
              <tbody>
                {bySite.rows.map((s) => {
                  const fill = s.target ? (s.headcount / s.target) * 100 : null
                  return (
                    <tr key={s.site_name} className="border-b border-line/60">
                      <td className="px-4 py-2 font-medium text-ink">{s.site_name}</td>
                      <td className="px-4 py-2 text-right tnum">{num(s.headcount)}</td>
                      <td className="px-4 py-2 text-right tnum text-muted">{num(s.target)}</td>
                      <td className="px-4 py-2 text-right tnum">{num(s.contractors)}</td>
                      <td className="px-4 py-2 text-right">
                        <Badge tone={fill == null ? 'neutral' : fill >= 90 ? 'ok' : fill >= 70 ? 'warn' : 'danger'}>
                          {percent(fill, 0)}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Training delivery"
            subtitle="Courses completed by month"
            icon={<GraduationCap className="size-4" />}
          />
          <BarChart
            data={training.rows}
            xKey="m"
            height={200}
            series={[
              { key: 'completed', label: 'Completed', color: 'var(--series-3)' },
              { key: 'scheduled', label: 'Scheduled', color: 'var(--series-1)' },
            ]}
            yFormat={(v) => num(v)}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Competency exposure"
              subtitle="Expired or expiring within 30 days"
              action={
                <Link to="/m/employee-competencies" className="text-2xs text-accent hover:underline">
                  All records
                </Link>
              }
            />
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Employee</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Competency</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Expires</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {expiring.rows.map((e, i) => (
                  <tr key={`${e.employee_name}-${e.competency_name}-${i}`} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{e.employee_name}</td>
                    <td className="px-4 py-2">
                      {e.competency_name}
                      {e.is_mandatory && <Badge tone="warn" className="ml-2">Mandatory</Badge>}
                    </td>
                    <td className="px-4 py-2 tnum text-muted">{e.expires_on ? date(e.expires_on) : '—'}</td>
                    <td className="px-4 py-2">
                      <Badge status={e.expiry_status} />
                    </td>
                  </tr>
                ))}
                {expiring.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-subtle">
                      Every competency is current.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Currently underground"
              subtitle="Longest time on the tag board first"
              icon={<HardHat className="size-4" />}
            />
            <ul className="flex flex-col gap-2">
              {underground.rows.map((p, i) => (
                <li key={`${p.person}-${i}`} className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{p.person}</p>
                    <p className="truncate text-2xs text-subtle">
                      {p.mine_name} · {p.location}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-xs font-semibold text-ink">{num(p.hours, 1)} h</p>
                    <p className="text-2xs text-subtle">{relative(p.entered_at)}</p>
                  </div>
                </li>
              ))}
              {underground.rows.length === 0 && (
                <li className="py-6 text-center text-xs text-subtle">Nobody is underground.</li>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Health surveillance" icon={<Stethoscope className="size-4" />} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Medicals due</p>
                <p className="text-xl font-semibold tnum text-warn">{num(t?.medicals_due)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-subtle">Competency compliance</p>
                <p className="text-xl font-semibold tnum text-ink">{percent(competencyCompliance, 1)}</p>
              </div>
            </div>
            <RankedBars
              className="mt-4"
              data={byGroup.rows.slice(0, 5).map((g) => ({
                label: g.occupation_group.replace(/_/g, ' '),
                value: g.n,
              }))}
              format={(v) => num(v)}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

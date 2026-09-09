import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, ClipboardCheck, Map } from 'lucide-react'
import { useSql, useSqlOne } from '@/db/hooks'
import { date, daysBetween, moneyCompact, num, percent, relative } from '@/lib/format'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Donut, RankedBars } from '@/components/charts'

export default function ComplianceDashboard() {
  const totals = useSqlOne<{
    due_30: number
    overdue: number
    tenements: number
    expiring_tenements: number
    open_findings: number
    overdue_findings: number
    docs_due: number
    audits_planned: number
  }>(`
    select
      (select count(*)::int from v_compliance_calendar where due_on between current_date and current_date + 30) as due_30,
      (select count(*)::int from v_compliance_calendar where due_on < current_date) as overdue,
      (select count(*)::int from tenements where status = 'granted') as tenements,
      (select count(*)::int from tenements where status = 'granted' and expires_on <= current_date + 365) as expiring_tenements,
      (select count(*)::int from audit_findings where status <> 'closed') as open_findings,
      (select count(*)::int from audit_findings where status <> 'closed' and due_on < current_date) as overdue_findings,
      (select count(*)::int from documents where status = 'approved' and review_due_on <= current_date + 60) as docs_due,
      (select count(*)::int from audits where status in ('planned','in_progress')) as audits_planned
  `)

  const calendar = useSql<{
    source: string
    ref: string
    title: string
    due_on: string
    risk: string | null
    status: string
  }>(`
    select source, ref, title, due_on::text, risk, status
    from v_compliance_calendar
    where due_on between current_date - 60 and current_date + 120
    order by due_on limit 25
  `)

  const bySource = useSql<{ source: string; n: number }>(`
    select source, count(*)::int as n from v_compliance_calendar
    where due_on between current_date - 60 and current_date + 180
    group by source order by n desc
  `)

  const obligationRisk = useSql<{ penalty_risk: string; n: number }>(`
    select coalesce(penalty_risk, 'unknown') as penalty_risk, count(*)::int as n
    from regulatory_obligations where status in ('open','in_progress')
    group by penalty_risk order by n desc
  `)

  const tenements = useSql<{
    tenement_no: string
    name: string | null
    tenement_type: string
    expires_on: string | null
    area_km2: number | null
    commitment: number | null
    spent: number | null
    status: string
  }>(`
    select tenement_no, name, tenement_type, expires_on::text, area_km2::float8,
           expenditure_commitment::float8 as commitment, expenditure_to_date::float8 as spent, status
    from tenements order by expires_on nulls last limit 12
  `)

  const audits = useSql<{
    audit_no: string
    title: string
    audit_type: string
    performed_on: string | null
    score_pct: number | null
    major_findings: number
    result: string | null
    status: string
  }>(`
    select audit_no, title, audit_type, performed_on::text, score_pct::float8,
           coalesce(major_findings, 0) as major_findings, result, status
    from audits order by coalesce(performed_on, planned_on) desc limit 10
  `)

  const findings = useSql<{ severity: string; n: number }>(`
    select severity, count(*)::int as n from audit_findings where status <> 'closed'
    group by severity order by n desc
  `)

  const t = totals.row

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Compliance and governance"
        description="One calendar for every dated obligation: regulatory returns, licence expiries, document reviews and audits."
      />

      <StatGrid>
        <StatCard
          label="Due in 30 days"
          value={num(t?.due_30)}
          icon={<CalendarClock className="size-4" />}
          tone="info"
          loading={totals.loading}
        />
        <StatCard
          label="Overdue"
          value={num(t?.overdue)}
          tone={(t?.overdue ?? 0) > 0 ? 'danger' : 'ok'}
          loading={totals.loading}
          to="/m/obligations"
        />
        <StatCard
          label="Granted tenements"
          value={num(t?.tenements)}
          hint={`${num(t?.expiring_tenements)} expire within a year`}
          icon={<Map className="size-4" />}
          loading={totals.loading}
          to="/m/tenements"
        />
        <StatCard
          label="Open audit findings"
          value={num(t?.open_findings)}
          hint={`${num(t?.overdue_findings)} past their due date`}
          tone={(t?.overdue_findings ?? 0) > 0 ? 'warn' : 'ok'}
          icon={<ClipboardCheck className="size-4" />}
          loading={totals.loading}
          to="/m/audit-findings"
        />
        <StatCard
          label="Documents for review"
          value={num(t?.docs_due)}
          hint={`${num(t?.audits_planned)} audits scheduled`}
          icon={<BookOpen className="size-4" />}
          loading={totals.loading}
          to="/m/documents"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Compliance calendar"
              subtitle="Everything dated across obligations, tenements, documents and audits"
            />
          </div>
          <div className="max-h-[30rem] overflow-y-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Due</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Source</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Reference</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Item</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Risk</th>
                  <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {calendar.rows.map((c, i) => {
                  const days = daysBetween(c.due_on)
                  return (
                    <tr key={`${c.source}-${c.ref}-${i}`} className="border-b border-line/60">
                      <td className="px-4 py-2">
                        <span className="tnum block text-ink">{date(c.due_on)}</span>
                        <span
                          className={`text-2xs ${days != null && days < 0 ? 'text-danger' : days != null && days < 14 ? 'text-warn' : 'text-subtle'}`}
                        >
                          {relative(c.due_on)}
                        </span>
                      </td>
                      <td className="px-4 py-2 capitalize text-muted">{c.source}</td>
                      <td className="px-4 py-2 font-medium text-ink">{c.ref}</td>
                      <td className="max-w-xs truncate px-4 py-2">{c.title}</td>
                      <td className="px-4 py-2">
                        <Badge status={c.risk ?? 'medium'} />
                      </td>
                      <td className="px-4 py-2">
                        <Badge status={c.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Calendar mix" subtitle="Items in the next six months" />
            <Donut
              data={bySource.rows.map((s) => ({ label: s.source, value: s.n }))}
              centerLabel="items"
              format={(v) => num(v)}
            />
          </Card>
          <Card>
            <CardHeader title="Obligations by penalty risk" subtitle="Open and in progress" />
            <RankedBars
              data={obligationRisk.rows.map((o) => ({
                label: o.penalty_risk,
                value: o.n,
                color:
                  o.penalty_risk === 'critical'
                    ? 'var(--danger)'
                    : o.penalty_risk === 'high'
                      ? 'var(--warn)'
                      : 'var(--series-1)',
              }))}
              format={(v) => num(v)}
            />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Tenement portfolio"
              subtitle="Expiry and expenditure commitment"
              action={
                <Link to="/m/tenements" className="text-2xs text-accent hover:underline">
                  All tenements
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line text-2xs text-subtle">
                  <th className="px-4 py-2 text-left font-medium">Tenement</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Expires</th>
                  <th className="px-4 py-2 text-right font-medium">Commitment</th>
                  <th className="px-4 py-2 text-right font-medium">Met</th>
                </tr>
              </thead>
              <tbody>
                {tenements.rows.map((t2) => {
                  const met = t2.commitment && t2.commitment > 0 ? ((t2.spent ?? 0) / t2.commitment) * 100 : null
                  const days = daysBetween(t2.expires_on)
                  return (
                    <tr key={t2.tenement_no} className="border-b border-line/60">
                      <td className="px-4 py-2 font-medium text-ink">{t2.tenement_no}</td>
                      <td className="px-4 py-2 capitalize text-muted">{t2.tenement_type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2">
                        <span className="tnum text-ink">{t2.expires_on ? date(t2.expires_on) : '—'}</span>
                        {days != null && days < 365 && (
                          <Badge tone={days < 90 ? 'danger' : 'warn'} className="ml-2">
                            {days < 0 ? 'expired' : `${days} d`}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tnum text-muted">{moneyCompact(t2.commitment)}</td>
                      <td className="px-4 py-2 text-right">
                        <Badge tone={met == null ? 'neutral' : met >= 100 ? 'ok' : met >= 60 ? 'warn' : 'danger'}>
                          {percent(met, 0)}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <div className="p-4 pb-0">
              <CardHeader
                title="Recent audits"
                action={
                  <Link to="/m/audits" className="text-2xs text-accent hover:underline">
                    All audits
                  </Link>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="border-b border-line text-2xs text-subtle">
                    <th className="px-4 py-2 text-left font-medium">Audit</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-right font-medium">Score</th>
                    <th className="px-4 py-2 text-right font-medium">Major</th>
                    <th className="px-4 py-2 text-left font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.rows.map((a) => (
                    <tr key={a.audit_no} className="border-b border-line/60">
                      <td className="px-4 py-2">
                        <span className="font-medium text-ink">{a.audit_no}</span>
                        <span className="block max-w-48 truncate text-2xs text-subtle">{a.title}</span>
                      </td>
                      <td className="px-4 py-2 capitalize text-muted">{a.audit_type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 text-right tnum">{percent(a.score_pct, 0)}</td>
                      <td className="px-4 py-2 text-right tnum">{a.major_findings}</td>
                      <td className="px-4 py-2">
                        <Badge status={a.result ?? a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Open findings by severity" />
            <RankedBars
              data={findings.rows.map((f) => ({
                label: f.severity,
                value: f.n,
                color:
                  f.severity === 'critical' || f.severity === 'major'
                    ? 'var(--danger)'
                    : f.severity === 'minor'
                      ? 'var(--warn)'
                      : 'var(--series-1)',
              }))}
              format={(v) => num(v)}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCheck, Siren } from 'lucide-react'
import { useDb } from '@/db/provider'
import { useSql, notifyChange } from '@/db/hooks'
import { date, dateTime, num, relative } from '@/lib/format'
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'

/**
 * The exception feed. Everything here is derived from live data rather
 * than a static notification table, so an item disappears when the
 * underlying condition clears.
 */
export default function AlertsPage() {
  const db = useDb()

  const notifications = useSql<{
    id: number
    severity: string
    title: string
    body: string | null
    link: string | null
    created_at: string
    read_at: string | null
  }>('select id, severity, title, body, link, created_at, read_at from notifications order by created_at desc')

  const gas = useSql<{ measured_at: string; mine: string; station_code: string; ch4: number; co: number; alarm_level: string }>(`
    select g.measured_at::text, m.name as mine, g.station_code, g.ch4_pct::float8 as ch4, g.co_ppm::float8 as co, g.alarm_level
    from gas_readings g join mines m on m.id = g.mine_id
    where g.alarm_level in ('alarm','trip','evacuate') and g.measured_at >= current_date - 7
    order by g.measured_at desc limit 10
  `)

  const geotech = useSql<{ measured_at: string; mine: string; station_code: string; velocity: number | null; alarm_level: string }>(`
    select gm.measured_at::text, m.name as mine, gm.station_code, gm.velocity_mm_day::float8 as velocity, gm.alarm_level
    from geotech_monitoring gm join mines m on m.id = gm.mine_id
    where gm.alarm_level in ('red','evacuate') and gm.measured_at >= current_date - 30
    order by gm.measured_at desc limit 10
  `)

  const tsf = useSql<{ code: string; measured_at: string; freeboard: number | null; min_freeboard: number | null; alarm_level: string }>(`
    select f.code, r.measured_at::text, r.freeboard_m::float8 as freeboard,
           f.min_freeboard_m::float8 as min_freeboard, r.alarm_level
    from tailings_readings r join tailings_facilities f on f.id = r.facility_id
    where r.alarm_level in ('amber','red') and r.measured_at >= current_date - 14
    order by r.measured_at desc limit 10
  `)

  const actions = useSql<{ action_no: string; description: string; due_on: string | null; days_overdue: number | null; priority: string }>(`
    select action_no, description, due_on::text, days_overdue, priority
    from v_open_actions where urgency = 'overdue' order by days_overdue desc limit 12
  `)

  const stock = useSql<{ item_code: string; item_name: string; warehouse_name: string; quantity_on_hand: number; stock_status: string }>(`
    select item_code, item_name, warehouse_name, quantity_on_hand::float8, stock_status
    from v_stock_alerts where stock_status = 'stockout' and is_critical
    order by item_code limit 12
  `)

  const compliance = useSql<{ ref: string; title: string; due_on: string; source: string; risk: string | null }>(`
    select ref, title, due_on::text, source, risk from v_compliance_calendar
    where due_on < current_date + 14 order by due_on limit 12
  `)

  const competency = useSql<{ employee_name: string; competency_name: string; expires_on: string | null }>(`
    select employee_name, competency_name, expires_on::text
    from v_competency_expiry where expiry_status = 'expired' and is_mandatory
    order by expires_on limit 12
  `)

  const markAllRead = async () => {
    if (!db) return
    await db.query('update notifications set read_at = now() where read_at is null')
    notifyChange('notifications')
  }

  const unread = notifications.rows.filter((n) => !n.read_at).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Alerts"
        description="Live exceptions across every module. Items clear themselves when the underlying condition resolves."
        meta={unread > 0 ? `${num(unread)} unread` : undefined}
        actions={
          <Button size="sm" variant="secondary" icon={<CheckCheck className="size-3.5" />} onClick={markAllRead}>
            Mark all read
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Notifications" icon={<Bell className="size-4" />} />
          {notifications.rows.length === 0 ? (
            <EmptyState title="No notifications" />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {notifications.rows.map((n) => (
                <li key={n.id} className="border-b border-line/60 pb-2.5 last:border-0">
                  <Link to={n.link ?? '/alerts'} className="group block">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-ink group-hover:text-accent">{n.title}</p>
                      <Badge
                        tone={
                          n.severity === 'critical'
                            ? 'danger'
                            : n.severity === 'warning'
                              ? 'warn'
                              : n.severity === 'success'
                                ? 'ok'
                                : 'info'
                        }
                      >
                        {n.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-2xs text-muted">{n.body}</p>
                    <p className="mt-0.5 text-2xs text-subtle">
                      {relative(n.created_at)}
                      {!n.read_at && <span className="ml-2 text-accent">Unread</span>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <AlertBlock
            title="Gas alarms"
            subtitle="Alarm, trip or evacuate readings in the last 7 days"
            icon={<Siren className="size-4" />}
            to="/m/gas-readings"
            empty="No gas alarms."
            rows={gas.rows.map((g) => ({
              key: `${g.station_code}-${g.measured_at}`,
              primary: `${g.mine} · ${g.station_code}`,
              secondary: `CH₄ ${g.ch4?.toFixed(2)}% · CO ${g.co?.toFixed(0)} ppm`,
              trailing: <Badge status={g.alarm_level} />,
              time: dateTime(g.measured_at),
            }))}
          />

          <AlertBlock
            title="Ground movement"
            subtitle="Red or evacuate geotechnical alarms, last 30 days"
            icon={<AlertTriangle className="size-4" />}
            to="/m/geotechnical"
            empty="No ground movement alarms."
            rows={geotech.rows.map((g) => ({
              key: `${g.station_code}-${g.measured_at}`,
              primary: `${g.mine} · ${g.station_code}`,
              secondary: `${g.velocity?.toFixed(2) ?? '—'} mm/day`,
              trailing: <Badge status={g.alarm_level} />,
              time: dateTime(g.measured_at),
            }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AlertBlock
          title="Tailings triggers"
          subtitle="Freeboard below the design trigger"
          to="/m/tailings-readings"
          empty="All facilities above trigger level."
          rows={tsf.rows.map((f) => ({
            key: `${f.code}-${f.measured_at}`,
            primary: f.code,
            secondary: `Freeboard ${f.freeboard?.toFixed(2)} m against ${f.min_freeboard?.toFixed(1)} m minimum`,
            trailing: <Badge status={f.alarm_level} />,
            time: date(f.measured_at),
          }))}
        />

        <AlertBlock
          title="Overdue actions"
          subtitle="Corrective and preventive actions past due"
          to="/m/actions"
          empty="No overdue actions."
          rows={actions.rows.map((a) => ({
            key: a.action_no,
            primary: a.action_no,
            secondary: a.description,
            trailing: <Badge tone="danger">{a.days_overdue ?? 0} d</Badge>,
            time: a.due_on ? date(a.due_on) : '—',
          }))}
        />

        <AlertBlock
          title="Critical stockouts"
          subtitle="Critical items with nothing on hand"
          to="/m/stock-levels"
          empty="No critical stockouts."
          rows={stock.rows.map((s) => ({
            key: `${s.item_code}-${s.warehouse_name}`,
            primary: s.item_code,
            secondary: `${s.item_name} · ${s.warehouse_name}`,
            trailing: <Badge status={s.stock_status} />,
            time: '',
          }))}
        />

        <AlertBlock
          title="Compliance due"
          subtitle="Obligations, licences and reviews due within 14 days"
          to="/compliance"
          empty="Nothing due."
          rows={compliance.rows.map((c) => ({
            key: `${c.source}-${c.ref}`,
            primary: c.ref,
            secondary: c.title,
            trailing: <Badge status={c.risk ?? 'medium'} />,
            time: date(c.due_on),
          }))}
        />

        <AlertBlock
          title="Expired mandatory competencies"
          subtitle="People working without a current statutory ticket"
          to="/m/employee-competencies"
          empty="All mandatory competencies current."
          rows={competency.rows.map((c, i) => ({
            key: `${c.employee_name}-${i}`,
            primary: c.employee_name,
            secondary: c.competency_name,
            trailing: <Badge tone="danger">Expired</Badge>,
            time: c.expires_on ? date(c.expires_on) : '—',
          }))}
        />
      </div>
    </div>
  )
}

interface AlertRow {
  key: string
  primary: string
  secondary: string
  trailing: React.ReactNode
  time: string
}

function AlertBlock({
  title,
  subtitle,
  icon,
  rows,
  to,
  empty,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  rows: AlertRow[]
  to: string
  empty: string
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        action={
          <Link to={to} className="text-2xs text-accent hover:underline">
            Open
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-subtle">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink">{r.primary}</p>
                <p className="truncate text-2xs text-muted">{r.secondary}</p>
                {r.time && <p className="text-2xs text-subtle">{r.time}</p>}
              </div>
              <div className="shrink-0">{r.trailing}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

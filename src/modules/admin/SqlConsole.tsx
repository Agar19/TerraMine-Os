import { useState } from 'react'
import { Download, Play } from 'lucide-react'
import { useDb } from '@/db/provider'
import { notifyChange } from '@/db/hooks'
import { downloadCsv } from '@/lib/csv'
import { Button, Card, CardHeader, ErrorState, Textarea } from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'

const SAMPLES: { label: string; sql: string }[] = [
  {
    label: 'Ore and waste by mine, last 30 days',
    sql: `select mine_name, commodity,
       round(sum(coalesce(ore_tonnes,0) + coalesce(coal_tonnes,0))) as ore_coal_t,
       round(sum(waste_tonnes)) as waste_t,
       round(avg(avg_grade)::numeric, 3) as avg_grade
from v_production_daily
where record_date >= current_date - 30
group by mine_name, commodity
order by ore_coal_t desc;`,
  },
  {
    label: 'Fleet availability, worst ten',
    sql: `select asset_no, name, asset_type, availability_30d_pct, downtime_hours_30d, breakdowns_30d
from v_asset_status
where status <> 'decommissioned'
order by availability_30d_pct asc nulls last
limit 10;`,
  },
  {
    label: 'Safety frequency rates by month',
    sql: `select month, recordables, lost_time_injuries, round(hours_worked) as hours, trifr, ltifr
from v_safety_rates
order by month desc
limit 12;`,
  },
  {
    label: 'Cost per tonne by category',
    sql: `select month, category, round(cost) as cost, round(cost_per_tonne_moved, 3) as usd_per_tonne
from v_cost_per_tonne
where cost_per_tonne_moved is not null
order by month desc, cost desc
limit 25;`,
  },
  {
    label: 'Who is underground right now',
    sql: `select person, employee_no, mine_name, location, hours_underground
from v_personnel_underground
order by hours_underground desc;`,
  },
  {
    label: 'Table row counts',
    sql: `select relname as table_name, n_live_tup as approx_rows
from pg_stat_user_tables
order by n_live_tup desc
limit 40;`,
  },
]

export default function SqlConsole() {
  const db = useDb()
  const [sql, setSql] = useState(SAMPLES[0].sql)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [affected, setAffected] = useState<number | null>(null)

  const run = async () => {
    if (!db) return
    setRunning(true)
    setError(null)
    setAffected(null)
    const started = performance.now()
    try {
      const result = await db.query<Record<string, unknown>>(sql)
      setRows(result.rows)
      setColumns(result.fields?.map((f) => f.name) ?? Object.keys(result.rows[0] ?? {}))
      setAffected(result.affectedRows ?? null)
      if (/^\s*(insert|update|delete|alter|create|drop|truncate)/i.test(sql)) notifyChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRows([])
      setColumns([])
    } finally {
      setElapsed(Math.round(performance.now() - started))
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="SQL console"
        description="Query the embedded Postgres directly. Useful for ad hoc reporting and for checking what a screen is actually doing."
        actions={
          <>
            {rows.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="size-3.5" />}
                onClick={() => downloadCsv('query-result', rows, columns)}
              >
                Export
              </Button>
            )}
            <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} loading={running} onClick={run}>
              Run query
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
            }}
            className="min-h-44 font-mono text-xs"
            spellCheck={false}
          />
          <p className="mt-2 text-2xs text-subtle">
            Ctrl or Cmd + Enter runs the query. Writes take effect immediately in the local database.
          </p>
        </Card>
        <Card>
          <CardHeader title="Saved queries" />
          <div className="flex flex-col gap-1">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSql(s.sql)}
                className="rounded-md px-2 py-1.5 text-left text-2xs text-muted transition hover:bg-inset hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {error && <ErrorState message={error} />}

      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-xs font-semibold text-ink">Result</p>
          <p className="text-2xs text-subtle tnum">
            {rows.length} row{rows.length === 1 ? '' : 's'}
            {affected != null && affected > 0 ? ` · ${affected} affected` : ''}
            {elapsed != null ? ` · ${elapsed} ms` : ''}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-subtle">
            {error ? 'Query failed.' : 'Run a query to see results.'}
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-line">
                  {columns.map((c) => (
                    <th key={c} className="sticky top-0 bg-elevated px-3 py-2 text-left font-medium text-subtle">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((row, i) => (
                  <tr key={i} className="border-b border-line/60">
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 text-ink">
                        {row[c] == null ? (
                          <span className="text-subtle">null</span>
                        ) : typeof row[c] === 'object' ? (
                          <span className="font-mono text-2xs">{JSON.stringify(row[c])}</span>
                        ) : (
                          <span className={typeof row[c] === 'number' ? 'tnum' : undefined}>{String(row[c])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 500 && (
              <p className="px-3 py-2 text-2xs text-subtle">
                Showing the first 500 rows. Export to CSV for the full result.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

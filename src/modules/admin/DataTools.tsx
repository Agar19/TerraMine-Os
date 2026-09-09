import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Download, RotateCcw, Table2 } from 'lucide-react'
import { useDb } from '@/db/provider'
import { useSql } from '@/db/hooks'
import { resetDatabase } from '@/db/client'
import { downloadCsv } from '@/lib/csv'
import { num, relative } from '@/lib/format'
import { Badge, Button, Card, CardHeader, Modal, SearchInput } from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'
import { ENTITIES } from '@/registry/entities'

export default function DataTools() {
  const db = useDb()
  const [search, setSearch] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const tables = useSql<{ table_name: string; kind: string; rows: number; size: string }>(`
    select c.relname as table_name,
           case c.relkind when 'r' then 'table' else 'view' end as kind,
           coalesce(s.n_live_tup, 0)::int as rows,
           pg_size_pretty(pg_total_relation_size(c.oid)) as size
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind in ('r','v')
    order by coalesce(s.n_live_tup, 0) desc, c.relname
  `)

  const migrations = useSql<{ name: string; applied_at: string }>(
    'select name, applied_at::text from schema_migrations order by name',
  )

  const filtered = tables.rows.filter((t) => t.table_name.includes(search.toLowerCase()))
  const totalRows = tables.rows.filter((t) => t.kind === 'table').reduce((s, t) => s + t.rows, 0)
  const entityByTable = new Map(ENTITIES.map((e) => [e.table, e.slug]))

  const exportTable = async (table: string) => {
    if (!db) return
    setExporting(table)
    try {
      const res = await db.query<Record<string, unknown>>(`select * from "${table}" limit 50000`)
      downloadCsv(table, res.rows)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Data and schema"
        description="What is in the local database, which migrations have been applied, and how to move it to Supabase."
        actions={
          <Button
            size="sm"
            variant="danger"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => setConfirmReset(true)}
          >
            Reset database
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Tables" value={num(tables.rows.filter((t) => t.kind === 'table').length)} />
        <Tile label="Reporting views" value={num(tables.rows.filter((t) => t.kind === 'view').length)} />
        <Tile label="Rows stored" value={num(totalRows)} />
        <Tile label="Migrations applied" value={num(migrations.rows.length)} />
      </div>

      <Card>
        <CardHeader
          title="Moving to Supabase"
          subtitle="The schema was written to port without edits"
          icon={<Database className="size-4" />}
        />
        <ol className="flex list-inside list-decimal flex-col gap-1.5 text-xs text-muted">
          <li>
            Copy <code className="rounded bg-inset px-1 py-0.5 font-mono text-2xs">src/db/migrations/*.sql</code> into{' '}
            <code className="rounded bg-inset px-1 py-0.5 font-mono text-2xs">supabase/migrations/</code> and run{' '}
            <code className="rounded bg-inset px-1 py-0.5 font-mono text-2xs">supabase db push</code>.
          </li>
          <li>
            Apply <code className="rounded bg-inset px-1 py-0.5 font-mono text-2xs">supabase/rls.sql</code> to switch on
            row level security. Every table carries <code className="font-mono text-2xs">org_id</code>, so the policies
            are single-column and indexed.
          </li>
          <li>
            Swap the client: replace <code className="font-mono text-2xs">db.query(sql, params)</code> in{' '}
            <code className="font-mono text-2xs">src/db/hooks.ts</code> with a Supabase RPC or PostgREST call. Nothing
            above that layer changes because every screen reads through the same hook.
          </li>
          <li>
            Point <code className="font-mono text-2xs">notifyChange()</code> at a realtime subscription so open screens
            refresh from server changes instead of local writes.
          </li>
        </ol>
      </Card>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Filter relations" className="w-full max-w-64" />
          <span className="ml-auto text-2xs text-subtle">{filtered.length} relations</span>
        </div>
        <div className="max-h-[34rem] overflow-y-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Relation</th>
                <th className="sticky top-0 bg-elevated px-4 py-2 text-left font-medium">Kind</th>
                <th className="sticky top-0 bg-elevated px-4 py-2 text-right font-medium">Rows</th>
                <th className="sticky top-0 bg-elevated px-4 py-2 text-right font-medium">Size</th>
                <th className="sticky top-0 bg-elevated px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const slug = entityByTable.get(t.table_name)
                return (
                  <tr key={t.table_name} className="border-b border-line/60">
                    <td className="px-4 py-2 font-mono text-2xs text-ink">{t.table_name}</td>
                    <td className="px-4 py-2">
                      <Badge tone={t.kind === 'view' ? 'info' : 'neutral'}>{t.kind}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right tnum">{t.kind === 'table' ? num(t.rows) : '—'}</td>
                    <td className="px-4 py-2 text-right tnum text-muted">{t.size}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {slug && (
                          <Link to={`/m/${slug}`} className="text-2xs text-accent hover:underline">
                            Open
                          </Link>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          loading={exporting === t.table_name}
                          icon={<Download className="size-3" />}
                          onClick={() => exportTable(t.table_name)}
                        >
                          CSV
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Applied migrations" icon={<Table2 className="size-4" />} />
        <ul className="flex flex-col gap-1.5">
          {migrations.rows.map((m) => (
            <li key={m.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono text-2xs text-ink">{m.name}</span>
              <span className="text-2xs text-subtle">{relative(m.applied_at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the local database"
        subtitle="This deletes everything stored in this browser"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void resetDatabase()}>
              Delete and rebuild
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted">
          Every record you have created or edited will be lost. The schema will be reapplied and the demo dataset
          regenerated from scratch, which takes a few seconds.
        </p>
      </Modal>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-elevated p-3.5 ring-1 ring-line shadow-[var(--shadow-card)]">
      <p className="text-2xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tnum text-ink">{value}</p>
    </div>
  )
}

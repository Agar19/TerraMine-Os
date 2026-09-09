import { useMemo, useState } from 'react'
import { Download, Filter, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useDb } from '@/db/provider'
import { useSql } from '@/db/hooks'
import { buildListQuery, deleteRow, insertRow, updateRow, writeAudit, type Filter as SqlFilter } from '@/db/sql'
import { useTableMeta, type ColumnMeta } from '@/db/introspect'
import { columnLabel, label as toLabel, num } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { cn } from '@/lib/cn'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  SearchInput,
  Select,
  Spinner,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, cellValue, type ColumnOverride, type SortState, type TableColumn } from './DataTable'
import { useLookups } from './lookups'
import { RecordFields, useRecordForm } from './RecordForm'

export interface EntityConfig {
  /** Route segment, unique across the app. */
  slug: string
  table: string
  title: string
  singular: string
  description?: string
  /** Columns shown in the list, in order. Everything else is on the record. */
  listColumns: string[]
  searchColumns?: string[]
  defaultSort?: SortState
  /** Enum or reference columns offered as dropdown filters in the toolbar. */
  filterColumns?: string[]
  overrides?: Record<string, ColumnOverride>
  /** Views and derived tables cannot be edited. */
  readOnly?: boolean
  pageSize?: number
}

const PAGE_SIZES = [25, 50, 100, 250]

export function EntityPage({ config, actions }: { config: EntityConfig; actions?: React.ReactNode }) {
  const db = useDb()
  const meta = useTableMeta(config.table)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<SortState>(
    config.defaultSort ?? { column: 'id', dir: 'desc' },
  )
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(config.pageSize ?? 50)
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [editing, setEditing] = useState<Record<string, unknown> | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const columnByName = useMemo(() => {
    const map = new Map<string, ColumnMeta>()
    for (const c of meta.columns) map.set(c.name, c)
    return map
  }, [meta.columns])

  const refTables = useMemo(
    () => meta.columns.filter((c) => c.kind === 'reference' && c.refTable).map((c) => c.refTable!),
    [meta.columns],
  )
  const { lookups, byId } = useLookups(refTables)
  const refLabel = (table: string, id: number) => byId.get(table)?.get(id)

  const sqlFilters: SqlFilter[] = useMemo(
    () =>
      Object.entries(filters)
        .filter(([, v]) => v !== '')
        .map(([column, value]) => ({ column, op: 'eq' as const, value })),
    [filters],
  )

  const searchColumns = useMemo(() => {
    if (config.searchColumns) return config.searchColumns
    return meta.columns
      .filter((c) => (c.kind === 'text' || c.kind === 'longtext') && !c.name.endsWith('_at'))
      .slice(0, 6)
      .map((c) => c.name)
  }, [config.searchColumns, meta.columns])

  const query = useMemo(
    () =>
      buildListQuery({
        table: config.table,
        search: search || undefined,
        searchColumns,
        filters: sqlFilters,
        orderBy: sort.column,
        orderDir: sort.dir,
        limit: pageSize,
        offset: page * pageSize,
      }),
    [config.table, search, searchColumns, sqlFilters, sort, pageSize, page],
  )

  const ready = meta.columns.length > 0
  const list = useSql<Record<string, unknown>>(ready ? query.sql : null, query.params)
  const count = useSql<{ total: number }>(ready ? query.countSql : null, query.params)
  const total = count.rows[0]?.total ?? 0

  const columns: TableColumn[] = useMemo(
    () =>
      config.listColumns
        .filter((name) => columnByName.has(name) || config.overrides?.[name]?.render)
        .map((name) => ({
          name,
          meta: columnByName.get(name),
          ...config.overrides?.[name],
        })),
    [config.listColumns, config.overrides, columnByName],
  )

  const filterDefs = useMemo(
    () =>
      (config.filterColumns ?? [])
        .map((name) => columnByName.get(name))
        .filter((c): c is ColumnMeta => Boolean(c)),
    [config.filterColumns, columnByName],
  )

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const onSort = (column: string) => {
    setPage(0)
    setSort((prev) =>
      prev.column === column ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { column, dir: 'desc' },
    )
  }

  const exportCsv = async () => {
    if (!db) return
    const full = buildListQuery({
      table: config.table,
      search: search || undefined,
      searchColumns,
      filters: sqlFilters,
      orderBy: sort.column,
      orderDir: sort.dir,
      limit: 20000,
    })
    const res = await db.query<Record<string, unknown>>(full.sql, full.params)
    downloadCsv(`${config.slug}-${new Date().toISOString().slice(0, 10)}`, res.rows)
    await writeAudit(db, 1, config.table, null, 'export', 'current user', `Exported ${res.rows.length} rows`)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={config.title}
        description={config.description}
        meta={
          count.loading ? undefined : (
            <span className="tnum">
              {num(total)} record{total === 1 ? '' : 's'}
            </span>
          )
        }
        actions={
          <>
            {actions}
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={list.refetch}>
              Refresh
            </Button>
            <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              Export
            </Button>
            {!config.readOnly && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setFormError(null)
                  setEditing(null)
                }}
              >
                New {config.singular.toLowerCase()}
              </Button>
            )}
          </>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(0)
            }}
            placeholder={`Search ${config.title.toLowerCase()}`}
            className="w-full max-w-64"
          />
          {filterDefs.map((col) => (
            <Select
              key={col.name}
              className="h-8 w-auto min-w-36 py-1 text-xs"
              value={filters[col.name] ?? ''}
              onChange={(e) => {
                setPage(0)
                setFilters((prev) => ({ ...prev, [col.name]: e.target.value }))
              }}
            >
              <option value="">Any {columnLabel(col.name).toLowerCase()}</option>
              {col.kind === 'reference'
                ? (lookups.get(col.refTable ?? '') ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))
                : (col.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {toLabel(o)}
                    </option>
                  ))}
            </Select>
          ))}
          {activeFilterCount > 0 && (
            <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => setFilters({})}>
              Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2 text-2xs text-subtle">
            {list.loading && <Spinner className="size-3" />}
            <Filter className="size-3" />
            Rows
            <Select
              className="h-7 w-auto py-0.5 text-2xs"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </span>
        </div>

        {meta.error || list.error ? (
          <div className="p-4">
            <ErrorState message={meta.error ?? list.error ?? ''} onRetry={list.refetch} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={list.rows}
            loading={list.loading}
            sort={sort}
            onSort={onSort}
            onRowClick={setRecord}
            refLabel={refLabel}
            emptyTitle={search || activeFilterCount > 0 ? 'No matching records' : `No ${config.title.toLowerCase()} yet`}
            emptyDescription={
              search || activeFilterCount > 0
                ? 'Try a different search term or clear the filters.'
                : config.readOnly
                  ? undefined
                  : `Create the first ${config.singular.toLowerCase()} to get started.`
            }
          />
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-2xs text-muted">
            <span className="tnum">
              {num(page * pageSize + 1)}–{num(Math.min((page + 1) * pageSize, total))} of {num(total)}
            </span>
            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost" disabled={page === 0} onClick={() => setPage(0)}>
                First
              </Button>
              <Button size="xs" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="px-2 tnum">
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                size="xs"
                variant="ghost"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Record detail */}
      <Modal
        open={record != null}
        onClose={() => setRecord(null)}
        title={recordTitle(record, config)}
        subtitle={`${config.singular} · record #${String(record?.id ?? '')}`}
        size="lg"
        footer={
          !config.readOnly && (
            <>
              <Button
                variant="ghost"
                className="text-danger mr-auto"
                icon={<Trash2 className="size-3.5" />}
                loading={busy}
                onClick={async () => {
                  if (!db || !record) return
                  if (!window.confirm(`Delete this ${config.singular.toLowerCase()}? This cannot be undone.`)) return
                  setBusy(true)
                  try {
                    await deleteRow(db, config.table, Number(record.id))
                    await writeAudit(db, 1, config.table, Number(record.id), 'delete', 'current user', recordTitle(record, config))
                    setRecord(null)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setRecord(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={<Pencil className="size-3.5" />}
                onClick={() => {
                  setFormError(null)
                  setEditing(record)
                  setRecord(null)
                }}
              >
                Edit
              </Button>
            </>
          )
        }
      >
        {record && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {meta.columns
              .filter((c) => c.name !== 'org_id')
              .map((col) => (
                <div key={col.name} className="flex flex-col gap-0.5 border-b border-line/60 pb-2">
                  <dt className="text-2xs uppercase tracking-wide text-subtle">{columnLabel(col.name)}</dt>
                  <dd className="text-xs text-ink">
                    {cellValue(record[col.name], { name: col.name, meta: col }, record, refLabel)}
                  </dd>
                </div>
              ))}
          </dl>
        )}
      </Modal>

      {/* Create / edit */}
      {editing !== undefined && (
        <RecordEditor
          key={editing ? `edit-${String(editing.id)}` : 'create'}
          config={config}
          columns={meta.columns}
          lookups={lookups}
          initial={editing}
          error={formError}
          busy={busy}
          onCancel={() => setEditing(undefined)}
          onSubmit={async (payload) => {
            if (!db) return
            setBusy(true)
            setFormError(null)
            try {
              if (editing) {
                await updateRow(db, config.table, Number(editing.id), payload)
                await writeAudit(db, 1, config.table, Number(editing.id), 'update', 'current user', 'Edited from the record form')
              } else {
                const created = await insertRow(db, config.table, { org_id: 1, ...payload })
                await writeAudit(db, 1, config.table, Number(created?.id ?? 0), 'insert', 'current user', 'Created from the record form')
              }
              setEditing(undefined)
              list.refetch()
            } catch (err) {
              setFormError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}

function recordTitle(record: Record<string, unknown> | null, config: EntityConfig): string {
  if (!record) return config.singular
  for (const key of ['name', 'title', 'full_name', 'code', 'asset_no', 'employee_no', 'incident_no', 'wo_number', 'hole_id']) {
    if (record[key]) return String(record[key])
  }
  return `${config.singular} #${String(record.id ?? '')}`
}

function RecordEditor({
  config,
  columns,
  lookups,
  initial,
  onCancel,
  onSubmit,
  busy,
  error,
}: {
  config: EntityConfig
  columns: ColumnMeta[]
  lookups: ReturnType<typeof useLookups>['lookups']
  initial: Record<string, unknown> | null
  onCancel: () => void
  onSubmit: (payload: Record<string, unknown>) => void
  busy: boolean
  error: string | null
}) {
  const form = useRecordForm(columns, initial)
  return (
    <Modal
      open
      onClose={onCancel}
      size="lg"
      title={initial ? `Edit ${config.singular.toLowerCase()}` : `New ${config.singular.toLowerCase()}`}
      subtitle={config.description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              if (form.validate()) onSubmit(form.payload())
            }}
          >
            {initial ? 'Save changes' : `Create ${config.singular.toLowerCase()}`}
          </Button>
        </>
      }
    >
      {columns.length === 0 ? (
        <EmptyState title="Loading form" />
      ) : (
        <>
          {error && (
            <div className={cn('mb-3')}>
              <ErrorState message={error} />
            </div>
          )}
          <RecordFields columns={columns} form={form} lookups={lookups} />
          <p className="mt-4 flex items-center gap-2 text-2xs text-subtle">
            <Badge tone="info">Schema driven</Badge>
            This form is generated from the {config.table} table definition, so it always matches the database.
          </p>
        </>
      )}
    </Modal>
  )
}

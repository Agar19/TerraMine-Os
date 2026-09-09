import { Fragment, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { columnLabel, date, dateTime, label as toLabel, num, toNumber } from '@/lib/format'
import type { ColumnMeta } from '@/db/introspect'
import { Badge, Skeleton, EmptyState } from '@/components/ui/primitives'

export interface ColumnOverride {
  label?: string
  width?: string
  align?: 'left' | 'right' | 'center'
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode
  /** Force badge rendering for a status-like column. */
  badge?: boolean
  sortable?: boolean
}

export interface TableColumn extends ColumnOverride {
  name: string
  meta?: ColumnMeta
}

export interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

/** Columns whose values read as a status and should render as a chip. */
const BADGE_COLUMNS = new Set([
  'status', 'result', 'outcome', 'severity', 'priority', 'alarm_level', 'risk_rating',
  'classification', 'stock_status', 'due_status', 'expiry_status', 'urgency', 'criticality',
  'safety_rating', 'condition', 'qa_result', 'consequence_category', 'penalty_risk',
  'inspection_result', 'effectiveness_rating', 'fitness_check', 'alcohol_test',
  'highest_residual_risk', 'stage',
])

const RIGHT_ALIGNED: FieldKindSet = new Set(['integer', 'decimal'])
type FieldKindSet = Set<string>

export function cellValue(
  value: unknown,
  column: TableColumn,
  row: Record<string, unknown>,
  refLabel?: (table: string, id: number) => string | undefined,
): ReactNode {
  if (column.render) return column.render(value, row)
  const kind = column.meta?.kind ?? 'text'

  if (value == null || value === '') return <span className="text-subtle">—</span>

  if (column.badge || (kind === 'enum' && BADGE_COLUMNS.has(column.name))) {
    return <Badge status={value} />
  }

  switch (kind) {
    case 'boolean':
      return value ? (
        <Badge tone="ok">Yes</Badge>
      ) : (
        <span className="text-subtle">No</span>
      )
    case 'date':
      return <span className="tnum">{date(value)}</span>
    case 'timestamp':
      return <span className="tnum">{dateTime(value)}</span>
    case 'integer':
      return <span className="tnum">{num(value)}</span>
    case 'decimal': {
      const scale = column.meta?.scale ?? 2
      return <span className="tnum">{num(value, Math.min(scale, 3))}</span>
    }
    case 'enum':
      return toLabel(value)
    case 'reference': {
      const table = column.meta?.refTable
      const id = toNumber(value)
      const text = table && id != null ? refLabel?.(table, id) : undefined
      return text ? (
        <span className="truncate">{text}</span>
      ) : (
        <span className="text-subtle tnum">#{String(value)}</span>
      )
    }
    case 'json':
      return <span className="font-mono text-2xs text-subtle">{JSON.stringify(value).slice(0, 40)}</span>
    case 'longtext':
      return <span className="line-clamp-2 max-w-md">{String(value)}</span>
    default:
      return <span className="truncate">{String(value)}</span>
  }
}

export function DataTable({
  columns,
  rows,
  loading,
  sort,
  onSort,
  onRowClick,
  refLabel,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  rowKey = 'id',
  dense = false,
  highlightRow,
}: {
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  loading?: boolean
  sort?: SortState
  onSort?: (column: string) => void
  onRowClick?: (row: Record<string, unknown>) => void
  refLabel?: (table: string, id: number) => string | undefined
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  rowKey?: string
  dense?: boolean
  highlightRow?: (row: Record<string, unknown>) => boolean
}) {
  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2'

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => {
              const active = sort?.column === col.name
              const alignRight = col.align === 'right' || (!col.align && RIGHT_ALIGNED.has(col.meta?.kind ?? ''))
              const sortable = col.sortable !== false && Boolean(onSort)
              return (
                <th
                  key={col.name}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'sticky top-0 z-10 bg-elevated font-medium text-subtle whitespace-nowrap',
                    cellPad,
                    alignRight ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(col.name)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-ink transition',
                        active && 'text-ink',
                        alignRight && 'flex-row-reverse',
                      )}
                    >
                      {col.label ?? columnLabel(col.name)}
                      {active ? (
                        sort?.dir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-30" />
                      )}
                    </button>
                  ) : (
                    (col.label ?? columnLabel(col.name))
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            rows.length === 0 &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={`s${i}`} className="border-b border-line/60">
                {columns.map((col) => (
                  <td key={col.name} className={cellPad}>
                    <Skeleton className="h-3 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          {rows.map((row, i) => (
            <Fragment key={String(row[rowKey] ?? i)}>
              <tr
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-line/60 transition',
                  onRowClick && 'cursor-pointer hover:bg-inset',
                  highlightRow?.(row) && 'bg-danger-soft/40',
                )}
              >
                {columns.map((col) => {
                  const alignRight =
                    col.align === 'right' || (!col.align && RIGHT_ALIGNED.has(col.meta?.kind ?? ''))
                  return (
                    <td
                      key={col.name}
                      className={cn(
                        'text-ink align-top',
                        cellPad,
                        alignRight ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {cellValue(row[col.name], col, row, refLabel)}
                    </td>
                  )
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

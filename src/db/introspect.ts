import { useMemo } from 'react'
import { useSql } from './hooks'

/**
 * Runtime schema introspection.
 *
 * Rather than restating 129 tables in TypeScript, the generic list/form
 * layer asks Postgres what a table looks like: column types, nullability,
 * the allowed values baked into each check constraint, and foreign keys.
 * A table gains a working screen the moment its migration lands; the
 * entity registry only supplies presentation choices on top.
 */

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'enum'
  | 'reference'
  | 'json'
  | 'uuid'

export interface ColumnMeta {
  name: string
  kind: FieldKind
  nullable: boolean
  hasDefault: boolean
  scale: number | null
  /** Allowed values, parsed from the column check constraint. */
  options?: string[]
  /** Referenced table for a foreign key column. */
  refTable?: string
  refLabelColumn?: string
  isPrimaryKey: boolean
  isGenerated: boolean
}

export interface TableMeta {
  table: string
  columns: ColumnMeta[]
  loading: boolean
  error: string | null
}

interface RawColumn {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  numeric_scale: number | null
  is_identity: string
}

interface RawConstraint {
  contype: string
  def: string
  column_name: string | null
  ref_table: string | null
}

const COLUMNS_SQL = `
  select column_name, data_type, is_nullable, column_default, numeric_scale, is_identity
  from information_schema.columns
  where table_schema = 'public' and table_name = $1
  order by ordinal_position
`

const CONSTRAINTS_SQL = `
  select
    con.contype::text as contype,
    pg_get_constraintdef(con.oid) as def,
    att.attname as column_name,
    ref.relname as ref_table
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  left join pg_class ref on ref.oid = con.confrelid
  left join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where ns.nspname = 'public' and rel.relname = $1 and con.contype in ('c','f','p')
`

/** Pulls the quoted literals out of a `x = ANY (ARRAY[...])` check clause. */
function parseEnumOptions(def: string, column: string): string[] | undefined {
  const scoped = def.includes(column) ? def : ''
  if (!scoped || !scoped.includes('ANY')) return undefined
  // Only take the ARRAY that follows this column's comparison.
  const idx = scoped.indexOf(column)
  const tail = scoped.slice(idx)
  const arrayMatch = tail.match(/ARRAY\[(.*?)\]/s)
  if (!arrayMatch) return undefined
  const values = [...arrayMatch[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"))
  return values.length > 0 ? values : undefined
}

function kindFor(raw: RawColumn, hasRef: boolean, options?: string[]): FieldKind {
  if (hasRef) return 'reference'
  if (options) return 'enum'
  switch (raw.data_type) {
    case 'bigint':
    case 'integer':
    case 'smallint':
      return 'integer'
    case 'numeric':
    case 'double precision':
    case 'real':
      return 'decimal'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return 'timestamp'
    case 'jsonb':
    case 'json':
      return 'json'
    case 'uuid':
      return 'uuid'
    default:
      return 'text'
  }
}

/** Long free-text columns get a textarea instead of a single-line input. */
const LONG_TEXT = new Set([
  'description', 'notes', 'comments', 'summary', 'entry', 'body', 'justification',
  'controls', 'precautions', 'observations', 'key_points', 'issues_raised', 'scope',
  'handover_notes', 'root_cause', 'corrective_action', 'immediate_cause', 'evidence',
  'resolution', 'commitment', 'restrictions', 'defect_notes', 'quality_penalties',
  'verification_notes', 'commentary', 'deviation_notes', 'action_taken', 'outcome',
  'rejection_reason', 'environmental_impact', 'support_installed', 'team',
])

const LABEL_CANDIDATES = ['name', 'title', 'full_name', 'code', 'asset_no', 'employee_no', 'hole_id']

export function useTableMeta(table: string | null): TableMeta {
  const columns = useSql<RawColumn>(table ? COLUMNS_SQL : null, table ? [table] : [])
  const constraints = useSql<RawConstraint>(table ? CONSTRAINTS_SQL : null, table ? [table] : [])

  const meta = useMemo<ColumnMeta[]>(() => {
    if (columns.rows.length === 0) return []
    const fks = new Map<string, string>()
    const pks = new Set<string>()
    const checks: RawConstraint[] = []
    for (const c of constraints.rows) {
      if (c.contype === 'f' && c.column_name && c.ref_table) fks.set(c.column_name, c.ref_table)
      else if (c.contype === 'p' && c.column_name) pks.add(c.column_name)
      else if (c.contype === 'c') checks.push(c)
    }

    return columns.rows.map((raw) => {
      const options = checks
        .map((c) => parseEnumOptions(c.def, raw.column_name))
        .find((v): v is string[] => Array.isArray(v))
      const refTable = fks.get(raw.column_name)
      let kind = kindFor(raw, Boolean(refTable), options)
      if (kind === 'text' && LONG_TEXT.has(raw.column_name)) kind = 'longtext'
      return {
        name: raw.column_name,
        kind,
        nullable: raw.is_nullable === 'YES',
        hasDefault: raw.column_default != null,
        scale: raw.numeric_scale,
        options,
        refTable,
        isPrimaryKey: pks.has(raw.column_name),
        isGenerated: raw.is_identity === 'YES',
      }
    })
  }, [columns.rows, constraints.rows])

  return {
    table: table ?? '',
    columns: meta,
    loading: columns.loading || constraints.loading,
    error: columns.error ?? constraints.error,
  }
}

/** Best human-readable column for a referenced table, chosen once per table. */
export function useReferenceLabels(tables: string[]): Map<string, string> {
  const list = [...new Set(tables)].sort()
  const { rows } = useSql<{ table_name: string; column_name: string }>(
    list.length > 0
      ? `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and table_name = any($1::text[])
           and column_name = any($2::text[])`
      : null,
    list.length > 0 ? [list, LABEL_CANDIDATES] : [],
  )
  return useMemo(() => {
    const byTable = new Map<string, string[]>()
    for (const r of rows) {
      const arr = byTable.get(r.table_name) ?? []
      arr.push(r.column_name)
      byTable.set(r.table_name, arr)
    }
    const result = new Map<string, string>()
    for (const [table, cols] of byTable) {
      const best = LABEL_CANDIDATES.find((c) => cols.includes(c)) ?? 'id'
      result.set(table, best)
    }
    return result
  }, [rows])
}

import type { MineDb } from './client'
import { notifyChange } from './hooks'

const IDENT = /^[a-z_][a-z0-9_]*$/

/** Identifiers only ever come from the entity registry, but validate anyway. */
export function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return name
}

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'is_null' | 'not_null'

export interface Filter {
  column: string
  op: FilterOp
  value?: unknown
}

export interface ListQuery {
  table: string
  columns?: string[]
  search?: string
  searchColumns?: string[]
  filters?: Filter[]
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

interface BuiltQuery {
  sql: string
  countSql: string
  params: unknown[]
}

export function buildListQuery(q: ListQuery): BuiltQuery {
  const params: unknown[] = []
  const where: string[] = []

  for (const f of q.filters ?? []) {
    const col = ident(f.column)
    switch (f.op) {
      case 'is_null':
        where.push(`${col} is null`)
        break
      case 'not_null':
        where.push(`${col} is not null`)
        break
      case 'in': {
        const values = Array.isArray(f.value) ? f.value : [f.value]
        if (values.length === 0) {
          where.push('false')
          break
        }
        const slots = values.map((v) => {
          params.push(v)
          return `$${params.length}`
        })
        where.push(`${col} in (${slots.join(', ')})`)
        break
      }
      case 'like':
        params.push(`%${String(f.value)}%`)
        where.push(`${col}::text ilike $${params.length}`)
        break
      default: {
        const opSql = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op]
        params.push(f.value)
        where.push(`${col} ${opSql} $${params.length}`)
      }
    }
  }

  if (q.search && q.searchColumns && q.searchColumns.length > 0) {
    params.push(`%${q.search}%`)
    const slot = `$${params.length}`
    const parts = q.searchColumns.map((c) => `coalesce(${ident(c)}::text, '') ilike ${slot}`)
    where.push(`(${parts.join(' or ')})`)
  }

  const whereSql = where.length > 0 ? ` where ${where.join(' and ')}` : ''
  const cols = q.columns && q.columns.length > 0 ? q.columns.map(ident).join(', ') : '*'
  const order = q.orderBy ? ` order by ${ident(q.orderBy)} ${q.orderDir === 'asc' ? 'asc' : 'desc'} nulls last` : ''
  const limit = q.limit != null ? ` limit ${Number(q.limit)}` : ''
  const offset = q.offset ? ` offset ${Number(q.offset)}` : ''

  return {
    sql: `select ${cols} from ${ident(q.table)}${whereSql}${order}${limit}${offset}`,
    countSql: `select count(*)::int as total from ${ident(q.table)}${whereSql}`,
    params,
  }
}

function normalise(value: unknown): unknown {
  if (value === '' || value === undefined) return null
  return value
}

export async function insertRow(
  db: MineDb,
  table: string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined)
  if (entries.length === 0) throw new Error('Nothing to insert')
  const cols = entries.map(([k]) => ident(k))
  const params = entries.map(([, v]) => normalise(v))
  const slots = params.map((_, i) => `$${i + 1}`)
  const res = await db.query<Record<string, unknown>>(
    `insert into ${ident(table)} (${cols.join(', ')}) values (${slots.join(', ')}) returning *`,
    params,
  )
  notifyChange(table)
  return res.rows[0]
}

export async function updateRow(
  db: MineDb,
  table: string,
  id: number | string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined)
  if (entries.length === 0) throw new Error('Nothing to update')
  const params = entries.map(([, v]) => normalise(v))
  const sets = entries.map(([k], i) => `${ident(k)} = $${i + 1}`)
  params.push(id)
  const res = await db.query<Record<string, unknown>>(
    `update ${ident(table)} set ${sets.join(', ')} where id = $${params.length} returning *`,
    params,
  )
  notifyChange(table)
  return res.rows[0]
}

export async function deleteRow(db: MineDb, table: string, id: number | string): Promise<void> {
  await db.query(`delete from ${ident(table)} where id = $1`, [id])
  notifyChange(table)
}

export async function fetchRow<T = Record<string, unknown>>(
  db: MineDb,
  table: string,
  id: number | string,
): Promise<T | null> {
  const res = await db.query<T>(`select * from ${ident(table)} where id = $1`, [id])
  return res.rows[0] ?? null
}

/** Writes an audit trail entry. Called by the generic CRUD layer. */
export async function writeAudit(
  db: MineDb,
  orgId: number,
  entity: string,
  entityId: number | null,
  action: string,
  actor: string,
  summary: string,
): Promise<void> {
  await db.query(
    `insert into audit_log (org_id, entity, entity_id, action, actor, summary)
     values ($1, $2, $3, $4, $5, $6)`,
    [orgId, entity, entityId, action, actor, summary],
  )
}

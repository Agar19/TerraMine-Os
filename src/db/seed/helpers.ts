import type { MineDb } from '../client'

/**
 * Batched multi-row insert.
 *
 * Postgres caps a statement at 65535 bind parameters, but very large
 * bind messages are also the fastest way to desynchronise the PGlite
 * wire protocol, so chunk conservatively on parameter count (not row
 * count) and keep each statement in the low thousands of values.
 */
const MAX_PARAMS_PER_STATEMENT = 4000

export async function insertMany(
  db: MineDb,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return
  const maxRows = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columns.length))
  for (let i = 0; i < rows.length; i += maxRows) {
    const slice = rows.slice(i, i + maxRows)
    const params: unknown[] = []
    const tuples = slice.map(
      (row) =>
        `(${row
          .map((value) => {
            params.push(value === undefined ? null : value)
            return `$${params.length}`
          })
          .join(',')})`,
    )
    await db.query(
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`,
      params,
    )
  }
}

/** Identity columns start at 1, so a table seeded in one pass has ids 1..n. */
export function idRange(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => i + 1 + offset)
}

export function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0')
}

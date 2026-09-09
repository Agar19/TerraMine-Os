import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useDb } from './provider'

/* ------------------------------------------------------------------
   A tiny change bus. Any write bumps a version number for the tables it
   touched; hooks watching those tables refetch. This keeps every open
   screen consistent without pushing a full client-side cache library
   into the bundle, and it maps cleanly onto Supabase realtime later
   (swap `notifyChange` for a postgres_changes subscription).
------------------------------------------------------------------- */

let version = 0
const subscribers = new Set<() => void>()

export function notifyChange(..._tables: string[]): void {
  version += 1
  for (const fn of subscribers) fn()
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

function getVersion() {
  return version
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

export interface QueryState<T> {
  rows: T[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Runs a parameterised query and re-runs it whenever the SQL, the
 * parameters, or the global data version change.
 */
export function useSql<T = Record<string, unknown>>(
  sql: string | null,
  params: unknown[] = [],
  options: { skip?: boolean } = {},
): QueryState<T> {
  const db = useDb()
  const dataVersion = useDataVersion()
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const paramKey = JSON.stringify(params ?? [])
  const latest = useRef(0)

  const skip = options.skip || !sql

  useEffect(() => {
    if (!db || skip) {
      if (skip) setLoading(false)
      return
    }
    const ticket = ++latest.current
    let active = true
    setLoading(true)
    db.query<T>(sql as string, JSON.parse(paramKey) as unknown[])
      .then((res) => {
        if (!active || ticket !== latest.current) return
        setRows(res.rows)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setRows([])
      })
      .finally(() => {
        if (active && ticket === latest.current) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [db, sql, paramKey, dataVersion, nonce, skip])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])
  return { rows, loading, error, refetch }
}

/** Convenience wrapper for queries that return a single summary row. */
export function useSqlOne<T = Record<string, unknown>>(
  sql: string | null,
  params: unknown[] = [],
  options: { skip?: boolean } = {},
): { row: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const { rows, loading, error, refetch } = useSql<T>(sql, params, options)
  return { row: rows[0] ?? null, loading, error, refetch }
}

export interface MutationState {
  run: (sql: string, params?: unknown[]) => Promise<void>
  running: boolean
  error: string | null
}

export function useMutation(): MutationState {
  const db = useDb()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (sql: string, params: unknown[] = []) => {
      if (!db) throw new Error('Database is not ready yet')
      setRunning(true)
      setError(null)
      try {
        await db.query(sql, params)
        notifyChange()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        throw new Error(message)
      } finally {
        setRunning(false)
      }
    },
    [db],
  )

  return { run, running, error }
}

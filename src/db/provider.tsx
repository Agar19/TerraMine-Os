import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getDb, onBootStatus, type BootStatus, type MineDb } from './client'

interface DbContextValue {
  db: MineDb | null
  status: BootStatus
}

const DbContext = createContext<DbContextValue>({
  db: null,
  status: { phase: 'idle', message: '', progress: 0 },
})

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<MineDb | null>(null)
  const [status, setStatus] = useState<BootStatus>({ phase: 'idle', message: '', progress: 0 })

  useEffect(() => {
    const off = onBootStatus(setStatus)
    let cancelled = false
    getDb()
      .then((ready) => {
        if (!cancelled) setDb(ready)
      })
      .catch(() => {
        /* surfaced through boot status */
      })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const value = useMemo(() => ({ db, status }), [db, status])
  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDbContext() {
  return useContext(DbContext)
}

export function useDb(): MineDb | null {
  return useContext(DbContext).db
}

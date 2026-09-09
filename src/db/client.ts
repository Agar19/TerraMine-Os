import { PGlite } from '@electric-sql/pglite'
import { live, type LiveNamespace } from '@electric-sql/pglite/live'
import { migrations } from './migrations'
import { seedDatabase } from './seed/seed'

export type MineDb = PGlite & { live: LiveNamespace }

export type BootPhase = 'idle' | 'starting' | 'migrating' | 'seeding' | 'ready' | 'error'

export interface BootStatus {
  phase: BootPhase
  message: string
  progress: number
  error?: string
}

const DB_NAME = 'idb://terra-mine-os'

let instance: MineDb | null = null
let booting: Promise<MineDb> | null = null

type Listener = (status: BootStatus) => void
const listeners = new Set<Listener>()
let current: BootStatus = { phase: 'idle', message: 'Waiting to start', progress: 0 }

export function onBootStatus(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}

function report(phase: BootPhase, message: string, progress: number, error?: string) {
  current = { phase, message, progress, error }
  for (const fn of listeners) fn(current)
}

/**
 * Boots the embedded Postgres, applies pending migrations and seeds a
 * demo dataset the first time round. Safe to call from many places —
 * the same promise is handed back to every caller.
 */
export function getDb(): Promise<MineDb> {
  if (instance) return Promise.resolve(instance)
  if (booting) return booting

  booting = (async () => {
    report('starting', 'Starting embedded Postgres engine', 5)
    const db = (await PGlite.create(DB_NAME, {
      extensions: { live },
      relaxedDurability: true,
    })) as MineDb

    await db.exec(`
      create table if not exists schema_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      );
    `)

    const applied = await db.query<{ name: string }>('select name from schema_migrations')
    const done = new Set(applied.rows.map((r) => r.name))
    const pending = migrations.filter((m) => !done.has(m.name))

    if (pending.length > 0) {
      let i = 0
      for (const migration of pending) {
        i += 1
        report(
          'migrating',
          `Applying ${migration.name} (${i}/${pending.length})`,
          10 + Math.round((i / pending.length) * 45),
        )
        try {
          await db.exec(migration.sql)
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          throw new Error(`Migration ${migration.name} failed: ${detail}`)
        }
        await db.query('insert into schema_migrations (name) values ($1)', [migration.name])
      }
    }

    const orgs = await db.query<{ count: number }>('select count(*)::int as count from orgs')
    if ((orgs.rows[0]?.count ?? 0) === 0) {
      await seedDatabase(db, (message, pct) => report('seeding', message, 55 + Math.round(pct * 0.44)))
    }

    report('ready', 'Ready', 100)
    instance = db
    return db
  })()

  booting.catch((err: unknown) => {
    booting = null
    report('error', 'Startup failed', 0, err instanceof Error ? err.message : String(err))
  })

  return booting
}

/** Wipes local storage and rebuilds from migrations + seed. */
export async function resetDatabase(): Promise<void> {
  if (instance) {
    await instance.close()
    instance = null
  }
  booting = null
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('/pglite/terra-mine-os')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
  window.location.reload()
}

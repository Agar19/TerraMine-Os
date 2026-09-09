import { AlertTriangle } from 'lucide-react'
import type { BootStatus } from '@/db/client'
import { resetDatabase } from '@/db/client'
import { Button } from '@/components/ui/primitives'

const STEPS = [
  'Starting the embedded Postgres engine',
  'Applying the schema',
  'Generating six months of operating history',
  'Ready',
]

export function BootScreen({ status }: { status: BootStatus }) {
  const failed = status.phase === 'error'

  return (
    <div className="grid h-full place-items-center bg-bg p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-lg text-accent-fg">⛏</span>
          <div>
            <h1 className="text-base font-semibold text-ink">Terra Mine OS</h1>
            <p className="text-xs text-muted">Enterprise platform for gold, coal and base-metal operations</p>
          </div>
        </div>

        {failed ? (
          <div className="rounded-card bg-elevated p-4 ring-1 ring-danger/30">
            <p className="flex items-center gap-2 text-sm font-medium text-danger">
              <AlertTriangle className="size-4" /> Startup failed
            </p>
            <p className="mt-2 break-words font-mono text-2xs text-muted">{status.error}</p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => void resetDatabase()}>
              Reset local database and reload
            </Button>
          </div>
        ) : (
          <div className="rounded-card bg-elevated p-4 ring-1 ring-line shadow-[var(--shadow-card)]">
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.max(4, status.progress)}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-medium text-ink">{status.message || 'Preparing'}</p>
            <ul className="mt-3 space-y-1">
              {STEPS.map((step, i) => {
                const threshold = [0, 10, 55, 100][i]
                const done = status.progress > threshold + 5
                const current = !done && status.progress >= threshold
                return (
                  <li
                    key={step}
                    className={
                      done ? 'text-2xs text-ok' : current ? 'text-2xs text-ink' : 'text-2xs text-subtle'
                    }
                  >
                    {done ? '✓' : current ? '›' : '·'} {step}
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-2xs text-subtle">
              Postgres is running in this browser tab through PGlite (WebAssembly). Everything is stored
              locally in IndexedDB — the same schema and queries move to Supabase without changes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

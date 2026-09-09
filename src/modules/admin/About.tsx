import { Link } from 'react-router-dom'
import { Database, Keyboard, Layers, Puzzle, ShieldCheck } from 'lucide-react'
import { useSql } from '@/db/hooks'
import { num } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/primitives'
import { PageHeader } from '@/components/layout/PageHeader'
import { ENTITIES } from '@/registry/entities'
import { ALL_NAV_ITEMS, NAV } from '@/registry/navigation'

const MODULES = [
  ['Mining operations', 'Shift production capture, mine plans, drill and blast, explosives control, haulage, stockpiles, ventilation, gas monitoring, ground support and dewatering.'],
  ['Geology and resources', 'Exploration projects, drill programmes, downhole logging, sampling with QAQC, the assay laboratory pipeline, block model, JORC statements, geotechnical monitoring and survey reconciliation.'],
  ['Processing', 'Plant and circuit register, daily metallurgical accounting, reagent consumption, stream sampling, the gold room, product specification and tailings storage surveillance.'],
  ['Assets and maintenance', 'Asset register, meter readings, preventive strategies, work orders with tasks and parts, downtime, fuel, tyres and pre-start inspections.'],
  ['Workforce', 'Employees and contractors, crews and shift patterns, attendance, the statutory tag board, competencies, training, leave, occupational health, payroll and employee relations.'],
  ['Health and safety', 'Incidents and investigations, corrective actions, hazard register and risk assessments, behavioural observations, permits to work, inspections, toolbox talks, PPE and emergency drills.'],
  ['Environment and community', 'Licence monitoring, water balance, energy and emissions, waste, rehabilitation and community engagement including grievances.'],
  ['Supply chain', 'Item catalogue, warehouses and stock, movements, requisition to purchase order to goods receipt to invoice, and supplier performance.'],
  ['Sales and logistics', 'Customers, offtake contracts, sales orders, weighbridge, shipments with quality, receivables and royalties.'],
  ['Cost and performance', 'Cost entries coded to centre and driver, budgets and phasing, unit cost reporting and the KPI framework.'],
  ['Compliance and governance', 'Tenements, regulatory obligations, audits and findings, and controlled documents — all feeding one compliance calendar.'],
] as const

export default function About() {
  const counts = useSql<{ tables: number; views: number; rows: number }>(`
    select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r') as tables,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v') as views,
      (select coalesce(sum(n_live_tup), 0)::int from pg_stat_user_tables) as rows
  `)
  const c = counts.rows[0]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="About this platform"
        description="Terra Mine OS is an enterprise resource platform for gold, coal and base-metal operations — from the drill hole to the shipped tonne."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Modules" value={num(NAV.length)} />
        <Tile label="Screens" value={num(ALL_NAV_ITEMS.length)} />
        <Tile label="Registered entities" value={num(ENTITIES.length)} />
        <Tile label="Tables and views" value={`${num(c?.tables)} / ${num(c?.views)}`} />
        <Tile label="Rows in the demo" value={num(c?.rows)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What is covered" icon={<Layers className="size-4" />} />
          <dl className="flex flex-col gap-3">
            {MODULES.map(([title, body]) => (
              <div key={title}>
                <dt className="text-xs font-semibold text-ink">{title}</dt>
                <dd className="mt-0.5 text-xs text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="How it is built" icon={<Database className="size-4" />} />
            <ul className="flex flex-col gap-2 text-xs text-muted">
              <li>
                <span className="font-medium text-ink">Postgres in the browser.</span> PGlite runs a real Postgres
                compiled to WebAssembly, persisted to IndexedDB. Same SQL, same types, same constraints as production.
              </li>
              <li>
                <span className="font-medium text-ink">Versioned migrations.</span> Plain <code className="font-mono text-2xs">.sql</code>{' '}
                files applied in order and recorded in <code className="font-mono text-2xs">schema_migrations</code>.
              </li>
              <li>
                <span className="font-medium text-ink">A reporting layer.</span> Sixteen views define every metric once,
                so a number means the same thing on every screen.
              </li>
              <li>
                <span className="font-medium text-ink">React, TypeScript, Tailwind.</span> Strict types throughout, a
                token-driven design system and light and dark themes from one palette.
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Schema-driven screens" icon={<Puzzle className="size-4" />} />
            <p className="text-xs text-muted">
              List and form screens read the live Postgres catalog — column types, check constraints and foreign keys —
              and build themselves. A new table gets a working screen from a handful of lines in the entity registry,
              and a form can never drift from the database that backs it.
            </p>
            <Link to="/admin/data" className="mt-2 inline-block text-2xs text-accent hover:underline">
              Browse the schema →
            </Link>
          </Card>

          <Card>
            <CardHeader title="Keyboard" icon={<Keyboard className="size-4" />} />
            <ul className="flex flex-col gap-1.5 text-xs text-muted">
              <li className="flex items-center justify-between">
                <span>Jump to any screen</span>
                <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-2xs">Ctrl K</kbd>
              </li>
              <li className="flex items-center justify-between">
                <span>Run a query in the console</span>
                <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-2xs">Ctrl ⏎</kbd>
              </li>
              <li className="flex items-center justify-between">
                <span>Close a dialog</span>
                <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-2xs">Esc</kbd>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Data protection and tenancy" icon={<ShieldCheck className="size-4" />} />
        <p className="text-xs text-muted">
          Every table carries an <code className="font-mono text-2xs">org_id</code> and every foreign key is indexed, so
          row level security policies are single-column and cheap. The policies ship in{' '}
          <code className="font-mono text-2xs">supabase/rls.sql</code> and are deliberately not applied to the local
          demo, where there is one tenant and no authentication layer. Personal data — identity numbers, bank details,
          medical outcomes — is separated so it can be restricted by role once real authentication is wired in.
        </p>
      </Card>
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

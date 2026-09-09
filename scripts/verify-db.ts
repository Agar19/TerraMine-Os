/**
 * Applies every migration and the full seed against an in-memory PGlite,
 * then prints row counts and exercises each reporting view.
 *
 *   npm run verify:db
 *
 * This is the fast feedback loop for schema changes: it fails loudly on
 * bad SQL long before the browser ever boots.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { seedDatabase } from '../src/db/seed/seed'
import type { MineDb } from '../src/db/client'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'src', 'db', 'migrations')

async function main() {
  const t0 = Date.now()
  const db = (await PGlite.create()) as unknown as MineDb

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
    try {
      await db.exec(sql)
      process.stdout.write(`  applied ${file}\n`)
    } catch (err) {
      console.error(`\nFAILED in ${file}:\n${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  }

  const tMigrated = Date.now()
  const probe = await db.query<{ n: number }>(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`,
  )
  console.log(`\nMigrations applied in ${((tMigrated - t0) / 1000).toFixed(1)}s (${probe.rows[0]?.n} tables)\n`)

  try {
    await seedDatabase(db, (message, pct) => {
      process.stdout.write(`  [${String(Math.round(pct * 100)).padStart(3)}%] ${message}\n`)
    })
  } catch (err) {
    console.error(`\nSEED FAILED:\n${err instanceof Error ? err.stack : String(err)}`)
    process.exit(1)
  }
  const tSeeded = Date.now()
  console.log(`\nSeeded in ${((tSeeded - tMigrated) / 1000).toFixed(1)}s\n`)

  const tables = await db.query<{ table_name: string; kind: string }>(`
    select c.relname as table_name, case c.relkind when 'r' then 'table' else 'view' end as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v')
    order by c.relkind, c.relname
  `)

  let totalRows = 0
  const empty: string[] = []
  const rows: string[] = []
  for (const { table_name, kind } of tables.rows) {
    const res = await db.query<{ n: number }>(`select count(*)::int as n from "${table_name}"`)
    const n = res.rows[0]?.n ?? 0
    if (kind === 'table') {
      totalRows += n
      if (n === 0 && table_name !== 'schema_migrations') empty.push(table_name)
    }
    rows.push(`${kind === 'view' ? 'view ' : '     '}${table_name.padEnd(34)} ${String(n).padStart(9)}`)
  }
  console.log(rows.join('\n'))
  console.log(`\n${tables.rows.length} relations, ${totalRows.toLocaleString()} rows in tables.`)
  if (empty.length > 0) console.log(`\nEmpty tables: ${empty.join(', ')}`)

  // Spot-check the headline numbers a dashboard would show.
  const checks: [string, string][] = [
    ['Production last 30d (t)', `select round(sum(total_tonnes)) v from v_production_daily where record_date >= current_date - 30`],
    ['Open work orders', `select count(*) v from work_orders where status not in ('completed','verified','cancelled')`],
    ['Fleet availability 30d (%)', `select round(avg(availability_30d_pct), 1) v from v_asset_status`],
    ['Recordables last 12m', `select sum(recordables) v from v_safety_monthly where month >= current_date - 365`],
    ['TRIFR latest month', `select trifr v from v_safety_rates order by month desc limit 1`],
    ['Overdue actions', `select count(*) v from v_open_actions where urgency = 'overdue'`],
    ['Underground right now', `select count(*) v from v_personnel_underground`],
    ['Stock lines to reorder', `select count(*) v from v_stock_alerts where stock_status in ('reorder','stockout')`],
    ['Competencies expiring 30d', `select count(*) v from v_competency_expiry where expiry_status = 'expiring_30d'`],
    ['Plant recovery avg (%)', `select round(avg(recovery_pct), 2) v from v_plant_performance where recovery_pct is not null`],
    ['Cost per tonne (latest)', `select round(avg(cost_per_tonne_moved), 2) v from v_cost_per_tonne where cost_per_tonne_moved is not null`],
    ['Compliance items due 90d', `select count(*) v from v_compliance_calendar where due_on between current_date - 30 and current_date + 90`],
    ['Plan attainment avg (%)', `select round(avg(attainment_pct), 1) v from v_plan_vs_actual where attainment_pct is not null`],
    ['Maintenance overdue', `select count(*) v from v_maintenance_due where due_status = 'overdue'`],
    ['Downtime pareto rows', `select count(*) v from v_downtime_pareto`],
    ['Budget variance rows', `select count(*) v from v_budget_variance`],
  ]
  console.log('\nView spot checks')
  for (const [label, sql] of checks) {
    try {
      const res = await db.query<{ v: unknown }>(sql)
      console.log(`  ${label.padEnd(30)} ${String(res.rows[0]?.v ?? 'null')}`)
    } catch (err) {
      console.error(`  ${label.padEnd(30)} FAILED: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
    }
  }
  console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main()

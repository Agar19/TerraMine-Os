/**
 * Checks every entity in the registry against the real schema: the table
 * exists, and every column named in listColumns, filterColumns,
 * searchColumns and defaultSort is a real column on it.
 *
 *   npm run verify:registry
 *
 * Catches the failure mode that a typed registry cannot — a column name
 * that was renamed in a migration but not in the screen definition.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { ENTITIES } from '../src/registry/entities'
import { NAV } from '../src/registry/navigation'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'src', 'db', 'migrations')

async function main() {
  const db = await PGlite.create()
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }

  const cols = await db.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  )
  const byTable = new Map<string, Set<string>>()
  for (const row of cols.rows) {
    const set = byTable.get(row.table_name) ?? new Set<string>()
    set.add(row.column_name)
    byTable.set(row.table_name, set)
  }

  const problems: string[] = []

  for (const entity of ENTITIES) {
    const columns = byTable.get(entity.table)
    if (!columns) {
      problems.push(`${entity.slug}: table "${entity.table}" does not exist`)
      continue
    }
    const check = (names: string[] | undefined, where: string) => {
      for (const name of names ?? []) {
        if (!columns.has(name)) problems.push(`${entity.slug}: ${where} references missing column "${name}"`)
      }
    }
    check(entity.listColumns, 'listColumns')
    check(entity.filterColumns, 'filterColumns')
    check(entity.searchColumns, 'searchColumns')
    check(entity.defaultSort ? [entity.defaultSort.column] : [], 'defaultSort')

    // Every list query the app runs, executed for real.
    try {
      await db.query(
        `select ${entity.listColumns.join(', ')} from ${entity.table} order by ${
          entity.defaultSort?.column ?? 'id'
        } ${entity.defaultSort?.dir ?? 'desc'} nulls last limit 1`,
      )
    } catch (err) {
      problems.push(`${entity.slug}: list query failed — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Every navigation target must resolve to a route the app can render.
  const slugs = new Set(ENTITIES.map((e) => e.slug))
  const staticRoutes = new Set([
    '/', '/scorecard', '/alerts', '/operations', '/geology', '/processing', '/maintenance',
    '/workforce', '/safety', '/environment', '/supply', '/commercial', '/finance', '/compliance',
    '/admin/data', '/admin/sql', '/admin/about',
  ])
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to.startsWith('/m/')) {
        if (!slugs.has(item.to.slice(3))) problems.push(`nav: "${item.label}" points at unknown entity ${item.to}`)
      } else if (!staticRoutes.has(item.to)) {
        problems.push(`nav: "${item.label}" points at unknown route ${item.to}`)
      }
    }
  }

  // Entities that exist but are unreachable from the sidebar.
  const linked = new Set(
    NAV.flatMap((g) => g.items).filter((i) => i.to.startsWith('/m/')).map((i) => i.to.slice(3)),
  )
  for (const slug of slugs) {
    if (!linked.has(slug)) problems.push(`nav: entity "${slug}" is not linked from any menu`)
  }

  console.log(`${ENTITIES.length} entities, ${NAV.flatMap((g) => g.items).length} navigation items checked.`)
  if (problems.length === 0) {
    console.log('All registry definitions match the schema.')
  } else {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exitCode = 1
  }
}

main()

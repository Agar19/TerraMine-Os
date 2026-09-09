// Migrations are plain .sql files, applied once each, in filename order.
// Adding a file is all it takes to ship a schema change — the runner
// records what it has applied in `schema_migrations`.
const modules = import.meta.glob('./*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

export interface Migration {
  name: string
  sql: string
}

export const migrations: Migration[] = Object.entries(modules)
  .map(([path, sql]) => ({ name: path.replace(/^\.\//, ''), sql }))
  .sort((a, b) => a.name.localeCompare(b.name))

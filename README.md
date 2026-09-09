# Terra Mine OS

An enterprise resource platform for mining operations — gold, coal, copper, iron ore and the rest.
It covers the operation from the drill hole to the shipped tonne: production, geology, processing,
maintenance, workforce, safety, environment, supply chain, sales, cost and compliance.

The whole thing runs in the browser. Postgres itself is compiled to WebAssembly
([PGlite](https://pglite.dev)) and stored in IndexedDB, so there is no server to install and
nothing to configure — but the schema, the SQL and the query layer are the ones you would deploy
to Supabase, unchanged.

```bash
npm install
npm run dev          # http://localhost:5173
```

The first load applies the migrations and generates about six months of operating history
(~130,000 rows across 129 tables). It takes a few seconds; after that the database persists in the
browser.

---

## What is in it

| Module | Covers |
|---|---|
| **Mining operations** | Shift production capture, mine plans and attainment, underground development, drill patterns and production drilling, the blast register, explosives magazines with statutory balances, haulage cycles, stockpiles, ventilation, gas monitoring, ground support, dewatering |
| **Geology and resources** | Exploration projects, drill programmes, drillholes with downhole surveys, geological logging, sampling with QAQC insertion, the assay laboratory pipeline, coal quality, the block model, JORC resource and reserve statements, geotechnical monitoring, survey reconciliation |
| **Processing** | Plant and circuit register, daily metallurgical accounting, reagent consumption, stream sampling, the gold room and bullion settlement, product specifications, quality against spec, tailings storage facilities and surveillance |
| **Assets and maintenance** | Asset register (mobile and fixed), meter readings, preventive maintenance strategies, work orders with tasks and parts, downtime with cause analysis, fuel, tyres, pre-start inspections, failure codes |
| **Workforce** | Employees and contractors, crews and shift patterns, shifts, attendance, the statutory tag board, competencies and expiry, training, leave, occupational health, payroll, employee relations |
| **Health and safety** | Incidents and investigations, corrective actions, the hazard register and risk assessments, behavioural observations, permits to work, HSE inspections, toolbox talks, PPE, emergency drills |
| **Environment and community** | Licence monitoring against limits, water balance, energy and emissions, waste, rehabilitation, community engagement and grievances |
| **Supply chain** | Item catalogue, warehouses and stock, movements, requisition → purchase order → goods receipt → invoice, supplier performance |
| **Sales and logistics** | Customers, offtake contracts, sales orders, weighbridge, shipments with delivered quality, receivables, royalties, commodity price marks |
| **Cost and performance** | Cost entries coded to centre and physical driver, budgets and phasing, unit cost, the KPI framework |
| **Compliance and governance** | Tenements, regulatory obligations, audits and findings, controlled documents — all feeding one compliance calendar |

Around ninety screens in total: thirteen analytical dashboards and a registered entity screen for
every table worth editing.

---

## How it is built

**Postgres first.** The schema is eleven versioned `.sql` migrations under `src/db/migrations/`,
applied in filename order and recorded in `schema_migrations`. Conventions throughout: lowercase
snake_case, `bigint generated always as identity` primary keys, `text` with check constraints
instead of enums, `timestamptz` for every instant, `numeric` for anything measured or paid for, and
an index on every foreign key.

**One definition per metric.** Sixteen reporting views (`011_views.sql`) define production,
availability, frequency rates, unit cost, stock exposure and the compliance calendar. Dashboards
read the views, never the raw tables, so a number means the same thing on every screen.

**Screens that read the catalog.** Rather than restating 129 tables in TypeScript, the generic list
and form layer asks Postgres what a table looks like — column types, the allowed values baked into
each check constraint, foreign keys — and builds itself (`src/db/introspect.ts`). The entity
registry (`src/registry/entities.ts`) only makes presentation choices: which columns lead the list,
what can be filtered, how the screen is named. A form can never drift from the database behind it.

**Design system.** Tailwind v4 with a single token layer driving light and dark. Charts are
hand-rolled SVG (`src/components/charts/`) so every chart on the platform shares one set of marks,
one hover behaviour and one categorical palette — assigned in fixed slot order and validated for
colour-vision deficiency, so a series keeps its colour when a filter changes the series count.

```
src/
  db/
    migrations/     eleven .sql files — the schema and the reporting views
    seed/           deterministic demo data generator
    client.ts       PGlite boot, migration runner
    hooks.ts        useSql / useMutation and the change bus
    introspect.ts   runtime schema introspection
    sql.ts          query builder and CRUD with identifier validation
  components/
    charts/         line, bar, ranked bars, donut, sparkline, heat strip
    data/           DataTable, EntityPage, schema-driven forms
    layout/         app shell, sidebar, command palette
    ui/             buttons, cards, badges, modals, stat cards
  modules/          the thirteen dashboards
  registry/         entity registry and navigation
supabase/
  rls.sql           row level security for the hosted deployment
```

---

## Moving to Supabase

The schema was written to port without edits.

1. Copy `src/db/migrations/*.sql` into `supabase/migrations/` and run `supabase db push`.
2. Apply `supabase/rls.sql`. Every table carries `org_id`, so tenant policies are single indexed
   column comparisons; helper functions live in a private schema and are wrapped in `(select …)` so
   they evaluate once per statement rather than once per row. Personal data — medical outcomes,
   payroll, employee relations — gets its own permission-gated policies.
3. Swap the transport. Replace the `db.query(sql, params)` call inside `src/db/hooks.ts` with a
   Supabase RPC or PostgREST call. Nothing above that layer changes, because every screen reads
   through the same hook.
4. Point `notifyChange()` at a `postgres_changes` subscription so open screens refresh from server
   changes instead of local writes.

---

## Commands

```bash
npm run dev          # dev server
npm run build        # typecheck + production build
npm run typecheck    # tsc only
npm run verify:db    # apply every migration + the full seed against a throwaway
                     # in-memory Postgres, then exercise all sixteen views
```

`npm run verify:db` is the fast feedback loop for schema work — it fails loudly on bad SQL long
before the browser boots, and prints row counts plus spot checks for the headline numbers.

---

## Notes on the demo data

The dataset is deterministic (seeded PRNG), so it looks the same on every machine — useful for
screenshots, training and support. It models four sites and six mines across gold, coal, copper and
iron ore, with about six months of shift-level history and every downstream record that hangs off
it: 2,172 shifts, 4,200 haulage cycles, 620 work orders, 340 incidents, 16,778 assay results and so
on. Dates are relative to today, so the dashboards are always current.

Some numbers are shaped to be realistic rather than random: production follows a weekday and
seasonal pattern, gas readings sit mostly in the normal band with a long tail into alarm, and
attainment on an in-progress month is measured against the plan pro-rated to days elapsed.

To start over, use **Configuration → Data and schema → Reset database**.

---

## Keyboard

| | |
|---|---|
| `Ctrl`/`Cmd` + `K` | jump to any screen |
| `Ctrl`/`Cmd` + `Enter` | run the query in the SQL console |
| `Esc` | close a dialog |
#   T e r r a M i n e - O s  
 
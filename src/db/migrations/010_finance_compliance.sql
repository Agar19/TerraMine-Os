-- =====================================================================
-- 010_finance_compliance.sql — budgets, actual costs, KPI framework,
-- tenements and licences, regulatory obligations, audits and findings.
-- =====================================================================

create table budgets (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  name          text not null,
  fiscal_year   int not null,
  version       text not null default 'v1',
  budget_type   text not null default 'operating' check (budget_type in ('operating','capital','exploration','closure','forecast')),
  total_amount  numeric(18,2),
  currency      text default 'USD',
  status        text not null default 'draft' check (status in ('draft','submitted','approved','locked','superseded')),
  approved_by   text,
  approved_at   timestamptz,
  unique (org_id, code)
);
create index budgets_org_idx on budgets (org_id, fiscal_year desc);
create index budgets_site_idx on budgets (site_id);

create table budget_lines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  budget_id     bigint not null references budgets(id) on delete cascade,
  cost_center_id bigint references cost_centers(id) on delete set null,
  account_code  text,
  description   text not null,
  period_month  int check (period_month between 1 and 12),
  amount        numeric(18,2) not null default 0,
  quantity      numeric(18,3),
  unit          text
);
create index budget_lines_org_idx on budget_lines (org_id);
create index budget_lines_budget_idx on budget_lines (budget_id);
create index budget_lines_cc_idx on budget_lines (cost_center_id);

-- Actual costs, coded to a cost centre and optionally to the physical
-- driver (tonnes, metres) that makes unit-cost reporting possible.
create table cost_entries (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  cost_center_id bigint references cost_centers(id) on delete set null,
  budget_id     bigint references budgets(id) on delete set null,
  entry_date    date not null,
  account_code  text,
  category      text not null check (category in ('labour','contractor','fuel','power','explosives','reagents','consumables','spares','maintenance','drilling','haulage','transport','royalty','insurance','rehabilitation','admin','depreciation','other')),
  cost_type     text not null default 'operating' check (cost_type in ('operating','capital','overhead')),
  description   text,
  amount        numeric(18,2) not null,
  currency      text default 'USD',
  driver_quantity numeric(18,3),
  driver_unit   text check (driver_unit in ('tonne_ore','tonne_waste','tonne_coal','bcm','metre','hour','oz','kwh','litre','each')),
  source_entity text,
  source_id     bigint,
  posted        boolean not null default true
);
create index cost_entries_org_idx on cost_entries (org_id, entry_date desc);
create index cost_entries_site_idx on cost_entries (site_id);
create index cost_entries_mine_idx on cost_entries (mine_id);
create index cost_entries_cc_idx on cost_entries (cost_center_id, entry_date desc);
create index cost_entries_budget_idx on cost_entries (budget_id);
create index cost_entries_category_idx on cost_entries (org_id, category, entry_date desc);

-- KPI definitions plus their targets and actuals: one framework serving
-- every dashboard so definitions never drift between modules.
create table kpi_definitions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  module        text not null check (module in ('production','processing','safety','environment','maintenance','workforce','supply','finance','commercial','geology')),
  unit          text,
  direction     text not null default 'higher_better' check (direction in ('higher_better','lower_better','target_band')),
  formula       text,
  frequency     text not null default 'monthly' check (frequency in ('shift','daily','weekly','monthly','quarterly','annual')),
  active        boolean not null default true,
  unique (org_id, code)
);
create index kpi_defs_org_idx on kpi_definitions (org_id);

create table kpi_values (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  kpi_id        bigint not null references kpi_definitions(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  period_start  date not null,
  period_end    date not null,
  target_value  numeric(18,4),
  actual_value  numeric(18,4),
  variance_pct  numeric(10,3),
  status        text check (status in ('on_target','watch','off_target','no_data')),
  commentary    text
);
create index kpi_values_org_idx on kpi_values (org_id, period_start desc);
create index kpi_values_kpi_idx on kpi_values (kpi_id, period_start desc);
create index kpi_values_site_idx on kpi_values (site_id);
create index kpi_values_mine_idx on kpi_values (mine_id);

-- ---------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------

create table tenements (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  tenement_no   text not null,
  name          text,
  tenement_type text not null check (tenement_type in ('exploration_licence','prospecting_right','mining_lease','mining_right','retention_licence','miscellaneous_licence','water_right','surface_right')),
  holder        text,
  granted_on    date,
  expires_on    date,
  area_km2      numeric(14,3),
  annual_rent   numeric(16,2),
  expenditure_commitment numeric(16,2),
  expenditure_to_date numeric(16,2) default 0,
  jurisdiction  text,
  status        text not null default 'granted' check (status in ('application','granted','renewal_pending','expired','surrendered','forfeited')),
  notes         text,
  unique (org_id, tenement_no)
);
create index tenements_org_idx on tenements (org_id);
create index tenements_site_idx on tenements (site_id);
create index tenements_expiry_idx on tenements (org_id, expires_on) where status = 'granted';

create table regulatory_obligations (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  tenement_id   bigint references tenements(id) on delete set null,
  reference     text not null,
  title         text not null,
  obligation_type text not null check (obligation_type in ('report','payment','inspection','monitoring','rehabilitation','training','permit_renewal','community','disclosure')),
  regulator     text,
  legislation   text,
  frequency     text check (frequency in ('once','monthly','quarterly','biannual','annual','on_event')),
  due_on        date,
  last_completed_on date,
  next_due_on   date,
  responsible   text,
  penalty_risk  text check (penalty_risk in ('low','medium','high','critical')),
  status        text not null default 'open' check (status in ('open','in_progress','submitted','completed','overdue','waived')),
  unique (org_id, reference)
);
create index obligations_org_idx on regulatory_obligations (org_id, next_due_on);
create index obligations_site_idx on regulatory_obligations (site_id);
create index obligations_tenement_idx on regulatory_obligations (tenement_id);
create index obligations_due_idx on regulatory_obligations (org_id, next_due_on) where status in ('open','in_progress');

create table audits (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  audit_no      text not null,
  title         text not null,
  audit_type    text not null check (audit_type in ('internal','external','regulatory','certification','contractor','financial','safety','environmental','tsf','iso14001','iso45001','icmm')),
  standard      text,
  auditor       text,
  planned_on    date,
  performed_on  date,
  scope         text,
  findings_count int default 0,
  major_findings int default 0,
  minor_findings int default 0,
  score_pct     numeric(5,2),
  result        text check (result in ('conformant','minor_non_conformance','major_non_conformance','failed','pending')),
  report_ref    text,
  status        text not null default 'planned' check (status in ('planned','in_progress','reporting','closed','cancelled')),
  unique (org_id, audit_no)
);
create index audits_org_idx on audits (org_id, performed_on desc);
create index audits_site_idx on audits (site_id);

create table audit_findings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  audit_id      bigint not null references audits(id) on delete cascade,
  finding_no    text not null,
  clause        text,
  severity      text not null default 'minor' check (severity in ('observation','opportunity','minor','major','critical')),
  description   text not null,
  evidence      text,
  responsible   text,
  due_on        date,
  closed_on     date,
  status        text not null default 'open' check (status in ('open','in_progress','closed','accepted_risk'))
);
create index findings_org_idx on audit_findings (org_id);
create index findings_audit_idx on audit_findings (audit_id);
create index findings_open_idx on audit_findings (org_id, due_on) where status <> 'closed';

-- Shift handover / statutory logbook entries.
create table shift_logs (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  logged_at     timestamptz not null default now(),
  log_type      text not null default 'handover' check (log_type in ('handover','statutory','deviation','instruction','visitor','delay','general')),
  author        text,
  entry         text not null,
  requires_action boolean not null default false,
  acknowledged_by text,
  acknowledged_at timestamptz
);
create index shift_logs_org_idx on shift_logs (org_id, logged_at desc);
create index shift_logs_site_idx on shift_logs (site_id);
create index shift_logs_mine_idx on shift_logs (mine_id);
create index shift_logs_shift_idx on shift_logs (shift_id);

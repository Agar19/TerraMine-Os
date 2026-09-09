-- =====================================================================
-- 001_core.sql — tenancy, org structure, identity, reference data
-- Plain Postgres. Runs on PGlite today, on Supabase unchanged.
-- Conventions: lowercase snake_case, bigint identity PKs, text + check
-- constraints instead of enums, timestamptz everywhere, numeric for any
-- quantity that is measured or paid for, every FK indexed.
-- =====================================================================

create table orgs (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  name          text not null,
  country       text,
  currency      text not null default 'USD',
  timezone      text not null default 'UTC',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  logo_emoji    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A site is a licensed operation; it may contain several mines and plants.
create table sites (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  country       text,
  region        text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  elevation_m   numeric(8,2),
  timezone      text not null default 'UTC',
  status        text not null default 'operating' check (status in ('exploration','development','operating','care_maintenance','closure','rehabilitation')),
  commissioned_on date,
  workforce_target int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index sites_org_id_idx on sites (org_id);

-- Mines: the physical extraction operations inside a site.
create table mines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  code          text not null,
  name          text not null,
  commodity     text not null check (commodity in ('gold','coal','copper','iron_ore','bauxite','nickel','zinc','lead','silver','platinum','chrome','manganese','lithium','uranium','diamond','phosphate','tin','cobalt','rare_earth','sand_gravel','limestone')),
  mine_type     text not null check (mine_type in ('open_pit','underground','alluvial','placer','quarry','dredging','in_situ_leach','heap_leach','strip')),
  status        text not null default 'operating' check (status in ('planned','development','operating','suspended','closed')),
  depth_m       numeric(8,2),
  area_hectares numeric(10,2),
  life_of_mine_years numeric(5,2),
  opened_on     date,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index mines_org_id_idx on mines (org_id);
create index mines_site_id_idx on mines (site_id);
create index mines_commodity_idx on mines (commodity);

-- Mining areas: pits/benches open cut, shafts/levels/stopes underground,
-- seams/strips for coal. One recursive table keeps the hierarchy queryable.
create table mining_areas (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  parent_id     bigint references mining_areas(id) on delete cascade,
  code          text not null,
  name          text not null,
  area_type     text not null check (area_type in ('pit','bench','stage','shaft','decline','level','drive','stope','panel','longwall','seam','block','strip','heap','dump','ramp')),
  seam_name     text,
  rl_from_m     numeric(8,2),
  rl_to_m       numeric(8,2),
  status        text not null default 'active' check (status in ('planned','active','suspended','depleted','backfilled','rehabilitated')),
  strike_length_m numeric(10,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, mine_id, code)
);
create index mining_areas_org_id_idx on mining_areas (org_id);
create index mining_areas_mine_id_idx on mining_areas (mine_id);
create index mining_areas_parent_id_idx on mining_areas (parent_id);

create table departments (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  name          text not null,
  discipline    text check (discipline in ('mining','processing','engineering','geology','survey','hse','environment','hr','finance','supply','security','it','admin','community')),
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index departments_org_id_idx on departments (org_id);
create index departments_site_id_idx on departments (site_id);

create table cost_centers (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  name          text not null,
  category      text not null default 'operating' check (category in ('operating','capital','overhead','exploration','closure')),
  parent_id     bigint references cost_centers(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index cost_centers_org_id_idx on cost_centers (org_id);
create index cost_centers_site_id_idx on cost_centers (site_id);
create index cost_centers_parent_id_idx on cost_centers (parent_id);

-- ---------------------------------------------------------------------
-- Identity and access
-- ---------------------------------------------------------------------

create table roles (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  description   text,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index roles_org_id_idx on roles (org_id);

-- Permissions are "module:action" strings, e.g. production:approve.
create table role_permissions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  role_id       bigint not null references roles(id) on delete cascade,
  permission    text not null,
  unique (role_id, permission)
);
create index role_permissions_org_id_idx on role_permissions (org_id);
create index role_permissions_role_id_idx on role_permissions (role_id);

create table app_users (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  auth_uid      uuid,
  email         text not null,
  full_name     text not null,
  phone         text,
  job_title     text,
  site_id       bigint references sites(id) on delete set null,
  employee_id   bigint,
  status        text not null default 'active' check (status in ('active','suspended','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, email)
);
create index app_users_org_id_idx on app_users (org_id);
create index app_users_site_id_idx on app_users (site_id);
create index app_users_auth_uid_idx on app_users (auth_uid);

create table user_roles (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  user_id       bigint not null references app_users(id) on delete cascade,
  role_id       bigint not null references roles(id) on delete cascade,
  unique (user_id, role_id)
);
create index user_roles_org_id_idx on user_roles (org_id);
create index user_roles_user_id_idx on user_roles (user_id);
create index user_roles_role_id_idx on user_roles (role_id);

-- ---------------------------------------------------------------------
-- Cross-cutting: audit, documents, notifications, settings, prices
-- ---------------------------------------------------------------------

create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  entity        text not null,
  entity_id     bigint,
  action        text not null check (action in ('insert','update','delete','approve','reject','login','export','import')),
  actor         text,
  summary       text,
  diff          jsonb,
  at            timestamptz not null default now()
);
create index audit_log_org_id_at_idx on audit_log (org_id, at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);

create table documents (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  doc_number    text,
  title         text not null,
  doc_type      text not null default 'procedure' check (doc_type in ('procedure','policy','sop','permit','licence','drawing','report','certificate','contract','manual','form','plan')),
  discipline    text,
  version       text not null default '1.0',
  status        text not null default 'draft' check (status in ('draft','review','approved','superseded','archived')),
  owner         text,
  effective_on  date,
  review_due_on date,
  storage_path  text,
  entity        text,
  entity_id     bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index documents_org_id_idx on documents (org_id);
create index documents_site_id_idx on documents (site_id);
create index documents_entity_idx on documents (entity, entity_id);
create index documents_review_due_idx on documents (review_due_on) where status = 'approved';

create table notifications (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  user_id       bigint references app_users(id) on delete cascade,
  severity      text not null default 'info' check (severity in ('info','success','warning','critical')),
  title         text not null,
  body          text,
  link          text,
  entity        text,
  entity_id     bigint,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_org_user_idx on notifications (org_id, user_id, created_at desc);
create index notifications_unread_idx on notifications (org_id) where read_at is null;

create table settings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  scope         text not null default 'org',
  key           text not null,
  value         jsonb not null,
  updated_at    timestamptz not null default now(),
  unique (org_id, scope, key)
);

-- Commodity price marks used for revenue and stockpile valuation.
create table commodity_prices (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  commodity     text not null,
  price_date    date not null,
  price         numeric(14,4) not null,
  currency      text not null default 'USD',
  unit          text not null default 'oz' check (unit in ('oz','t','lb','kg','g','carat','bbl')),
  source        text,
  unique (org_id, commodity, price_date, unit)
);
create index commodity_prices_org_idx on commodity_prices (org_id, commodity, price_date desc);

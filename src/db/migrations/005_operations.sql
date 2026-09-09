-- =====================================================================
-- 005_operations.sql — the production engine: mine plans, shift
-- production, drill and blast, explosives control, haulage, stockpiles,
-- dispatch, dewatering, ventilation and gas monitoring.
-- =====================================================================

-- Budget / plan a period is measured against.
create table mine_plans (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  code          text not null,
  name          text not null,
  horizon       text not null default 'monthly' check (horizon in ('life_of_mine','five_year','annual','quarterly','monthly','weekly','shift')),
  period_start  date not null,
  period_end    date not null,
  ore_tonnes    numeric(18,3) default 0,
  waste_tonnes  numeric(18,3) default 0,
  coal_tonnes   numeric(18,3) default 0,
  strip_ratio   numeric(10,3),
  planned_grade numeric(12,4),
  grade_unit    text default 'g/t',
  development_metres numeric(12,2),
  drill_metres  numeric(12,2),
  budget_cost   numeric(18,2),
  status        text not null default 'draft' check (status in ('draft','approved','active','superseded','closed')),
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index mine_plans_org_idx on mine_plans (org_id);
create index mine_plans_mine_idx on mine_plans (mine_id, period_start desc);

-- One row per shift per source area per material: the atomic production fact.
create table production_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  plan_id       bigint references mine_plans(id) on delete set null,
  record_date   date not null,
  shift_type    text check (shift_type in ('day','night','afternoon')),
  material      text not null check (material in ('ore','waste','coal','overburden','interburden','topsoil','low_grade','marginal','development','backfill')),
  tonnes        numeric(16,3) not null default 0,
  volume_bcm    numeric(16,3),
  grade         numeric(12,4),
  grade_unit    text default 'g/t',
  ash_pct       numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  moisture_pct  numeric(6,3),
  contained_metal numeric(16,3),
  truck_loads   int,
  loader_asset_id bigint references assets(id) on delete set null,
  destination   text check (destination in ('rom_pad','crusher','plant','waste_dump','stockpile','heap_leach','washplant','backfill','rehandle','port')),
  destination_ref text,
  hauled_distance_km numeric(8,2),
  source_type   text not null default 'production' check (source_type in ('production','rehandle','contractor','reclaim')),
  approved      boolean not null default false,
  entered_by    text,
  created_at    timestamptz not null default now()
);
create index production_org_date_idx on production_records (org_id, record_date desc);
create index production_site_idx on production_records (site_id);
create index production_mine_date_idx on production_records (mine_id, record_date desc);
create index production_area_idx on production_records (mining_area_id);
create index production_shift_idx on production_records (shift_id);
create index production_plan_idx on production_records (plan_id);
create index production_loader_idx on production_records (loader_asset_id);
create index production_material_idx on production_records (org_id, material, record_date desc);

-- Underground development advance, metre by metre.
create table development_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  record_date   date not null,
  heading_code  text,
  advance_m     numeric(8,2) not null default 0,
  cumulative_m  numeric(10,2),
  face_area_m2  numeric(8,2),
  tonnes_broken numeric(14,3),
  support_installed text,
  bolts_installed int,
  mesh_sheets   int,
  shotcrete_m3  numeric(10,3),
  cycle_hours   numeric(6,2),
  crew_id       bigint references crews(id) on delete set null,
  comments      text
);
create index dev_records_org_idx on development_records (org_id, record_date desc);
create index dev_records_mine_idx on development_records (mine_id);
create index dev_records_area_idx on development_records (mining_area_id);
create index dev_records_shift_idx on development_records (shift_id);
create index dev_records_crew_idx on development_records (crew_id);

-- ---------------------------------------------------------------------
-- Drill and blast
-- ---------------------------------------------------------------------

create table drill_patterns (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  pattern_code  text not null,
  burden_m      numeric(6,2),
  spacing_m     numeric(6,2),
  hole_diameter_mm numeric(7,2),
  hole_depth_m  numeric(6,2),
  subdrill_m    numeric(6,2),
  stemming_m    numeric(6,2),
  bench_height_m numeric(6,2),
  hole_count    int,
  total_metres  numeric(12,2),
  rock_type     text,
  powder_factor_kg_t numeric(8,4),
  designed_by   text,
  status        text not null default 'designed' check (status in ('designed','marked','drilling','drilled','charged','fired','cancelled')),
  created_at    timestamptz not null default now(),
  unique (org_id, pattern_code)
);
create index drill_patterns_org_idx on drill_patterns (org_id);
create index drill_patterns_mine_idx on drill_patterns (mine_id);
create index drill_patterns_area_idx on drill_patterns (mining_area_id);

create table drilling_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  pattern_id    bigint references drill_patterns(id) on delete set null,
  asset_id      bigint references assets(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  record_date   date not null,
  holes_drilled int default 0,
  metres_drilled numeric(12,2) default 0,
  bit_size_mm   numeric(7,2),
  penetration_rate_m_h numeric(8,2),
  bits_consumed numeric(6,2),
  operator_employee_id bigint references employees(id) on delete set null,
  delays_hours  numeric(6,2),
  comments      text
);
create index drilling_org_idx on drilling_records (org_id, record_date desc);
create index drilling_mine_idx on drilling_records (mine_id);
create index drilling_pattern_idx on drilling_records (pattern_id);
create index drilling_asset_idx on drilling_records (asset_id);
create index drilling_shift_idx on drilling_records (shift_id);
create index drilling_operator_idx on drilling_records (operator_employee_id);

create table explosives_magazines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  code          text not null,
  name          text not null,
  magazine_type text not null check (magazine_type in ('bulk','packaged','detonator','day_box','mobile')),
  licence_no    text,
  licence_expiry date,
  capacity_kg   numeric(14,2),
  location      text,
  custodian_employee_id bigint references employees(id) on delete set null,
  status        text not null default 'active' check (status in ('active','suspended','decommissioned')),
  unique (org_id, code)
);
create index magazines_org_idx on explosives_magazines (org_id);
create index magazines_site_idx on explosives_magazines (site_id);
create index magazines_custodian_idx on explosives_magazines (custodian_employee_id);

create table explosives_transactions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  magazine_id   bigint not null references explosives_magazines(id) on delete cascade,
  transacted_at timestamptz not null default now(),
  direction     text not null check (direction in ('receipt','issue','return','destruction','transfer_in','transfer_out','stocktake_adjust')),
  product       text not null,
  product_class text check (product_class in ('anfo','emulsion','heavy_anfo','packaged','booster','detonator','detonating_cord','shock_tube','safety_fuse')),
  quantity      numeric(14,3) not null,
  unit          text not null default 'kg' check (unit in ('kg','ea','m','l')),
  blast_id      bigint,
  issued_to_employee_id bigint references employees(id) on delete set null,
  balance_after numeric(14,3),
  reference     text,
  recorded_by   text
);
create index expl_tx_org_idx on explosives_transactions (org_id, transacted_at desc);
create index expl_tx_magazine_idx on explosives_transactions (magazine_id, transacted_at desc);
create index expl_tx_employee_idx on explosives_transactions (issued_to_employee_id);
create index expl_tx_blast_idx on explosives_transactions (blast_id);

create table blasts (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  pattern_id    bigint references drill_patterns(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  blast_number  text not null,
  blast_type    text not null default 'production' check (blast_type in ('production','development','trim','pre_split','secondary','demolition','cast')),
  planned_at    timestamptz,
  fired_at      timestamptz,
  holes_charged int,
  total_explosive_kg numeric(14,2),
  detonators_used int,
  volume_bcm    numeric(16,3),
  tonnes_blasted numeric(16,3),
  powder_factor_kg_t numeric(8,4),
  max_instantaneous_charge_kg numeric(12,2),
  ppv_mm_s      numeric(10,3),
  air_blast_db  numeric(8,2),
  fragmentation_p80_mm numeric(10,2),
  flyrock_observed boolean not null default false,
  misfires      int default 0,
  exclusion_zone_m numeric(8,2),
  shotfirer_employee_id bigint references employees(id) on delete set null,
  clearance_confirmed boolean not null default false,
  status        text not null default 'planned' check (status in ('planned','charged','tied_in','fired','cleared','aborted')),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (org_id, blast_number)
);
create index blasts_org_idx on blasts (org_id, fired_at desc);
create index blasts_mine_idx on blasts (mine_id);
create index blasts_area_idx on blasts (mining_area_id);
create index blasts_pattern_idx on blasts (pattern_id);
create index blasts_shift_idx on blasts (shift_id);
create index blasts_shotfirer_idx on blasts (shotfirer_employee_id);

-- ---------------------------------------------------------------------
-- Material movement
-- ---------------------------------------------------------------------

create table haulage_cycles (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  truck_asset_id bigint references assets(id) on delete set null,
  loader_asset_id bigint references assets(id) on delete set null,
  operator_employee_id bigint references employees(id) on delete set null,
  cycle_start   timestamptz,
  cycle_end     timestamptz,
  source_area_id bigint references mining_areas(id) on delete set null,
  destination   text,
  material      text,
  payload_tonnes numeric(12,3),
  distance_km   numeric(8,3),
  queue_minutes numeric(8,2),
  load_minutes  numeric(8,2),
  haul_minutes  numeric(8,2),
  dump_minutes  numeric(8,2),
  return_minutes numeric(8,2),
  cycle_minutes numeric(8,2),
  fuel_litres   numeric(10,2)
);
create index haulage_org_idx on haulage_cycles (org_id, cycle_start desc);
create index haulage_mine_idx on haulage_cycles (mine_id);
create index haulage_shift_idx on haulage_cycles (shift_id);
create index haulage_truck_idx on haulage_cycles (truck_asset_id, cycle_start desc);
create index haulage_loader_idx on haulage_cycles (loader_asset_id);
create index haulage_operator_idx on haulage_cycles (operator_employee_id);
create index haulage_source_idx on haulage_cycles (source_area_id);

create table stockpiles (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  code          text not null,
  name          text not null,
  material      text not null check (material in ('ore','low_grade','waste','coal_raw','coal_product','coal_middlings','reject','concentrate','overburden','topsoil')),
  product_grade text,
  capacity_tonnes numeric(16,3),
  current_tonnes numeric(16,3) not null default 0,
  average_grade numeric(12,4),
  grade_unit    text default 'g/t',
  average_ash_pct numeric(6,3),
  average_cv_kcal_kg numeric(9,2),
  moisture_pct  numeric(6,3),
  location      text,
  status        text not null default 'active' check (status in ('active','sealed','depleted','quarantined')),
  last_surveyed_on date,
  unique (org_id, code)
);
create index stockpiles_org_idx on stockpiles (org_id);
create index stockpiles_site_idx on stockpiles (site_id);
create index stockpiles_mine_idx on stockpiles (mine_id);

create table stockpile_movements (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  stockpile_id  bigint not null references stockpiles(id) on delete cascade,
  shift_id      bigint references shifts(id) on delete set null,
  moved_at      timestamptz not null default now(),
  direction     text not null check (direction in ('in','out','adjustment','survey_correction')),
  tonnes        numeric(16,3) not null,
  grade         numeric(12,4),
  ash_pct       numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  source        text,
  destination   text,
  balance_after numeric(16,3),
  reference     text,
  recorded_by   text
);
create index sp_moves_org_idx on stockpile_movements (org_id, moved_at desc);
create index sp_moves_stockpile_idx on stockpile_movements (stockpile_id, moved_at desc);
create index sp_moves_shift_idx on stockpile_movements (shift_id);

-- ---------------------------------------------------------------------
-- Underground environment: ventilation, gas, water, ground support
-- ---------------------------------------------------------------------

create table ventilation_readings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  station_code  text not null,
  measured_at   timestamptz not null default now(),
  air_velocity_m_s numeric(8,3),
  cross_section_m2 numeric(8,2),
  air_quantity_m3_s numeric(10,3),
  dry_bulb_c    numeric(6,2),
  wet_bulb_c    numeric(6,2),
  humidity_pct  numeric(5,2),
  pressure_kpa  numeric(8,2),
  dust_mg_m3    numeric(8,3),
  compliant     boolean not null default true,
  measured_by   text
);
create index vent_org_idx on ventilation_readings (org_id, measured_at desc);
create index vent_mine_idx on ventilation_readings (mine_id, measured_at desc);
create index vent_area_idx on ventilation_readings (mining_area_id);

-- Gas monitoring is the single most safety-critical stream in coal.
create table gas_readings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  station_code  text not null,
  measured_at   timestamptz not null default now(),
  source        text not null default 'handheld' check (source in ('handheld','fixed_sensor','tube_bundle','telemetry','bag_sample')),
  ch4_pct       numeric(7,3),
  co_ppm        numeric(9,2),
  co2_pct       numeric(7,3),
  o2_pct        numeric(6,3),
  h2s_ppm       numeric(9,2),
  nox_ppm       numeric(9,2),
  so2_ppm       numeric(9,2),
  temperature_c numeric(6,2),
  graham_ratio  numeric(9,4),
  alarm_level   text not null default 'normal' check (alarm_level in ('normal','alert','alarm','trip','evacuate')),
  action_taken  text,
  measured_by   text
);
create index gas_org_idx on gas_readings (org_id, measured_at desc);
create index gas_mine_idx on gas_readings (mine_id, measured_at desc);
create index gas_area_idx on gas_readings (mining_area_id);
create index gas_alarm_idx on gas_readings (org_id, alarm_level) where alarm_level <> 'normal';

create table ground_support_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  installed_on  date not null,
  support_type  text not null check (support_type in ('rock_bolt','cable_bolt','mesh','shotcrete','fibrecrete','steel_set','timber','props','straps','w_strap','backfill')),
  quantity      numeric(12,2),
  unit          text,
  length_m      numeric(8,2),
  spacing_m     numeric(6,2),
  design_ref    text,
  pull_test_kn  numeric(10,2),
  qa_result     text check (qa_result in ('pass','fail','retest')),
  installed_by_crew_id bigint references crews(id) on delete set null,
  inspected_by  text
);
create index ground_support_org_idx on ground_support_records (org_id, installed_on desc);
create index ground_support_mine_idx on ground_support_records (mine_id);
create index ground_support_area_idx on ground_support_records (mining_area_id);
create index ground_support_crew_idx on ground_support_records (installed_by_crew_id);

create table dewatering_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  asset_id      bigint references assets(id) on delete set null,
  record_date   date not null,
  volume_pumped_m3 numeric(16,3),
  pump_hours    numeric(8,2),
  water_level_m numeric(10,2),
  discharge_point text,
  ph            numeric(5,2),
  turbidity_ntu numeric(10,2),
  recorded_by   text
);
create index dewatering_org_idx on dewatering_records (org_id, record_date desc);
create index dewatering_mine_idx on dewatering_records (mine_id);
create index dewatering_asset_idx on dewatering_records (asset_id);

-- =====================================================================
-- 004_geology.sql — exploration, drilling, logging, sampling, the assay
-- laboratory, and the resource/reserve statement that flows from them.
-- =====================================================================

create table exploration_projects (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  name          text not null,
  commodity     text,
  stage         text not null default 'greenfield' check (stage in ('greenfield','reconnaissance','target_generation','scoping','prefeasibility','feasibility','resource_definition','grade_control','brownfield')),
  area_km2      numeric(12,3),
  budget        numeric(16,2),
  spend_to_date numeric(16,2),
  start_date    date,
  end_date      date,
  geologist     text,
  status        text not null default 'active' check (status in ('planned','active','on_hold','completed','relinquished')),
  unique (org_id, code)
);
create index expl_projects_org_idx on exploration_projects (org_id);
create index expl_projects_site_idx on exploration_projects (site_id);

create table drill_programs (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  project_id    bigint references exploration_projects(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  code          text not null,
  name          text not null,
  purpose       text not null default 'resource_definition' check (purpose in ('exploration','resource_definition','grade_control','geotechnical','hydrogeological','metallurgical','blast_hole','dewatering','ventilation')),
  drill_method  text check (drill_method in ('diamond','rc','rab','aircore','auger','sonic','percussion')),
  planned_holes int,
  planned_metres numeric(12,2),
  actual_holes  int default 0,
  actual_metres numeric(12,2) default 0,
  cost_per_metre numeric(12,2),
  contractor_id bigint references contractors(id) on delete set null,
  start_date    date,
  end_date      date,
  status        text not null default 'planned' check (status in ('planned','in_progress','completed','suspended','cancelled')),
  unique (org_id, code)
);
create index drill_programs_org_idx on drill_programs (org_id);
create index drill_programs_project_idx on drill_programs (project_id);
create index drill_programs_mine_idx on drill_programs (mine_id);
create index drill_programs_contractor_idx on drill_programs (contractor_id);

create table drillholes (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  program_id    bigint references drill_programs(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  mining_area_id bigint references mining_areas(id) on delete set null,
  hole_id       text not null,
  hole_type     text not null default 'diamond' check (hole_type in ('diamond','rc','rab','aircore','auger','sonic','percussion','blast')),
  easting       numeric(12,3),
  northing      numeric(12,3),
  elevation_m   numeric(10,3),
  azimuth_deg   numeric(6,2) check (azimuth_deg between 0 and 360),
  dip_deg       numeric(6,2) check (dip_deg between -90 and 90),
  planned_depth_m numeric(10,2),
  final_depth_m numeric(10,2),
  drilled_from  date,
  drilled_to    date,
  core_size     text,
  recovery_pct  numeric(5,2) check (recovery_pct between 0 and 100),
  water_table_m numeric(10,2),
  logged_by     text,
  status        text not null default 'planned' check (status in ('planned','drilling','completed','abandoned','logged','sampled','assayed')),
  comments      text,
  created_at    timestamptz not null default now(),
  unique (org_id, hole_id)
);
create index drillholes_org_idx on drillholes (org_id);
create index drillholes_program_idx on drillholes (program_id);
create index drillholes_mine_idx on drillholes (mine_id);
create index drillholes_area_idx on drillholes (mining_area_id);
create index drillholes_status_idx on drillholes (org_id, status);

create table drillhole_surveys (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  drillhole_id  bigint not null references drillholes(id) on delete cascade,
  depth_m       numeric(10,2) not null,
  azimuth_deg   numeric(6,2),
  dip_deg       numeric(6,2),
  survey_method text,
  surveyed_at   timestamptz
);
create index dh_surveys_org_idx on drillhole_surveys (org_id);
create index dh_surveys_hole_idx on drillhole_surveys (drillhole_id, depth_m);

create table lithology_intervals (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  drillhole_id  bigint not null references drillholes(id) on delete cascade,
  from_m        numeric(10,2) not null,
  to_m          numeric(10,2) not null,
  lithology     text not null,
  alteration    text,
  mineralisation text,
  weathering    text check (weathering in ('fresh','slightly','moderately','highly','completely','transported')),
  rqd_pct       numeric(5,2) check (rqd_pct between 0 and 100),
  hardness      numeric(4,1),
  seam_name     text,
  colour        text,
  description   text,
  check (to_m > from_m)
);
create index litho_org_idx on lithology_intervals (org_id);
create index litho_hole_idx on lithology_intervals (drillhole_id, from_m);

create table sample_batches (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  batch_no      text not null,
  laboratory    text,
  sample_count  int default 0,
  dispatched_on date,
  received_on   date,
  results_on    date,
  status        text not null default 'open' check (status in ('open','dispatched','at_lab','results_received','validated','rejected')),
  turnaround_days int,
  cost          numeric(14,2),
  unique (org_id, batch_no)
);
create index sample_batches_org_idx on sample_batches (org_id);

create table samples (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  drillhole_id  bigint references drillholes(id) on delete set null,
  batch_id      bigint references sample_batches(id) on delete set null,
  mining_area_id bigint references mining_areas(id) on delete set null,
  sample_no     text not null,
  sample_type   text not null default 'core' check (sample_type in ('core','half_core','rc_chip','grab','channel','chip','bulk','stockpile','plant_feed','tailings','duplicate','standard','blank','environmental','water')),
  from_m        numeric(10,2),
  to_m          numeric(10,2),
  length_m      numeric(10,2),
  weight_kg     numeric(10,3),
  collected_on  date,
  collected_by  text,
  qaqc_type     text check (qaqc_type in ('primary','field_duplicate','pulp_duplicate','crm','blank')),
  crm_expected  numeric(12,4),
  status        text not null default 'collected' check (status in ('collected','dispatched','assayed','validated','rejected')),
  created_at    timestamptz not null default now(),
  unique (org_id, sample_no)
);
create index samples_org_idx on samples (org_id);
create index samples_hole_idx on samples (drillhole_id, from_m);
create index samples_batch_idx on samples (batch_id);
create index samples_area_idx on samples (mining_area_id);

-- One row per element per sample keeps multi-element assays flexible.
create table assays (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  sample_id     bigint not null references samples(id) on delete cascade,
  element       text not null,
  value         numeric(16,5),
  unit          text not null default 'g/t' check (unit in ('g/t','ppm','ppb','pct','oz/t','kcal/kg','MJ/kg','ratio')),
  method        text,
  detection_limit numeric(16,5),
  below_detection boolean not null default false,
  laboratory    text,
  analysed_on   date,
  is_repeat     boolean not null default false
);
create unique index assays_unique_idx
  on assays (sample_id, element, coalesce(method, ''), is_repeat);
create index assays_org_idx on assays (org_id);
create index assays_sample_idx on assays (sample_id);
create index assays_element_idx on assays (org_id, element);

-- Coal quality is reported per sample on a different basis to metals.
create table coal_quality_results (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  sample_id     bigint references samples(id) on delete set null,
  basis         text not null default 'air_dried' check (basis in ('as_received','air_dried','dry','dry_ash_free','dry_mineral_matter_free')),
  moisture_pct  numeric(6,3),
  ash_pct       numeric(6,3),
  volatile_matter_pct numeric(6,3),
  fixed_carbon_pct numeric(6,3),
  sulphur_pct   numeric(6,3),
  calorific_value_kcal_kg numeric(9,2),
  hgi           numeric(6,2),
  phosphorus_pct numeric(7,4),
  chlorine_pct  numeric(7,4),
  ash_fusion_temp_c numeric(7,1),
  swelling_index numeric(5,2),
  analysed_on   date,
  laboratory    text
);
create index coal_quality_org_idx on coal_quality_results (org_id);
create index coal_quality_sample_idx on coal_quality_results (sample_id);

-- Block model summary: the grade-control layer that mine planning uses.
create table resource_blocks (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  mining_area_id bigint references mining_areas(id) on delete set null,
  block_code    text not null,
  easting       numeric(12,3),
  northing      numeric(12,3),
  elevation_m   numeric(10,3),
  volume_m3     numeric(16,3),
  density       numeric(8,3),
  tonnes        numeric(16,3),
  grade_primary numeric(12,4),
  grade_unit    text default 'g/t',
  grade_secondary numeric(12,4),
  ash_pct       numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  classification text not null default 'inferred' check (classification in ('measured','indicated','inferred','proven','probable','unclassified')),
  ore_type      text,
  recovery_pct  numeric(5,2),
  cut_off_grade numeric(12,4),
  is_ore        boolean not null default true,
  mined         boolean not null default false,
  estimated_on  date,
  unique (org_id, mine_id, block_code)
);
create index resource_blocks_org_idx on resource_blocks (org_id);
create index resource_blocks_mine_idx on resource_blocks (mine_id);
create index resource_blocks_area_idx on resource_blocks (mining_area_id);
create index resource_blocks_class_idx on resource_blocks (org_id, classification);
create index resource_blocks_unmined_idx on resource_blocks (mine_id) where mined = false;

-- Signed-off statement (JORC / NI 43-101 style) per reporting period.
create table resource_statements (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint not null references mines(id) on delete cascade,
  as_at         date not null,
  category      text not null check (category in ('measured','indicated','inferred','proven','probable')),
  reporting_code text not null default 'JORC' check (reporting_code in ('JORC','NI43-101','SAMREC','SK1300','PERC','RUSSIAN')),
  tonnes        numeric(18,3) not null,
  grade         numeric(12,4),
  grade_unit    text default 'g/t',
  contained_metal numeric(18,3),
  contained_unit text default 'oz',
  cut_off_grade numeric(12,4),
  competent_person text,
  notes         text,
  unique (org_id, mine_id, as_at, category, reporting_code)
);
create index resource_statements_org_idx on resource_statements (org_id);
create index resource_statements_mine_idx on resource_statements (mine_id, as_at desc);

create table geotech_monitoring (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  mining_area_id bigint references mining_areas(id) on delete set null,
  station_code  text not null,
  instrument_type text not null check (instrument_type in ('prism','extensometer','piezometer','inclinometer','radar','seismic','crack_meter','load_cell','convergence')),
  measured_at   timestamptz not null default now(),
  displacement_mm numeric(12,3),
  velocity_mm_day numeric(12,4),
  pore_pressure_kpa numeric(12,2),
  alarm_level   text not null default 'green' check (alarm_level in ('green','amber','red','evacuate')),
  action_taken  text,
  recorded_by   text
);
create index geotech_org_idx on geotech_monitoring (org_id, measured_at desc);
create index geotech_mine_idx on geotech_monitoring (mine_id);
create index geotech_area_idx on geotech_monitoring (mining_area_id);
create index geotech_alarm_idx on geotech_monitoring (org_id, alarm_level) where alarm_level in ('amber','red','evacuate');

create table survey_pickups (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  mining_area_id bigint references mining_areas(id) on delete set null,
  pickup_date   date not null,
  surveyor      text,
  method        text check (method in ('total_station','gps','drone','lidar','laser_scan','manual')),
  volume_m3     numeric(16,3),
  tonnes        numeric(16,3),
  material      text check (material in ('ore','waste','coal','overburden','interburden','topsoil','stockpile')),
  reconciled_tonnes numeric(16,3),
  variance_pct  numeric(8,3),
  notes         text
);
create index survey_pickups_org_idx on survey_pickups (org_id, pickup_date desc);
create index survey_pickups_mine_idx on survey_pickups (mine_id);
create index survey_pickups_area_idx on survey_pickups (mining_area_id);

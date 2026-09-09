-- =====================================================================
-- 006_processing.sql — plants and metallurgy: CIL/CIP gold circuits,
-- coal handling and preparation plants, metallurgical balance, gold
-- pours, product quality and tailings storage facilities.
-- =====================================================================

create table plants (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  code          text not null,
  name          text not null,
  plant_type    text not null check (plant_type in ('cil','cip','heap_leach','flotation','gravity','dms','chpp','washplant','crushing','screening','smelter','refinery','pelletising','agglomeration','magnetic_separation','leach_sx_ew')),
  commodity     text,
  design_throughput_tph numeric(12,3),
  design_recovery_pct numeric(5,2),
  commissioned_on date,
  status        text not null default 'operating' check (status in ('construction','commissioning','operating','shutdown','care_maintenance','decommissioned')),
  manager       text,
  unique (org_id, code)
);
create index plants_org_idx on plants (org_id);
create index plants_site_idx on plants (site_id);

create table plant_circuits (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  plant_id      bigint not null references plants(id) on delete cascade,
  code          text not null,
  name          text not null,
  stage         text not null check (stage in ('rom','primary_crushing','secondary_crushing','tertiary_crushing','milling','classification','gravity','flotation','leach','adsorption','elution','electrowinning','smelting','dewatering','thickening','filtration','dense_medium','spirals','flotation_fines','drying','product_handling','tailings')),
  design_capacity_tph numeric(12,3),
  status        text not null default 'operating' check (status in ('operating','standby','maintenance','bypassed')),
  unique (org_id, plant_id, code)
);
create index plant_circuits_org_idx on plant_circuits (org_id);
create index plant_circuits_plant_idx on plant_circuits (plant_id);

-- Daily/shift metallurgical accounting record.
create table plant_runs (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  plant_id      bigint not null references plants(id) on delete cascade,
  shift_id      bigint references shifts(id) on delete set null,
  run_date      date not null,
  shift_type    text check (shift_type in ('day','night','afternoon','daily')),
  operating_hours numeric(6,2),
  available_hours numeric(6,2),
  downtime_hours numeric(6,2),
  feed_tonnes   numeric(16,3) not null default 0,
  feed_grade    numeric(12,4),
  feed_grade_unit text default 'g/t',
  feed_moisture_pct numeric(6,3),
  throughput_tph numeric(12,3),
  product_tonnes numeric(16,3),
  product_grade numeric(12,4),
  tailings_tonnes numeric(16,3),
  tailings_grade numeric(12,4),
  recovery_pct  numeric(6,3),
  metal_produced numeric(16,4),
  metal_unit    text default 'oz',
  reagent_cost  numeric(14,2),
  power_kwh     numeric(16,2),
  water_m3      numeric(16,3),
  yield_pct     numeric(6,3),
  ash_pct       numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  utilisation_pct numeric(6,3),
  comments      text,
  created_at    timestamptz not null default now()
);
create index plant_runs_org_idx on plant_runs (org_id, run_date desc);
create index plant_runs_plant_idx on plant_runs (plant_id, run_date desc);
create index plant_runs_shift_idx on plant_runs (shift_id);

-- Reagent and consumable usage tied to a plant run.
create table reagent_consumption (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  plant_run_id  bigint references plant_runs(id) on delete cascade,
  plant_id      bigint references plants(id) on delete set null,
  reagent       text not null,
  quantity      numeric(14,3) not null,
  unit          text not null default 'kg',
  dosage_g_t    numeric(12,4),
  unit_cost     numeric(14,4),
  total_cost    numeric(14,2),
  consumed_on   date
);
create index reagent_org_idx on reagent_consumption (org_id, consumed_on desc);
create index reagent_run_idx on reagent_consumption (plant_run_id);
create index reagent_plant_idx on reagent_consumption (plant_id);

create table metallurgical_samples (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  plant_id      bigint references plants(id) on delete set null,
  circuit_id    bigint references plant_circuits(id) on delete set null,
  plant_run_id  bigint references plant_runs(id) on delete set null,
  sample_point  text not null,
  sampled_at    timestamptz not null default now(),
  stream_type   text check (stream_type in ('feed','concentrate','tailings','solution','residue','product','middlings','reject','recycle')),
  grade         numeric(14,5),
  grade_unit    text default 'g/t',
  solids_pct    numeric(6,3),
  p80_microns   numeric(10,2),
  ph            numeric(5,2),
  cn_ppm        numeric(10,3),
  ash_pct       numeric(6,3),
  moisture_pct  numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  sulphur_pct   numeric(6,3),
  analysed_by   text
);
create index met_samples_org_idx on metallurgical_samples (org_id, sampled_at desc);
create index met_samples_plant_idx on metallurgical_samples (plant_id);
create index met_samples_circuit_idx on metallurgical_samples (circuit_id);
create index met_samples_run_idx on metallurgical_samples (plant_run_id);

-- Gold room: pours, bars and the security chain of custody.
create table gold_pours (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  plant_id      bigint references plants(id) on delete set null,
  pour_number   text not null,
  poured_at     timestamptz not null default now(),
  source        text check (source in ('elution','gravity','smelting','cleanup','concentrate')),
  bars_count    int not null default 1,
  gross_weight_g numeric(14,3),
  fineness      numeric(7,4),
  fine_gold_g   numeric(14,3),
  fine_gold_oz  numeric(14,4),
  silver_g      numeric(14,3),
  assay_lab     text,
  witnessed_by  text,
  security_seal_no text,
  status        text not null default 'in_vault' check (status in ('poured','in_vault','dispatched','sold','refined')),
  unique (org_id, pour_number)
);
create index gold_pours_org_idx on gold_pours (org_id, poured_at desc);
create index gold_pours_plant_idx on gold_pours (plant_id);

create table bullion_shipments (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  shipment_no   text not null,
  shipped_at    timestamptz,
  refinery      text,
  carrier       text,
  bars_count    int,
  gross_weight_g numeric(14,3),
  fine_gold_oz  numeric(14,4),
  declared_value numeric(18,2),
  currency      text default 'USD',
  insurance_ref text,
  received_at   timestamptz,
  settlement_oz numeric(14,4),
  settlement_value numeric(18,2),
  variance_oz   numeric(14,4),
  status        text not null default 'prepared' check (status in ('prepared','in_transit','received','assayed','settled','disputed')),
  unique (org_id, shipment_no)
);
create index bullion_org_idx on bullion_shipments (org_id, shipped_at desc);
create index bullion_site_idx on bullion_shipments (site_id);

create table gold_pour_shipment_links (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  pour_id       bigint not null references gold_pours(id) on delete cascade,
  shipment_id   bigint not null references bullion_shipments(id) on delete cascade,
  unique (pour_id, shipment_id)
);
create index pour_ship_org_idx on gold_pour_shipment_links (org_id);
create index pour_ship_pour_idx on gold_pour_shipment_links (pour_id);
create index pour_ship_shipment_idx on gold_pour_shipment_links (shipment_id);

-- Saleable product specifications (thermal coal, coking coal, concentrate).
create table product_specs (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  commodity     text not null,
  spec_basis    text,
  min_cv_kcal_kg numeric(9,2),
  max_ash_pct   numeric(6,3),
  max_moisture_pct numeric(6,3),
  max_sulphur_pct numeric(6,3),
  min_grade     numeric(12,4),
  max_size_mm   numeric(8,2),
  min_size_mm   numeric(8,2),
  penalty_terms text,
  active        boolean not null default true,
  unique (org_id, code)
);
create index product_specs_org_idx on product_specs (org_id);

create table quality_samples (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  product_spec_id bigint references product_specs(id) on delete set null,
  stockpile_id  bigint references stockpiles(id) on delete set null,
  sample_no     text not null,
  sampled_at    timestamptz not null default now(),
  sample_point  text,
  cv_kcal_kg    numeric(9,2),
  ash_pct       numeric(6,3),
  moisture_pct  numeric(6,3),
  sulphur_pct   numeric(6,3),
  volatile_matter_pct numeric(6,3),
  size_p80_mm   numeric(8,2),
  grade         numeric(12,4),
  within_spec   boolean,
  deviation_notes text,
  analysed_by   text,
  unique (org_id, sample_no)
);
create index quality_samples_org_idx on quality_samples (org_id, sampled_at desc);
create index quality_samples_site_idx on quality_samples (site_id);
create index quality_samples_spec_idx on quality_samples (product_spec_id);
create index quality_samples_stockpile_idx on quality_samples (stockpile_id);

-- Tailings storage facilities carry the highest residual risk on most
-- sites, so they get their own register and monitoring stream.
create table tailings_facilities (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  code          text not null,
  name          text not null,
  facility_type text check (facility_type in ('upstream','downstream','centreline','in_pit','dry_stack','paste','pond')),
  design_capacity_m3 numeric(18,3),
  stored_volume_m3 numeric(18,3),
  crest_elevation_m numeric(10,3),
  freeboard_m   numeric(8,3),
  min_freeboard_m numeric(8,3),
  consequence_category text check (consequence_category in ('low','significant','high','very_high','extreme')),
  engineer_of_record text,
  last_audit_on date,
  next_audit_on date,
  status        text not null default 'active' check (status in ('design','construction','active','inactive','closed','rehabilitated')),
  unique (org_id, code)
);
create index tsf_org_idx on tailings_facilities (org_id);
create index tsf_site_idx on tailings_facilities (site_id);

create table tailings_readings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  facility_id   bigint not null references tailings_facilities(id) on delete cascade,
  measured_at   timestamptz not null default now(),
  pond_level_m  numeric(10,3),
  freeboard_m   numeric(8,3),
  phreatic_surface_m numeric(10,3),
  seepage_l_s   numeric(12,3),
  displacement_mm numeric(12,3),
  deposition_tonnes numeric(16,3),
  density_t_m3  numeric(8,3),
  ph            numeric(5,2),
  cn_wad_ppm    numeric(10,3),
  alarm_level   text not null default 'green' check (alarm_level in ('green','amber','red')),
  inspector     text,
  notes         text
);
create index tsf_readings_org_idx on tailings_readings (org_id, measured_at desc);
create index tsf_readings_facility_idx on tailings_readings (facility_id, measured_at desc);
create index tsf_readings_alarm_idx on tailings_readings (org_id, alarm_level) where alarm_level <> 'green';

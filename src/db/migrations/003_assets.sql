-- =====================================================================
-- 003_assets.sql — mobile fleet and fixed plant asset register,
-- meter readings, maintenance plans, work orders, downtime, fuel,
-- tyres and pre-start inspections.
-- =====================================================================

create table asset_categories (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  class         text not null check (class in ('mobile','fixed','light_vehicle','infrastructure','instrument','tool','it')),
  meter_type    text check (meter_type in ('hours','kilometres','tonnes','cycles','none')),
  unique (org_id, code)
);
create index asset_categories_org_idx on asset_categories (org_id);

create table assets (
  id              bigint generated always as identity primary key,
  org_id          bigint not null references orgs(id) on delete cascade,
  site_id         bigint references sites(id) on delete set null,
  mine_id         bigint references mines(id) on delete set null,
  category_id     bigint references asset_categories(id) on delete set null,
  parent_asset_id bigint references assets(id) on delete set null,
  cost_center_id  bigint references cost_centers(id) on delete set null,
  asset_no        text not null,
  name            text not null,
  asset_type      text not null check (asset_type in ('excavator','haul_truck','dozer','grader','loader','drill_rig','shovel','dragline','continuous_miner','longwall_shearer','shuttle_car','lhd','roof_bolter','conveyor','crusher','mill','screen','pump','compressor','generator','substation','hoist','ventilation_fan','light_vehicle','bus','water_cart','fuel_truck','crane','forklift','float','ambulance','other')),
  manufacturer    text,
  model           text,
  serial_no       text,
  registration_no text,
  year_built      int,
  acquired_on     date,
  acquisition_cost numeric(16,2),
  depreciation_method text check (depreciation_method in ('straight_line','units_of_production','declining_balance','none')),
  useful_life_hours numeric(12,2),
  ownership       text not null default 'owned' check (ownership in ('owned','leased','rented','contractor')),
  contractor_id   bigint references contractors(id) on delete set null,
  capacity_value  numeric(12,2),
  capacity_unit   text,
  fuel_type       text check (fuel_type in ('diesel','electric','hybrid','lpg','hydrogen','petrol','none')),
  fuel_capacity_l numeric(10,2),
  tyre_size       text,
  status          text not null default 'operational' check (status in ('operational','standby','maintenance','breakdown','awaiting_parts','decommissioned','disposed')),
  criticality     text not null default 'medium' check (criticality in ('critical','high','medium','low')),
  location        text,
  commissioned_on date,
  decommissioned_on date,
  warranty_expiry date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, asset_no)
);
create index assets_org_idx on assets (org_id);
create index assets_site_idx on assets (site_id);
create index assets_mine_idx on assets (mine_id);
create index assets_category_idx on assets (category_id);
create index assets_parent_idx on assets (parent_asset_id);
create index assets_cost_center_idx on assets (cost_center_id);
create index assets_contractor_idx on assets (contractor_id);
create index assets_status_idx on assets (org_id, status);
create index assets_type_idx on assets (org_id, asset_type);

create table meter_readings (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  asset_id      bigint not null references assets(id) on delete cascade,
  reading_at    timestamptz not null default now(),
  meter_type    text not null default 'hours' check (meter_type in ('hours','kilometres','tonnes','cycles')),
  reading       numeric(14,2) not null check (reading >= 0),
  source        text check (source in ('manual','telemetry','fms','import')),
  recorded_by   text
);
create index meter_readings_org_idx on meter_readings (org_id);
create index meter_readings_asset_idx on meter_readings (asset_id, reading_at desc);

-- Preventive maintenance strategy per asset.
create table maintenance_plans (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  asset_id      bigint not null references assets(id) on delete cascade,
  code          text not null,
  name          text not null,
  service_type  text not null check (service_type in ('inspection','service_a','service_b','service_c','service_d','overhaul','statutory','calibration','lubrication','condition_monitoring')),
  interval_hours numeric(10,2),
  interval_days int,
  interval_km   numeric(10,2),
  last_done_at  timestamptz,
  last_done_meter numeric(14,2),
  next_due_at   timestamptz,
  next_due_meter numeric(14,2),
  estimated_hours numeric(8,2),
  estimated_cost numeric(14,2),
  checklist     jsonb,
  active        boolean not null default true,
  unique (org_id, code)
);
create index maintenance_plans_org_idx on maintenance_plans (org_id);
create index maintenance_plans_asset_idx on maintenance_plans (asset_id);
create index maintenance_plans_due_idx on maintenance_plans (org_id, next_due_at) where active;

create table failure_codes (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  system        text check (system in ('engine','transmission','hydraulics','electrical','brakes','structure','tyres','drivetrain','cooling','control','pneumatics','instrumentation','other')),
  severity      text check (severity in ('minor','moderate','major','catastrophic')),
  unique (org_id, code)
);
create index failure_codes_org_idx on failure_codes (org_id);

create table work_orders (
  id              bigint generated always as identity primary key,
  org_id          bigint not null references orgs(id) on delete cascade,
  site_id         bigint references sites(id) on delete set null,
  asset_id        bigint references assets(id) on delete set null,
  plan_id         bigint references maintenance_plans(id) on delete set null,
  failure_code_id bigint references failure_codes(id) on delete set null,
  cost_center_id  bigint references cost_centers(id) on delete set null,
  wo_number       text not null,
  title           text not null,
  description     text,
  wo_type         text not null default 'corrective' check (wo_type in ('preventive','corrective','breakdown','predictive','modification','statutory','shutdown','inspection')),
  priority        text not null default 'medium' check (priority in ('emergency','high','medium','low','planned')),
  status          text not null default 'open' check (status in ('draft','open','planned','awaiting_parts','in_progress','on_hold','completed','verified','cancelled')),
  reported_by     text,
  assigned_to_employee_id bigint references employees(id) on delete set null,
  reported_at     timestamptz not null default now(),
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  actual_start    timestamptz,
  actual_end      timestamptz,
  downtime_hours  numeric(8,2),
  labour_hours    numeric(8,2),
  labour_cost     numeric(14,2) default 0,
  parts_cost      numeric(14,2) default 0,
  contractor_cost numeric(14,2) default 0,
  total_cost      numeric(14,2) default 0,
  meter_at_service numeric(14,2),
  root_cause      text,
  corrective_action text,
  safety_permit_required boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, wo_number)
);
create index work_orders_org_idx on work_orders (org_id, reported_at desc);
create index work_orders_site_idx on work_orders (site_id);
create index work_orders_asset_idx on work_orders (asset_id);
create index work_orders_plan_idx on work_orders (plan_id);
create index work_orders_failure_idx on work_orders (failure_code_id);
create index work_orders_cost_center_idx on work_orders (cost_center_id);
create index work_orders_assignee_idx on work_orders (assigned_to_employee_id);
create index work_orders_open_idx on work_orders (org_id, status) where status not in ('completed','verified','cancelled');

create table work_order_tasks (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  work_order_id bigint not null references work_orders(id) on delete cascade,
  seq           int not null default 1,
  description   text not null,
  trade         text,
  estimated_hours numeric(8,2),
  actual_hours  numeric(8,2),
  employee_id   bigint references employees(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','in_progress','done','skipped')),
  completed_at  timestamptz
);
create index wo_tasks_org_idx on work_order_tasks (org_id);
create index wo_tasks_wo_idx on work_order_tasks (work_order_id);
create index wo_tasks_employee_idx on work_order_tasks (employee_id);

create table work_order_parts (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  work_order_id bigint not null references work_orders(id) on delete cascade,
  item_id       bigint,
  part_number   text,
  description   text,
  quantity      numeric(12,3) not null default 1,
  unit_cost     numeric(14,2),
  line_cost     numeric(14,2),
  issued_at     timestamptz,
  status        text not null default 'requested' check (status in ('requested','reserved','issued','returned','cancelled'))
);
create index wo_parts_org_idx on work_order_parts (org_id);
create index wo_parts_wo_idx on work_order_parts (work_order_id);
create index wo_parts_item_idx on work_order_parts (item_id);

-- Every hour an asset was not available, and why. Drives MTBF/MTTR and
-- the availability/utilisation numbers on the fleet dashboard.
create table downtime_events (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  asset_id      bigint not null references assets(id) on delete cascade,
  shift_id      bigint references shifts(id) on delete set null,
  work_order_id bigint references work_orders(id) on delete set null,
  category      text not null check (category in ('planned_maintenance','unplanned_breakdown','operational_delay','no_operator','weather','blasting','shift_change','refuelling','standby','power_outage','awaiting_parts','accident')),
  reason        text,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  duration_hours numeric(8,2),
  is_availability_loss boolean not null default true,
  recorded_by   text,
  created_at    timestamptz not null default now()
);
create index downtime_org_idx on downtime_events (org_id, started_at desc);
create index downtime_asset_idx on downtime_events (asset_id, started_at desc);
create index downtime_shift_idx on downtime_events (shift_id);
create index downtime_wo_idx on downtime_events (work_order_id);
create index downtime_open_idx on downtime_events (org_id) where ended_at is null;

create table fuel_transactions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  asset_id      bigint references assets(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  transacted_at timestamptz not null default now(),
  fuel_type     text not null default 'diesel' check (fuel_type in ('diesel','petrol','lpg','oil','lubricant','adblue')),
  litres        numeric(12,2) not null check (litres >= 0),
  meter_reading numeric(14,2),
  unit_price    numeric(12,4),
  total_cost    numeric(14,2),
  bay           text,
  operator_employee_id bigint references employees(id) on delete set null,
  source        text check (source in ('bowser','fuel_truck','external','tank_transfer'))
);
create index fuel_org_idx on fuel_transactions (org_id, transacted_at desc);
create index fuel_site_idx on fuel_transactions (site_id);
create index fuel_asset_idx on fuel_transactions (asset_id, transacted_at desc);
create index fuel_shift_idx on fuel_transactions (shift_id);
create index fuel_operator_idx on fuel_transactions (operator_employee_id);

create table tyre_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  asset_id      bigint references assets(id) on delete set null,
  serial_no     text not null,
  brand         text,
  size          text,
  position_code text,
  fitted_at     timestamptz,
  removed_at    timestamptz,
  fitted_meter  numeric(14,2),
  removed_meter numeric(14,2),
  hours_run     numeric(12,2),
  tread_depth_mm numeric(6,2),
  removal_reason text check (removal_reason in ('worn','cut','burst','sidewall','rotation','scrapped','retread','other')),
  cost          numeric(14,2),
  status        text not null default 'fitted' check (status in ('new','fitted','removed','retread','scrapped'))
);
create index tyre_org_idx on tyre_records (org_id);
create index tyre_asset_idx on tyre_records (asset_id);

-- Operator pre-start / statutory equipment inspections.
create table equipment_inspections (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  asset_id      bigint not null references assets(id) on delete cascade,
  shift_id      bigint references shifts(id) on delete set null,
  employee_id   bigint references employees(id) on delete set null,
  inspection_type text not null default 'pre_start' check (inspection_type in ('pre_start','weekly','statutory','post_trip','pre_use','third_party')),
  inspected_at  timestamptz not null default now(),
  result        text not null default 'pass' check (result in ('pass','pass_with_defects','fail','not_completed')),
  defects_found int default 0,
  defect_notes  text,
  checklist     jsonb,
  work_order_id bigint references work_orders(id) on delete set null
);
create index equip_insp_org_idx on equipment_inspections (org_id, inspected_at desc);
create index equip_insp_asset_idx on equipment_inspections (asset_id, inspected_at desc);
create index equip_insp_shift_idx on equipment_inspections (shift_id);
create index equip_insp_employee_idx on equipment_inspections (employee_id);
create index equip_insp_wo_idx on equipment_inspections (work_order_id);

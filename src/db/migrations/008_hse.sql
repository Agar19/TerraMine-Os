-- =====================================================================
-- 008_hse.sql — health, safety, environment and community.
-- Incidents and investigations, hazards and risk, permits to work,
-- inspections and observations, PPE, emergency preparedness,
-- environmental monitoring, rehabilitation and community relations.
-- =====================================================================

create table hazards (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  hazard_code   text not null,
  title         text not null,
  description   text,
  category      text not null check (category in ('ground_control','fire','explosion','gas','dust','noise','vibration','electrical','mobile_equipment','working_at_height','confined_space','lifting','hazardous_substance','inrush','heat','manual_handling','traffic','isolation','environment','security','fatigue','ergonomic','biological','radiation')),
  is_principal_hazard boolean not null default false,
  likelihood    int check (likelihood between 1 and 5),
  consequence   int check (consequence between 1 and 5),
  inherent_risk int,
  controls      text,
  residual_likelihood int check (residual_likelihood between 1 and 5),
  residual_consequence int check (residual_consequence between 1 and 5),
  residual_risk int,
  risk_rating   text check (risk_rating in ('low','moderate','high','extreme')),
  owner         text,
  reviewed_on   date,
  next_review_on date,
  status        text not null default 'open' check (status in ('open','controlled','monitoring','closed')),
  created_at    timestamptz not null default now(),
  unique (org_id, hazard_code)
);
create index hazards_org_idx on hazards (org_id);
create index hazards_site_idx on hazards (site_id);
create index hazards_mine_idx on hazards (mine_id);
create index hazards_rating_idx on hazards (org_id, risk_rating);

create table risk_assessments (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  reference     text not null,
  title         text not null,
  assessment_type text not null default 'jsa' check (assessment_type in ('jsa','jha','take_5','baseline','issue_based','continuous','bowtie','hazop','fmea','change_management')),
  activity      text,
  location      text,
  assessed_on   date not null default current_date,
  team          text,
  facilitator   text,
  highest_residual_risk text check (highest_residual_risk in ('low','moderate','high','extreme')),
  approved_by   text,
  next_review_on date,
  status        text not null default 'draft' check (status in ('draft','in_review','approved','expired','superseded')),
  unique (org_id, reference)
);
create index risk_assess_org_idx on risk_assessments (org_id, assessed_on desc);
create index risk_assess_site_idx on risk_assessments (site_id);

create table incidents (
  id              bigint generated always as identity primary key,
  org_id          bigint not null references orgs(id) on delete cascade,
  site_id         bigint not null references sites(id) on delete cascade,
  mine_id         bigint references mines(id) on delete set null,
  mining_area_id  bigint references mining_areas(id) on delete set null,
  shift_id        bigint references shifts(id) on delete set null,
  department_id   bigint references departments(id) on delete set null,
  asset_id        bigint references assets(id) on delete set null,
  contractor_id   bigint references contractors(id) on delete set null,
  incident_no     text not null,
  occurred_at     timestamptz not null,
  reported_at     timestamptz not null default now(),
  incident_type   text not null check (incident_type in ('near_miss','first_aid','medical_treatment','restricted_work','lost_time_injury','fatality','property_damage','environmental','fire','vehicle','equipment_damage','security','process_safety','high_potential','dangerous_occurrence','occupational_illness')),
  classification  text check (classification in ('lti','mti','rwi','fai','nm','ei','pd','fatal','hipo')),
  title           text not null,
  description     text,
  location        text,
  activity        text,
  hazard_id       bigint references hazards(id) on delete set null,
  injured_employee_id bigint references employees(id) on delete set null,
  body_part       text,
  injury_nature   text,
  days_lost       int default 0,
  restricted_days int default 0,
  potential_severity text check (potential_severity in ('minor','moderate','serious','major','catastrophic')),
  actual_severity text check (actual_severity in ('minor','moderate','serious','major','catastrophic')),
  immediate_cause text,
  root_cause      text,
  root_cause_method text check (root_cause_method in ('5_why','icam','taproot','fishbone','tripod_beta','none')),
  environmental_impact text,
  spill_volume_l  numeric(14,2),
  property_damage_cost numeric(16,2),
  reportable_to_regulator boolean not null default false,
  regulator_reference text,
  regulator_notified_at timestamptz,
  investigation_lead text,
  status          text not null default 'reported' check (status in ('reported','under_investigation','actions_pending','closed','reopened')),
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (org_id, incident_no)
);
create index incidents_org_idx on incidents (org_id, occurred_at desc);
create index incidents_site_idx on incidents (site_id, occurred_at desc);
create index incidents_mine_idx on incidents (mine_id);
create index incidents_area_idx on incidents (mining_area_id);
create index incidents_shift_idx on incidents (shift_id);
create index incidents_dept_idx on incidents (department_id);
create index incidents_asset_idx on incidents (asset_id);
create index incidents_contractor_idx on incidents (contractor_id);
create index incidents_hazard_idx on incidents (hazard_id);
create index incidents_employee_idx on incidents (injured_employee_id);
create index incidents_type_idx on incidents (org_id, incident_type, occurred_at desc);
create index incidents_open_idx on incidents (org_id) where status <> 'closed';

-- Corrective and preventive actions. Deliberately generic so any module
-- (incident, audit, inspection, TSF review) can raise one.
create table corrective_actions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  source_entity text not null,
  source_id     bigint,
  action_no     text not null,
  description   text not null,
  action_type   text check (action_type in ('corrective','preventive','improvement','engineering','administrative','training','ppe','elimination','substitution')),
  hierarchy_level text check (hierarchy_level in ('elimination','substitution','engineering','administrative','ppe')),
  assigned_to_employee_id bigint references employees(id) on delete set null,
  assigned_to_name text,
  raised_on     date not null default current_date,
  due_on        date,
  completed_on  date,
  priority      text not null default 'medium' check (priority in ('critical','high','medium','low')),
  status        text not null default 'open' check (status in ('open','in_progress','completed','verified','overdue','cancelled')),
  verification_notes text,
  effectiveness_rating text check (effectiveness_rating in ('effective','partially_effective','not_effective','not_assessed')),
  cost          numeric(16,2),
  unique (org_id, action_no)
);
create index actions_org_idx on corrective_actions (org_id, due_on);
create index actions_site_idx on corrective_actions (site_id);
create index actions_source_idx on corrective_actions (source_entity, source_id);
create index actions_assignee_idx on corrective_actions (assigned_to_employee_id);
create index actions_overdue_idx on corrective_actions (org_id, due_on) where status in ('open','in_progress');

create table safety_observations (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  observed_at   timestamptz not null default now(),
  observer_employee_id bigint references employees(id) on delete set null,
  observation_type text not null default 'behavioural' check (observation_type in ('behavioural','condition','positive','stop_work','housekeeping','planned_task')),
  category      text,
  location      text,
  description   text not null,
  is_unsafe     boolean not null default true,
  immediate_action text,
  risk_rating   text check (risk_rating in ('low','moderate','high','extreme')),
  status        text not null default 'open' check (status in ('open','actioned','closed'))
);
create index observations_org_idx on safety_observations (org_id, observed_at desc);
create index observations_site_idx on safety_observations (site_id);
create index observations_mine_idx on safety_observations (mine_id);
create index observations_shift_idx on safety_observations (shift_id);
create index observations_observer_idx on safety_observations (observer_employee_id);

create table permits_to_work (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  permit_no     text not null,
  permit_type   text not null check (permit_type in ('hot_work','confined_space','working_at_height','electrical_isolation','excavation','lifting','radiation','diving','breaking_containment','vehicle_entry','blasting','shaft_work')),
  work_description text not null,
  location      text,
  asset_id      bigint references assets(id) on delete set null,
  work_order_id bigint references work_orders(id) on delete set null,
  contractor_id bigint references contractors(id) on delete set null,
  requested_by_employee_id bigint references employees(id) on delete set null,
  issued_by_employee_id bigint references employees(id) on delete set null,
  valid_from    timestamptz not null,
  valid_to      timestamptz not null,
  isolation_ref text,
  gas_test_required boolean not null default false,
  gas_test_result text,
  standby_person text,
  precautions   text,
  status        text not null default 'requested' check (status in ('requested','approved','active','suspended','closed','expired','cancelled')),
  closed_at     timestamptz,
  closed_by     text,
  unique (org_id, permit_no)
);
create index permits_org_idx on permits_to_work (org_id, valid_from desc);
create index permits_site_idx on permits_to_work (site_id);
create index permits_asset_idx on permits_to_work (asset_id);
create index permits_wo_idx on permits_to_work (work_order_id);
create index permits_contractor_idx on permits_to_work (contractor_id);
create index permits_requester_idx on permits_to_work (requested_by_employee_id);
create index permits_issuer_idx on permits_to_work (issued_by_employee_id);
create index permits_active_idx on permits_to_work (org_id, valid_to) where status = 'active';

create table hse_inspections (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  inspection_no text not null,
  inspection_type text not null check (inspection_type in ('statutory','workplace','housekeeping','fire_equipment','emergency_equipment','electrical','lifting_gear','ventilation','environmental','contractor','management_walkabout','pre_shift')),
  scheduled_on  date,
  performed_on  date,
  inspector     text,
  area          text,
  score_pct     numeric(5,2),
  findings_count int default 0,
  critical_findings int default 0,
  result        text check (result in ('compliant','minor_non_conformance','major_non_conformance','not_performed')),
  notes         text,
  status        text not null default 'scheduled' check (status in ('scheduled','completed','overdue','cancelled')),
  unique (org_id, inspection_no)
);
create index hse_insp_org_idx on hse_inspections (org_id, performed_on desc);
create index hse_insp_site_idx on hse_inspections (site_id);
create index hse_insp_mine_idx on hse_inspections (mine_id);

create table toolbox_talks (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  shift_id      bigint references shifts(id) on delete set null,
  crew_id       bigint references crews(id) on delete set null,
  held_at       timestamptz not null default now(),
  topic         text not null,
  presenter     text,
  attendees_count int,
  duration_minutes int,
  key_points    text,
  issues_raised text
);
create index toolbox_org_idx on toolbox_talks (org_id, held_at desc);
create index toolbox_site_idx on toolbox_talks (site_id);
create index toolbox_shift_idx on toolbox_talks (shift_id);
create index toolbox_crew_idx on toolbox_talks (crew_id);

create table ppe_issues (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  item_id       bigint references items(id) on delete set null,
  ppe_type      text not null check (ppe_type in ('hard_hat','safety_boots','overalls','gloves','eye_protection','hearing_protection','respirator','harness','self_rescuer','cap_lamp','high_vis','gas_detector','fall_arrest','face_shield')),
  issued_on     date not null default current_date,
  quantity      numeric(8,2) not null default 1,
  size          text,
  serial_no     text,
  replacement_due date,
  cost          numeric(12,2),
  returned_on   date,
  condition     text check (condition in ('new','good','fair','damaged','expired'))
);
create index ppe_org_idx on ppe_issues (org_id, issued_on desc);
create index ppe_employee_idx on ppe_issues (employee_id);
create index ppe_item_idx on ppe_issues (item_id);

create table emergency_drills (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  drill_type    text not null check (drill_type in ('evacuation','fire','inrush','gas_alarm','entrapment','spill','medical','shaft_failure','tsf_breach','security','full_scale')),
  held_at       timestamptz not null,
  participants  int,
  evacuation_minutes numeric(8,2),
  target_minutes numeric(8,2),
  refuge_chambers_used int,
  outcome       text check (outcome in ('satisfactory','needs_improvement','unsatisfactory')),
  observations  text,
  led_by        text
);
create index drills_org_idx on emergency_drills (org_id, held_at desc);
create index drills_site_idx on emergency_drills (site_id);
create index drills_mine_idx on emergency_drills (mine_id);

-- ---------------------------------------------------------------------
-- Environment
-- ---------------------------------------------------------------------

create table environmental_monitoring (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  station_code  text not null,
  medium        text not null check (medium in ('surface_water','groundwater','potable_water','discharge','air','dust_fallout','noise','vibration','soil','biodiversity','rainfall')),
  measured_at   timestamptz not null default now(),
  parameter     text not null,
  value         numeric(16,5),
  unit          text,
  limit_value   numeric(16,5),
  compliant     boolean,
  method        text,
  laboratory    text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  notes         text
);
create index env_mon_org_idx on environmental_monitoring (org_id, measured_at desc);
create index env_mon_site_idx on environmental_monitoring (site_id, measured_at desc);
create index env_mon_param_idx on environmental_monitoring (org_id, medium, parameter);
create index env_mon_breach_idx on environmental_monitoring (org_id, measured_at desc) where compliant = false;

create table rehabilitation_areas (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  code          text not null,
  name          text not null,
  disturbed_hectares numeric(12,3),
  rehabilitated_hectares numeric(12,3) default 0,
  rehab_type    text check (rehab_type in ('backfill','reshaping','topsoil','revegetation','water_treatment','capping','demolition','monitoring')),
  started_on    date,
  completed_on  date,
  provision_cost numeric(18,2),
  spend_to_date numeric(18,2) default 0,
  vegetation_cover_pct numeric(5,2),
  status        text not null default 'planned' check (status in ('planned','in_progress','monitoring','signed_off','failed')),
  unique (org_id, code)
);
create index rehab_org_idx on rehabilitation_areas (org_id);
create index rehab_site_idx on rehabilitation_areas (site_id);
create index rehab_mine_idx on rehabilitation_areas (mine_id);

create table waste_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  record_date   date not null,
  waste_stream  text not null check (waste_stream in ('general','hazardous','scrap_metal','used_oil','tyres','batteries','medical','e_waste','sewage','chemical','recyclable')),
  quantity      numeric(14,3) not null,
  unit          text not null default 't',
  disposal_method text check (disposal_method in ('landfill','recycled','incinerated','treated','reused','stored','exported')),
  contractor_id bigint references contractors(id) on delete set null,
  manifest_no   text,
  cost          numeric(14,2)
);
create index waste_org_idx on waste_records (org_id, record_date desc);
create index waste_site_idx on waste_records (site_id);
create index waste_contractor_idx on waste_records (contractor_id);

create table energy_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  record_date   date not null,
  source        text not null check (source in ('grid','diesel_generator','solar','wind','battery','gas','hydro')),
  consumption_kwh numeric(18,3),
  demand_kw     numeric(14,3),
  cost          numeric(16,2),
  co2e_tonnes   numeric(14,3),
  scope         text check (scope in ('scope_1','scope_2','scope_3')),
  notes         text
);
create index energy_org_idx on energy_records (org_id, record_date desc);
create index energy_site_idx on energy_records (site_id);

create table water_balance (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  record_date   date not null,
  abstraction_m3 numeric(16,3) default 0,
  rainfall_mm   numeric(10,2),
  recycled_m3   numeric(16,3) default 0,
  discharged_m3 numeric(16,3) default 0,
  evaporation_m3 numeric(16,3) default 0,
  process_use_m3 numeric(16,3) default 0,
  dust_suppression_m3 numeric(16,3) default 0,
  potable_m3    numeric(16,3) default 0,
  storage_m3    numeric(16,3),
  licence_limit_m3 numeric(16,3)
);
create index water_org_idx on water_balance (org_id, record_date desc);
create index water_site_idx on water_balance (site_id);

create table community_engagements (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  reference     text not null,
  engagement_type text not null check (engagement_type in ('meeting','grievance','consultation','donation','local_employment','local_procurement','project','compensation','resettlement','training')),
  occurred_on   date not null default current_date,
  stakeholder   text,
  community     text,
  description   text,
  commitment    text,
  amount        numeric(16,2),
  beneficiaries int,
  status        text not null default 'open' check (status in ('open','in_progress','resolved','escalated','closed')),
  resolution    text,
  closed_on     date,
  owner         text,
  unique (org_id, reference)
);
create index community_org_idx on community_engagements (org_id, occurred_on desc);
create index community_site_idx on community_engagements (site_id);

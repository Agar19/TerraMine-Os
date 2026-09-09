-- =====================================================================
-- 002_workforce.sql — people: employees, contractors, crews, rosters,
-- attendance, competencies, training, leave, payroll and the tag board
-- that tracks who is underground right now.
-- =====================================================================

create table contractors (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  name          text not null,
  scope_of_work text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  contract_start date,
  contract_end  date,
  insurance_expiry date,
  safety_rating text check (safety_rating in ('A','B','C','D')),
  status        text not null default 'active' check (status in ('prequalified','active','suspended','expired','terminated')),
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index contractors_org_id_idx on contractors (org_id);
create index contractors_site_id_idx on contractors (site_id);

create table employees (
  id              bigint generated always as identity primary key,
  org_id          bigint not null references orgs(id) on delete cascade,
  site_id         bigint references sites(id) on delete set null,
  department_id   bigint references departments(id) on delete set null,
  contractor_id   bigint references contractors(id) on delete set null,
  employee_no     text not null,
  first_name      text not null,
  last_name       text not null,
  national_id     text,
  gender          text check (gender in ('female','male','other','undisclosed')),
  date_of_birth   date,
  nationality     text,
  phone           text,
  email           text,
  emergency_contact_name text,
  emergency_contact_phone text,
  job_title       text not null,
  occupation_group text check (occupation_group in ('management','professional','supervisor','operator','artisan','labourer','apprentice','administration')),
  employment_type text not null default 'permanent' check (employment_type in ('permanent','fixed_term','contractor','casual','apprentice','intern')),
  work_location   text check (work_location in ('surface','underground','plant','office','remote','mixed')),
  hired_on        date,
  terminated_on   date,
  status          text not null default 'active' check (status in ('active','on_leave','suspended','terminated','medical_hold')),
  hourly_rate     numeric(12,2),
  monthly_salary  numeric(14,2),
  currency        text default 'USD',
  bank_account    text,
  tax_number      text,
  photo_url       text,
  blood_type      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, employee_no)
);
create index employees_org_id_idx on employees (org_id);
create index employees_site_id_idx on employees (site_id);
create index employees_department_id_idx on employees (department_id);
create index employees_contractor_id_idx on employees (contractor_id);
create index employees_status_idx on employees (org_id, status);
create index employees_name_idx on employees (org_id, last_name, first_name);

-- Shift patterns: 4x4 12h, 5-2 day, continental, etc.
create table shift_patterns (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  cycle_days    int not null default 7 check (cycle_days > 0),
  shift_hours   numeric(4,2) not null default 12,
  shifts_per_day int not null default 2 check (shifts_per_day between 1 and 4),
  rotation      text check (rotation in ('day_only','night_only','rotating','continental','panama','fly_in_fly_out')),
  description   text,
  unique (org_id, code)
);
create index shift_patterns_org_id_idx on shift_patterns (org_id);

create table crews (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  mine_id       bigint references mines(id) on delete set null,
  shift_pattern_id bigint references shift_patterns(id) on delete set null,
  code          text not null,
  name          text not null,
  discipline    text,
  supervisor_employee_id bigint references employees(id) on delete set null,
  headcount_target int,
  active        boolean not null default true,
  unique (org_id, code)
);
create index crews_org_id_idx on crews (org_id);
create index crews_site_id_idx on crews (site_id);
create index crews_mine_id_idx on crews (mine_id);
create index crews_supervisor_idx on crews (supervisor_employee_id);
create index crews_shift_pattern_idx on crews (shift_pattern_id);

create table crew_members (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  crew_id       bigint not null references crews(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  role_in_crew  text,
  joined_on     date not null default current_date,
  left_on       date,
  unique (crew_id, employee_id, joined_on)
);
create index crew_members_org_id_idx on crew_members (org_id);
create index crew_members_crew_id_idx on crew_members (crew_id);
create index crew_members_employee_id_idx on crew_members (employee_id);

-- A shift is the unit everything operational hangs off: production,
-- downtime, safety observations and payroll all reference it.
create table shifts (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  crew_id       bigint references crews(id) on delete set null,
  shift_date    date not null,
  shift_type    text not null check (shift_type in ('day','night','afternoon','maintenance')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  supervisor_employee_id bigint references employees(id) on delete set null,
  planned_headcount int,
  actual_headcount  int,
  status        text not null default 'planned' check (status in ('planned','in_progress','closed','signed_off')),
  handover_notes text,
  weather       text,
  created_at    timestamptz not null default now()
);
-- Expression uniqueness needs an index, not a table constraint.
create unique index shifts_unique_idx
  on shifts (org_id, site_id, shift_date, shift_type, coalesce(mine_id, 0), coalesce(crew_id, 0));
create index shifts_org_date_idx on shifts (org_id, shift_date desc);
create index shifts_site_id_idx on shifts (site_id);
create index shifts_mine_id_idx on shifts (mine_id);
create index shifts_crew_id_idx on shifts (crew_id);
create index shifts_supervisor_idx on shifts (supervisor_employee_id);

create table attendance (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  shift_id      bigint references shifts(id) on delete set null,
  work_date     date not null,
  clock_in      timestamptz,
  clock_out     timestamptz,
  hours_worked  numeric(6,2),
  overtime_hours numeric(6,2) default 0,
  status        text not null default 'present' check (status in ('present','absent','late','leave','sick','training','suspended','off_roster')),
  absence_reason text,
  fitness_check text check (fitness_check in ('passed','failed','not_required')),
  alcohol_test  text check (alcohol_test in ('pass','fail','not_tested')),
  created_at    timestamptz not null default now()
);
create unique index attendance_unique_idx
  on attendance (employee_id, work_date, coalesce(shift_id, 0));
create index attendance_org_date_idx on attendance (org_id, work_date desc);
create index attendance_employee_idx on attendance (employee_id, work_date desc);
create index attendance_shift_id_idx on attendance (shift_id);

-- Tag board / lamp room: statutory record of who is underground.
create table personnel_on_site (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  mine_id       bigint references mines(id) on delete set null,
  employee_id   bigint references employees(id) on delete set null,
  visitor_name  text,
  tag_number    text,
  lamp_number   text,
  self_rescuer_no text,
  entered_at    timestamptz not null default now(),
  exited_at     timestamptz,
  location      text,
  purpose       text,
  escorted_by_employee_id bigint references employees(id) on delete set null
);
create index personnel_on_site_org_idx on personnel_on_site (org_id, entered_at desc);
create index personnel_on_site_site_idx on personnel_on_site (site_id);
create index personnel_on_site_mine_idx on personnel_on_site (mine_id);
create index personnel_on_site_employee_idx on personnel_on_site (employee_id);
create index personnel_on_site_escort_idx on personnel_on_site (escorted_by_employee_id);
create index personnel_on_site_underground_idx on personnel_on_site (site_id) where exited_at is null;

-- Statutory tickets, licences and skills.
create table competencies (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  category      text check (category in ('statutory','licence','operator','safety','first_aid','trade','induction','medical')),
  validity_months int,
  is_mandatory  boolean not null default false,
  applies_to    text,
  unique (org_id, code)
);
create index competencies_org_id_idx on competencies (org_id);

create table employee_competencies (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  competency_id bigint not null references competencies(id) on delete cascade,
  achieved_on   date not null,
  expires_on    date,
  certificate_no text,
  assessor      text,
  status        text not null default 'valid' check (status in ('valid','expiring','expired','revoked','pending')),
  created_at    timestamptz not null default now()
);
create index employee_competencies_org_idx on employee_competencies (org_id);
create index employee_competencies_employee_idx on employee_competencies (employee_id);
create index employee_competencies_competency_idx on employee_competencies (competency_id);
create index employee_competencies_expiry_idx on employee_competencies (org_id, expires_on);

create table training_courses (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  provider      text,
  duration_hours numeric(6,2),
  delivery      text check (delivery in ('classroom','online','on_the_job','simulator','external')),
  competency_id bigint references competencies(id) on delete set null,
  cost_per_person numeric(12,2),
  active        boolean not null default true,
  unique (org_id, code)
);
create index training_courses_org_id_idx on training_courses (org_id);
create index training_courses_competency_idx on training_courses (competency_id);

create table training_records (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  course_id     bigint not null references training_courses(id) on delete cascade,
  scheduled_on  date,
  completed_on  date,
  score         numeric(5,2),
  result        text check (result in ('pass','fail','incomplete','scheduled','no_show')),
  trainer       text,
  cost          numeric(12,2),
  notes         text,
  created_at    timestamptz not null default now()
);
create index training_records_org_idx on training_records (org_id);
create index training_records_employee_idx on training_records (employee_id);
create index training_records_course_idx on training_records (course_id);

create table leave_requests (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  leave_type    text not null check (leave_type in ('annual','sick','compassionate','maternity','paternity','unpaid','study','injury','rostered_off')),
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1),
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','taken')),
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_org_idx on leave_requests (org_id, start_date desc);
create index leave_requests_employee_idx on leave_requests (employee_id);

create table medical_examinations (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  exam_type     text not null check (exam_type in ('pre_employment','periodic','exit','return_to_work','audiometric','spirometry','chest_xray','drug_alcohol')),
  exam_date     date not null,
  next_due_on   date,
  provider      text,
  outcome       text not null default 'fit' check (outcome in ('fit','fit_with_restrictions','temporarily_unfit','unfit','pending')),
  restrictions  text,
  hearing_loss_db numeric(5,1),
  lung_function_pct numeric(5,1),
  confidential_notes text,
  created_at    timestamptz not null default now()
);
create index medical_exams_org_idx on medical_examinations (org_id, exam_date desc);
create index medical_exams_employee_idx on medical_examinations (employee_id);
create index medical_exams_due_idx on medical_examinations (org_id, next_due_on);

create table payroll_periods (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  code          text not null,
  period_start  date not null,
  period_end    date not null,
  pay_date      date,
  status        text not null default 'open' check (status in ('open','calculating','review','approved','paid','closed')),
  gross_total   numeric(16,2),
  deductions_total numeric(16,2),
  net_total     numeric(16,2),
  currency      text default 'USD',
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index payroll_periods_org_idx on payroll_periods (org_id, period_start desc);
create index payroll_periods_site_idx on payroll_periods (site_id);

create table payroll_lines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  period_id     bigint not null references payroll_periods(id) on delete cascade,
  employee_id   bigint not null references employees(id) on delete cascade,
  normal_hours  numeric(8,2) default 0,
  overtime_hours numeric(8,2) default 0,
  base_pay      numeric(14,2) default 0,
  overtime_pay  numeric(14,2) default 0,
  production_bonus numeric(14,2) default 0,
  safety_bonus  numeric(14,2) default 0,
  underground_allowance numeric(14,2) default 0,
  other_allowances numeric(14,2) default 0,
  gross_pay     numeric(14,2) default 0,
  tax           numeric(14,2) default 0,
  pension       numeric(14,2) default 0,
  other_deductions numeric(14,2) default 0,
  net_pay       numeric(14,2) default 0,
  unique (period_id, employee_id)
);
create index payroll_lines_org_idx on payroll_lines (org_id);
create index payroll_lines_period_idx on payroll_lines (period_id);
create index payroll_lines_employee_idx on payroll_lines (employee_id);

-- Grievances, disciplinary and union matters.
create table employee_relations_cases (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  employee_id   bigint references employees(id) on delete set null,
  case_number   text not null,
  case_type     text not null check (case_type in ('grievance','disciplinary','union','harassment','performance','appeal')),
  opened_on     date not null default current_date,
  closed_on     date,
  severity      text check (severity in ('low','medium','high')),
  summary       text,
  outcome       text,
  status        text not null default 'open' check (status in ('open','investigating','hearing','closed','escalated')),
  handled_by    text,
  unique (org_id, case_number)
);
create index er_cases_org_idx on employee_relations_cases (org_id, opened_on desc);
create index er_cases_employee_idx on employee_relations_cases (employee_id);

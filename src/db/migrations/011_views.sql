-- =====================================================================
-- 011_views.sql — reporting layer.
-- Dashboards read these views, never raw tables, so a metric is defined
-- exactly once. Anything here ports to Supabase as-is (add
-- `security_invoker = true` there so RLS still applies to the caller).
-- =====================================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sites_updated_at before update on sites
  for each row execute function set_updated_at();
create trigger mines_updated_at before update on mines
  for each row execute function set_updated_at();
create trigger mining_areas_updated_at before update on mining_areas
  for each row execute function set_updated_at();
create trigger employees_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger assets_updated_at before update on assets
  for each row execute function set_updated_at();
create trigger work_orders_updated_at before update on work_orders
  for each row execute function set_updated_at();
create trigger documents_updated_at before update on documents
  for each row execute function set_updated_at();
create trigger app_users_updated_at before update on app_users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------

create view v_production_daily as
select
  p.org_id,
  p.record_date,
  p.site_id,
  s.name as site_name,
  p.mine_id,
  m.name as mine_name,
  m.commodity,
  m.mine_type,
  sum(p.tonnes) filter (where p.material in ('ore','low_grade','marginal'))            as ore_tonnes,
  sum(p.tonnes) filter (where p.material in ('waste','overburden','interburden'))      as waste_tonnes,
  sum(p.tonnes) filter (where p.material = 'coal')                                     as coal_tonnes,
  sum(p.tonnes)                                                                        as total_tonnes,
  sum(p.volume_bcm)                                                                    as total_bcm,
  case
    when sum(p.tonnes) filter (where p.material in ('ore','coal','low_grade')) > 0
    then round(sum(p.tonnes) filter (where p.material in ('waste','overburden','interburden'))
             / sum(p.tonnes) filter (where p.material in ('ore','coal','low_grade')), 3)
  end                                                                                  as strip_ratio,
  case
    when sum(p.tonnes) filter (where p.grade is not null and p.material in ('ore','low_grade')) > 0
    then round(sum(p.tonnes * p.grade) filter (where p.grade is not null and p.material in ('ore','low_grade'))
             / sum(p.tonnes) filter (where p.grade is not null and p.material in ('ore','low_grade')), 4)
  end                                                                                  as avg_grade,
  sum(p.contained_metal)                                                               as contained_metal,
  case
    when sum(p.tonnes) filter (where p.ash_pct is not null) > 0
    then round(sum(p.tonnes * p.ash_pct) filter (where p.ash_pct is not null)
             / sum(p.tonnes) filter (where p.ash_pct is not null), 3)
  end                                                                                  as avg_ash_pct,
  sum(p.truck_loads)                                                                   as truck_loads
from production_records p
join sites s on s.id = p.site_id
join mines m on m.id = p.mine_id
group by p.org_id, p.record_date, p.site_id, s.name, p.mine_id, m.name, m.commodity, m.mine_type;

create view v_production_monthly as
select
  org_id,
  date_trunc('month', record_date)::date as month,
  site_id,
  site_name,
  mine_id,
  mine_name,
  commodity,
  sum(ore_tonnes)      as ore_tonnes,
  sum(waste_tonnes)    as waste_tonnes,
  sum(coal_tonnes)     as coal_tonnes,
  sum(total_tonnes)    as total_tonnes,
  sum(contained_metal) as contained_metal,
  case
    when sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)) > 0
    then round(sum(coalesce(waste_tonnes, 0)) / sum(coalesce(ore_tonnes, 0) + coalesce(coal_tonnes, 0)), 3)
  end as strip_ratio,
  case
    when sum(ore_tonnes) > 0
    then round(sum(ore_tonnes * coalesce(avg_grade, 0)) / sum(ore_tonnes), 4)
  end as avg_grade
from v_production_daily
group by org_id, date_trunc('month', record_date), site_id, site_name, mine_id, mine_name, commodity;

-- Plan versus actual.
-- Attainment on an in-progress period is measured against the plan pro-rated
-- to the days elapsed, so a plan is never reported as "20% attained" simply
-- because the month is only a fifth of the way through.
create view v_plan_vs_actual as
select
  pl.org_id,
  pl.id             as plan_id,
  pl.mine_id,
  m.name            as mine_name,
  m.commodity,
  pl.code           as plan_code,
  pl.horizon,
  pl.period_start,
  pl.period_end,
  pl.ore_tonnes     as plan_ore_tonnes,
  pl.waste_tonnes   as plan_waste_tonnes,
  pl.coal_tonnes    as plan_coal_tonnes,
  coalesce(a.ore_tonnes, 0)   as actual_ore_tonnes,
  coalesce(a.waste_tonnes, 0) as actual_waste_tonnes,
  coalesce(a.coal_tonnes, 0)  as actual_coal_tonnes,
  round(
    (coalesce(pl.ore_tonnes, 0) + coalesce(pl.coal_tonnes, 0))
    * least(1.0, greatest(0.0,
        (least(current_date, pl.period_end) - pl.period_start + 1)::numeric
        / nullif(pl.period_end - pl.period_start + 1, 0)))
  , 0) as plan_to_date_tonnes,
  case when coalesce(pl.ore_tonnes, 0) + coalesce(pl.coal_tonnes, 0) > 0
    then round(100.0 * (coalesce(a.ore_tonnes, 0) + coalesce(a.coal_tonnes, 0))
             / (coalesce(pl.ore_tonnes, 0) + coalesce(pl.coal_tonnes, 0)), 2)
  end as full_period_attainment_pct,
  case
    when (coalesce(pl.ore_tonnes, 0) + coalesce(pl.coal_tonnes, 0))
         * least(1.0, greatest(0.0,
             (least(current_date, pl.period_end) - pl.period_start + 1)::numeric
             / nullif(pl.period_end - pl.period_start + 1, 0))) > 0
    then round(100.0 * (coalesce(a.ore_tonnes, 0) + coalesce(a.coal_tonnes, 0))
       / ((coalesce(pl.ore_tonnes, 0) + coalesce(pl.coal_tonnes, 0))
          * least(1.0, greatest(0.0,
              (least(current_date, pl.period_end) - pl.period_start + 1)::numeric
              / nullif(pl.period_end - pl.period_start + 1, 0)))), 2)
  end as attainment_pct
from mine_plans pl
join mines m on m.id = pl.mine_id
left join lateral (
  select
    sum(pr.tonnes) filter (where pr.material in ('ore','low_grade','marginal'))       as ore_tonnes,
    sum(pr.tonnes) filter (where pr.material in ('waste','overburden','interburden')) as waste_tonnes,
    sum(pr.tonnes) filter (where pr.material = 'coal')                                as coal_tonnes
  from production_records pr
  where pr.mine_id = pl.mine_id
    and pr.record_date between pl.period_start and pl.period_end
) a on true;

-- ---------------------------------------------------------------------
-- Fleet and maintenance
-- ---------------------------------------------------------------------

create view v_asset_status as
select
  a.org_id,
  a.id            as asset_id,
  a.asset_no,
  a.name,
  a.asset_type,
  a.status,
  a.criticality,
  a.site_id,
  a.mine_id,
  s.name          as site_name,
  a.manufacturer,
  a.model,
  a.ownership,
  lm.reading      as latest_meter,
  lm.reading_at   as latest_meter_at,
  coalesce(d30.downtime_hours, 0)      as downtime_hours_30d,
  coalesce(d30.breakdowns, 0)          as breakdowns_30d,
  round(greatest(0, 100.0 * (720.0 - coalesce(d30.downtime_hours, 0)) / 720.0), 2) as availability_30d_pct,
  coalesce(f30.litres, 0)              as fuel_litres_30d,
  wo.open_work_orders,
  mp.next_service_due
from assets a
left join sites s on s.id = a.site_id
left join lateral (
  select mr.reading, mr.reading_at
  from meter_readings mr
  where mr.asset_id = a.id
  order by mr.reading_at desc
  limit 1
) lm on true
left join lateral (
  select
    sum(de.duration_hours) as downtime_hours,
    count(*) filter (where de.category = 'unplanned_breakdown') as breakdowns
  from downtime_events de
  where de.asset_id = a.id
    and de.started_at >= now() - interval '30 days'
) d30 on true
left join lateral (
  select sum(ft.litres) as litres
  from fuel_transactions ft
  where ft.asset_id = a.id
    and ft.transacted_at >= now() - interval '30 days'
) f30 on true
left join lateral (
  select count(*) as open_work_orders
  from work_orders w
  where w.asset_id = a.id
    and w.status not in ('completed','verified','cancelled')
) wo on true
left join lateral (
  select min(p.next_due_at) as next_service_due
  from maintenance_plans p
  where p.asset_id = a.id and p.active
) mp on true;

create view v_downtime_pareto as
select
  d.org_id,
  d.category,
  count(*)                              as events,
  round(sum(d.duration_hours), 2)       as hours,
  round(avg(d.duration_hours), 2)       as avg_hours,
  date_trunc('month', d.started_at)::date as month
from downtime_events d
where d.duration_hours is not null
group by d.org_id, d.category, date_trunc('month', d.started_at);

create view v_maintenance_due as
select
  p.org_id,
  p.id           as plan_id,
  p.code,
  p.name,
  p.service_type,
  p.asset_id,
  a.asset_no,
  a.name         as asset_name,
  a.site_id,
  a.criticality,
  p.next_due_at,
  p.next_due_meter,
  lm.reading     as current_meter,
  case
    when p.next_due_at is not null and p.next_due_at < now() then 'overdue'
    when p.next_due_at is not null and p.next_due_at < now() + interval '7 days' then 'due_soon'
    when p.next_due_meter is not null and lm.reading is not null and lm.reading >= p.next_due_meter then 'overdue'
    when p.next_due_meter is not null and lm.reading is not null and lm.reading >= p.next_due_meter - 100 then 'due_soon'
    else 'scheduled'
  end as due_status
from maintenance_plans p
join assets a on a.id = p.asset_id
left join lateral (
  select mr.reading from meter_readings mr
  where mr.asset_id = p.asset_id order by mr.reading_at desc limit 1
) lm on true
where p.active;

-- ---------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------

create view v_safety_monthly as
select
  i.org_id,
  i.site_id,
  date_trunc('month', i.occurred_at)::date as month,
  count(*)                                                                   as total_incidents,
  count(*) filter (where i.incident_type = 'near_miss')                      as near_misses,
  count(*) filter (where i.incident_type = 'first_aid')                      as first_aid,
  count(*) filter (where i.incident_type = 'medical_treatment')              as medical_treatment,
  count(*) filter (where i.incident_type = 'restricted_work')                as restricted_work,
  count(*) filter (where i.incident_type = 'lost_time_injury')               as lost_time_injuries,
  count(*) filter (where i.incident_type = 'fatality')                       as fatalities,
  count(*) filter (where i.incident_type = 'high_potential')                 as high_potentials,
  count(*) filter (where i.incident_type = 'environmental')                  as environmental,
  count(*) filter (where i.reportable_to_regulator)                          as reportable,
  sum(i.days_lost)                                                           as days_lost,
  count(*) filter (where i.incident_type in ('lost_time_injury','medical_treatment','restricted_work','fatality')) as recordables
from incidents i
group by i.org_id, i.site_id, date_trunc('month', i.occurred_at);

-- Hours worked underpin every frequency rate, so they come from attendance.
create view v_safety_rates as
select
  m.org_id,
  m.site_id,
  m.month,
  m.recordables,
  m.lost_time_injuries,
  m.fatalities,
  coalesce(h.hours_worked, 0) as hours_worked,
  case when coalesce(h.hours_worked, 0) > 0
    then round(1000000.0 * m.recordables / h.hours_worked, 2) end as trifr,
  case when coalesce(h.hours_worked, 0) > 0
    then round(1000000.0 * m.lost_time_injuries / h.hours_worked, 2) end as ltifr,
  case when coalesce(h.hours_worked, 0) > 0
    then round(1000000.0 * coalesce(m.days_lost, 0) / h.hours_worked, 2) end as severity_rate
from v_safety_monthly m
left join lateral (
  select sum(coalesce(a.hours_worked, 0) + coalesce(a.overtime_hours, 0)) as hours_worked
  from attendance a
  join employees e on e.id = a.employee_id
  where a.org_id = m.org_id
    and (m.site_id is null or e.site_id = m.site_id)
    and date_trunc('month', a.work_date)::date = m.month
) h on true;

create view v_open_actions as
select
  c.org_id,
  c.id,
  c.action_no,
  c.description,
  c.source_entity,
  c.source_id,
  c.priority,
  c.status,
  c.due_on,
  c.assigned_to_name,
  e.first_name || ' ' || e.last_name as assignee,
  c.site_id,
  (current_date - c.due_on)          as days_overdue,
  case
    when c.status in ('completed','verified','cancelled') then 'closed'
    when c.due_on is null then 'no_due_date'
    when c.due_on < current_date then 'overdue'
    when c.due_on <= current_date + 7 then 'due_this_week'
    else 'on_track'
  end as urgency
from corrective_actions c
left join employees e on e.id = c.assigned_to_employee_id;

-- Statutory: who is underground right now.
create view v_personnel_underground as
select
  p.org_id,
  p.site_id,
  p.mine_id,
  m.name as mine_name,
  p.id,
  p.tag_number,
  p.lamp_number,
  coalesce(e.first_name || ' ' || e.last_name, p.visitor_name) as person,
  e.employee_no,
  p.location,
  p.entered_at,
  round(extract(epoch from (now() - p.entered_at)) / 3600.0, 2) as hours_underground
from personnel_on_site p
left join employees e on e.id = p.employee_id
left join mines m on m.id = p.mine_id
where p.exited_at is null;

create view v_competency_expiry as
select
  ec.org_id,
  ec.id,
  ec.employee_id,
  e.employee_no,
  e.first_name || ' ' || e.last_name as employee_name,
  e.site_id,
  e.job_title,
  c.code   as competency_code,
  c.name   as competency_name,
  c.category,
  c.is_mandatory,
  ec.achieved_on,
  ec.expires_on,
  (ec.expires_on - current_date) as days_to_expiry,
  case
    when ec.expires_on is null then 'no_expiry'
    when ec.expires_on < current_date then 'expired'
    when ec.expires_on <= current_date + 30 then 'expiring_30d'
    when ec.expires_on <= current_date + 90 then 'expiring_90d'
    else 'valid'
  end as expiry_status
from employee_competencies ec
join employees e on e.id = ec.employee_id
join competencies c on c.id = ec.competency_id
where ec.status <> 'revoked';

-- ---------------------------------------------------------------------
-- Processing, supply, finance
-- ---------------------------------------------------------------------

create view v_plant_performance as
select
  r.org_id,
  r.plant_id,
  pl.name        as plant_name,
  pl.plant_type,
  pl.site_id,
  r.run_date,
  date_trunc('month', r.run_date)::date as month,
  r.feed_tonnes,
  r.product_tonnes,
  r.recovery_pct,
  r.yield_pct,
  r.throughput_tph,
  pl.design_throughput_tph,
  case when pl.design_throughput_tph > 0
    then round(100.0 * coalesce(r.throughput_tph, 0) / pl.design_throughput_tph, 2) end as capacity_utilisation_pct,
  r.metal_produced,
  r.metal_unit,
  r.operating_hours,
  r.downtime_hours,
  case when coalesce(r.operating_hours, 0) + coalesce(r.downtime_hours, 0) > 0
    then round(100.0 * r.operating_hours / (r.operating_hours + r.downtime_hours), 2) end as availability_pct,
  r.power_kwh,
  case when r.feed_tonnes > 0 then round(r.power_kwh / r.feed_tonnes, 3) end as kwh_per_tonne
from plant_runs r
join plants pl on pl.id = r.plant_id;

create view v_stock_alerts as
select
  sl.org_id,
  sl.id,
  sl.warehouse_id,
  w.name          as warehouse_name,
  w.site_id,
  sl.item_id,
  i.item_code,
  i.name          as item_name,
  i.category,
  i.is_critical,
  i.uom,
  sl.quantity_on_hand,
  sl.quantity_reserved,
  sl.quantity_on_order,
  i.reorder_point,
  i.reorder_qty,
  coalesce(sl.average_cost, i.unit_cost) as unit_cost,
  round(sl.quantity_on_hand * coalesce(sl.average_cost, i.unit_cost, 0), 2) as stock_value,
  case
    when sl.quantity_on_hand <= 0 then 'stockout'
    when i.reorder_point is not null and sl.quantity_on_hand <= i.reorder_point then 'reorder'
    when i.max_level is not null and sl.quantity_on_hand > i.max_level then 'overstocked'
    else 'ok'
  end as stock_status
from stock_levels sl
join items i on i.id = sl.item_id
join warehouses w on w.id = sl.warehouse_id;

create view v_cost_per_tonne as
select
  c.org_id,
  c.site_id,
  c.mine_id,
  date_trunc('month', c.entry_date)::date as month,
  c.category,
  sum(c.amount) as cost,
  t.tonnes_moved,
  t.ore_tonnes,
  case when coalesce(t.tonnes_moved, 0) > 0 then round(sum(c.amount) / t.tonnes_moved, 3) end as cost_per_tonne_moved,
  case when coalesce(t.ore_tonnes, 0) > 0 then round(sum(c.amount) / t.ore_tonnes, 3) end as cost_per_tonne_ore
from cost_entries c
left join lateral (
  select
    sum(p.tonnes) as tonnes_moved,
    sum(p.tonnes) filter (where p.material in ('ore','coal','low_grade')) as ore_tonnes
  from production_records p
  where p.org_id = c.org_id
    and (c.mine_id is null or p.mine_id = c.mine_id)
    and date_trunc('month', p.record_date) = date_trunc('month', c.entry_date)
) t on true
group by c.org_id, c.site_id, c.mine_id, date_trunc('month', c.entry_date), c.category, t.tonnes_moved, t.ore_tonnes;

create view v_budget_variance as
select
  b.org_id,
  b.id            as budget_id,
  b.code          as budget_code,
  b.fiscal_year,
  b.site_id,
  bl.cost_center_id,
  cc.code         as cost_center_code,
  cc.name         as cost_center_name,
  sum(bl.amount)  as budget_amount,
  coalesce(act.actual_amount, 0) as actual_amount,
  coalesce(act.actual_amount, 0) - sum(bl.amount) as variance,
  case when sum(bl.amount) > 0
    then round(100.0 * coalesce(act.actual_amount, 0) / sum(bl.amount), 2) end as spend_pct
from budgets b
join budget_lines bl on bl.budget_id = b.id
left join cost_centers cc on cc.id = bl.cost_center_id
left join lateral (
  select sum(ce.amount) as actual_amount
  from cost_entries ce
  where ce.org_id = b.org_id
    and ce.cost_center_id is not distinct from bl.cost_center_id
    and extract(year from ce.entry_date) = b.fiscal_year
) act on true
group by b.org_id, b.id, b.code, b.fiscal_year, b.site_id, bl.cost_center_id, cc.code, cc.name, act.actual_amount;

-- Anything with a date that is about to bite: one feed for the alert centre.
create view v_compliance_calendar as
select org_id, site_id, 'obligation' as source, reference as ref, title, next_due_on as due_on,
       penalty_risk as risk, status
from regulatory_obligations
where status in ('open','in_progress') and next_due_on is not null
union all
select org_id, site_id, 'tenement', tenement_no, coalesce(name, tenement_no), expires_on,
       case when tenement_type in ('mining_lease','mining_right') then 'critical' else 'medium' end, status
from tenements
where status = 'granted' and expires_on is not null
union all
select org_id, site_id, 'document', coalesce(doc_number, title), title, review_due_on, 'medium', status
from documents
where status = 'approved' and review_due_on is not null
union all
select org_id, site_id, 'audit', audit_no, title, planned_on, 'medium', status
from audits
where status in ('planned','in_progress') and planned_on is not null;

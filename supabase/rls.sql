-- =====================================================================
-- rls.sql — row level security for the Supabase deployment.
--
-- Deliberately NOT part of src/db/migrations: the local PGlite build is
-- single-tenant with no auth layer, so enabling RLS there would only get
-- in the way. Apply this file once the schema is on Supabase and real
-- authentication is wired in.
--
--   supabase db push                     # applies src/db/migrations/*.sql
--   psql "$DATABASE_URL" -f supabase/rls.sql
--
-- Design notes
--   * Every table carries org_id, so each policy is a single indexed
--     column comparison rather than a join.
--   * Helper functions are wrapped in (select ...) so Postgres evaluates
--     them once per statement instead of once per row.
--   * The helpers live in a private schema and EXECUTE is revoked from
--     anon, so they cannot be called directly to probe another tenant.
-- =====================================================================

create schema if not exists private;

-- Which org does the calling user belong to? SECURITY DEFINER so the
-- lookup itself is not subject to the policy it is used by. The
-- auth.uid() check inside is what keeps it safe.
create or replace function private.current_org_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select u.org_id
  from public.app_users u
  where u.auth_uid = (select auth.uid())
    and u.status = 'active'
  limit 1
$$;

create or replace function private.has_permission(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users u
    join public.user_roles ur on ur.user_id = u.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    where u.auth_uid = (select auth.uid())
      and u.status = 'active'
      and (
        rp.permission = '*:*'
        or rp.permission = required
        or rp.permission = split_part(required, ':', 1) || ':*'
        or (rp.permission = '*:read' and split_part(required, ':', 2) = 'read')
      )
  )
$$;

-- Restrict a user to their own site where the platform is configured that
-- way. A null site_id on app_users means "all sites in the org".
create or replace function private.can_see_site(target_site_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u
    where u.auth_uid = (select auth.uid())
      and u.status = 'active'
      and (u.site_id is null or target_site_id is null or u.site_id = target_site_id)
  )
$$;

revoke execute on function private.current_org_id() from public, anon;
revoke execute on function private.has_permission(text) from public, anon;
revoke execute on function private.can_see_site(bigint) from public, anon;
grant execute on function private.current_org_id() to authenticated, service_role;
grant execute on function private.has_permission(text) to authenticated, service_role;
grant execute on function private.can_see_site(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Apply a tenant isolation policy to every table that carries org_id.
-- Writing this as a loop keeps the 120+ tables consistent; there is no
-- table that gets forgotten because someone added it after this file.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', t.table_name);
    execute format('alter table public.%I force row level security', t.table_name);

    execute format('drop policy if exists %I on public.%I', t.table_name || '_tenant_read', t.table_name);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (org_id = (select private.current_org_id()))
    $p$, t.table_name || '_tenant_read', t.table_name);

    execute format('drop policy if exists %I on public.%I', t.table_name || '_tenant_write', t.table_name);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = (select private.current_org_id()))
        with check (org_id = (select private.current_org_id()))
    $p$, t.table_name || '_tenant_write', t.table_name);
  end loop;
end
$$;

-- The orgs table has no org_id of its own.
alter table public.orgs enable row level security;
alter table public.orgs force row level security;
drop policy if exists orgs_self on public.orgs;
create policy orgs_self on public.orgs
  for select to authenticated
  using (id = (select private.current_org_id()));

-- ---------------------------------------------------------------------
-- Tighter policies for the tables that hold personal or sensitive data.
-- These replace the blanket write policy created above.
-- ---------------------------------------------------------------------
drop policy if exists employees_tenant_write on public.employees;
create policy employees_write on public.employees
  for all to authenticated
  using (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:write')))
  with check (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:write')));

-- Medical results are visible only to occupational health, never to line
-- management, even though the rest of the employee record is shared.
drop policy if exists medical_examinations_tenant_read on public.medical_examinations;
drop policy if exists medical_examinations_tenant_write on public.medical_examinations;
create policy medical_examinations_health_only on public.medical_examinations
  for all to authenticated
  using (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:medical')))
  with check (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:medical')));

drop policy if exists payroll_lines_tenant_read on public.payroll_lines;
drop policy if exists payroll_lines_tenant_write on public.payroll_lines;
create policy payroll_lines_payroll_only on public.payroll_lines
  for all to authenticated
  using (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:payroll')))
  with check (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:payroll')));

drop policy if exists employee_relations_cases_tenant_read on public.employee_relations_cases;
drop policy if exists employee_relations_cases_tenant_write on public.employee_relations_cases;
create policy employee_relations_cases_hr_only on public.employee_relations_cases
  for all to authenticated
  using (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:relations')))
  with check (org_id = (select private.current_org_id()) and (select private.has_permission('workforce:relations')));

-- The audit trail is append only: nobody edits history.
drop policy if exists audit_log_tenant_write on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (org_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------
-- Views run with the privileges of the caller so the policies above
-- still apply when a dashboard reads through them.
-- ---------------------------------------------------------------------
do $$
declare
  v record;
begin
  for v in
    select c.relname as view_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.view_name);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- Keep app_users in step with auth.users on sign up.
-- ---------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_users
     set auth_uid = new.id
   where email = new.email
     and auth_uid is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

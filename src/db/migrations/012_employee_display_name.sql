-- =====================================================================
-- 012_employee_display_name.sql
--
-- Anywhere the UI resolves a foreign key it looks for a human-readable
-- column on the target table. Employees only had first_name/last_name,
-- so every reference to a person rendered as an employee number. A
-- stored generated column fixes that once, for every screen, without
-- the application having to know how a name is assembled.
-- =====================================================================

alter table employees
  add column full_name text generated always as (first_name || ' ' || last_name) stored;

create index employees_full_name_idx on employees (org_id, full_name);

-- =====================================================================
-- 007_supply_chain.sql — suppliers, catalogue, warehouses, stock,
-- requisition to purchase order to goods receipt to invoice.
-- =====================================================================

create table suppliers (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  category      text check (category in ('consumables','spares','fuel','explosives','reagents','services','plant_hire','ppe','logistics','it','contractor')),
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  country       text,
  tax_number    text,
  payment_terms text,
  currency      text default 'USD',
  lead_time_days int,
  rating        numeric(3,1) check (rating between 0 and 5),
  is_local      boolean not null default false,
  bee_status    text,
  status        text not null default 'active' check (status in ('prospect','approved','active','on_hold','blacklisted')),
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index suppliers_org_idx on suppliers (org_id);
create index suppliers_status_idx on suppliers (org_id, status);

create table items (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  item_code     text not null,
  name          text not null,
  description   text,
  category      text not null default 'consumable' check (category in ('spare_part','consumable','fuel','lubricant','explosive','reagent','ppe','tool','tyre','electrical','mechanical','stationery','safety','it')),
  uom           text not null default 'ea',
  manufacturer  text,
  manufacturer_part_no text,
  preferred_supplier_id bigint references suppliers(id) on delete set null,
  unit_cost     numeric(14,4),
  currency      text default 'USD',
  reorder_point numeric(14,3),
  reorder_qty   numeric(14,3),
  max_level     numeric(14,3),
  lead_time_days int,
  is_critical   boolean not null default false,
  hazardous     boolean not null default false,
  shelf_life_days int,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, item_code)
);
create index items_org_idx on items (org_id);
create index items_supplier_idx on items (preferred_supplier_id);
create index items_category_idx on items (org_id, category);
create index items_critical_idx on items (org_id) where is_critical;

create table warehouses (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  code          text not null,
  name          text not null,
  warehouse_type text check (warehouse_type in ('main','satellite','underground','fuel','explosives','laydown','scrap','bonded')),
  location      text,
  storekeeper_employee_id bigint references employees(id) on delete set null,
  active        boolean not null default true,
  unique (org_id, code)
);
create index warehouses_org_idx on warehouses (org_id);
create index warehouses_site_idx on warehouses (site_id);
create index warehouses_keeper_idx on warehouses (storekeeper_employee_id);

create table stock_levels (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  warehouse_id  bigint not null references warehouses(id) on delete cascade,
  item_id       bigint not null references items(id) on delete cascade,
  bin_location  text,
  quantity_on_hand numeric(16,3) not null default 0,
  quantity_reserved numeric(16,3) not null default 0,
  quantity_on_order numeric(16,3) not null default 0,
  average_cost  numeric(14,4),
  last_counted_on date,
  last_movement_at timestamptz,
  unique (warehouse_id, item_id)
);
create index stock_levels_org_idx on stock_levels (org_id);
create index stock_levels_warehouse_idx on stock_levels (warehouse_id);
create index stock_levels_item_idx on stock_levels (item_id);

create table stock_movements (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  warehouse_id  bigint not null references warehouses(id) on delete cascade,
  item_id       bigint not null references items(id) on delete cascade,
  moved_at      timestamptz not null default now(),
  movement_type text not null check (movement_type in ('receipt','issue','return','transfer_in','transfer_out','adjustment','scrap','stocktake')),
  quantity      numeric(16,3) not null,
  unit_cost     numeric(14,4),
  total_value   numeric(16,2),
  balance_after numeric(16,3),
  work_order_id bigint references work_orders(id) on delete set null,
  cost_center_id bigint references cost_centers(id) on delete set null,
  issued_to_employee_id bigint references employees(id) on delete set null,
  reference     text,
  notes         text
);
create index stock_moves_org_idx on stock_movements (org_id, moved_at desc);
create index stock_moves_warehouse_idx on stock_movements (warehouse_id, moved_at desc);
create index stock_moves_item_idx on stock_movements (item_id, moved_at desc);
create index stock_moves_wo_idx on stock_movements (work_order_id);
create index stock_moves_cc_idx on stock_movements (cost_center_id);
create index stock_moves_employee_idx on stock_movements (issued_to_employee_id);

create table purchase_requisitions (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  cost_center_id bigint references cost_centers(id) on delete set null,
  requisition_no text not null,
  title         text not null,
  requested_by_employee_id bigint references employees(id) on delete set null,
  requested_on  date not null default current_date,
  required_by   date,
  priority      text not null default 'normal' check (priority in ('emergency','urgent','normal','low')),
  justification text,
  estimated_value numeric(16,2),
  currency      text default 'USD',
  status        text not null default 'draft' check (status in ('draft','submitted','approved','rejected','converted','cancelled')),
  approved_by   text,
  approved_at   timestamptz,
  work_order_id bigint references work_orders(id) on delete set null,
  unique (org_id, requisition_no)
);
create index prs_org_idx on purchase_requisitions (org_id, requested_on desc);
create index prs_site_idx on purchase_requisitions (site_id);
create index prs_cc_idx on purchase_requisitions (cost_center_id);
create index prs_requester_idx on purchase_requisitions (requested_by_employee_id);
create index prs_wo_idx on purchase_requisitions (work_order_id);

create table requisition_lines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  requisition_id bigint not null references purchase_requisitions(id) on delete cascade,
  item_id       bigint references items(id) on delete set null,
  line_no       int not null default 1,
  description   text not null,
  quantity      numeric(16,3) not null,
  uom           text default 'ea',
  estimated_unit_cost numeric(14,4),
  line_total    numeric(16,2)
);
create index req_lines_org_idx on requisition_lines (org_id);
create index req_lines_req_idx on requisition_lines (requisition_id);
create index req_lines_item_idx on requisition_lines (item_id);

create table purchase_orders (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  supplier_id   bigint not null references suppliers(id) on delete restrict,
  requisition_id bigint references purchase_requisitions(id) on delete set null,
  cost_center_id bigint references cost_centers(id) on delete set null,
  po_number     text not null,
  order_date    date not null default current_date,
  expected_date date,
  delivery_site text,
  incoterms     text,
  payment_terms text,
  currency      text default 'USD',
  subtotal      numeric(18,2) default 0,
  tax_amount    numeric(18,2) default 0,
  freight       numeric(18,2) default 0,
  total_amount  numeric(18,2) default 0,
  received_value numeric(18,2) default 0,
  status        text not null default 'draft' check (status in ('draft','issued','acknowledged','partially_received','received','invoiced','closed','cancelled')),
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, po_number)
);
create index pos_org_idx on purchase_orders (org_id, order_date desc);
create index pos_site_idx on purchase_orders (site_id);
create index pos_supplier_idx on purchase_orders (supplier_id);
create index pos_requisition_idx on purchase_orders (requisition_id);
create index pos_cc_idx on purchase_orders (cost_center_id);
create index pos_open_idx on purchase_orders (org_id, status) where status not in ('closed','cancelled');

create table purchase_order_lines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  po_id         bigint not null references purchase_orders(id) on delete cascade,
  item_id       bigint references items(id) on delete set null,
  line_no       int not null default 1,
  description   text not null,
  quantity      numeric(16,3) not null,
  uom           text default 'ea',
  unit_price    numeric(14,4) not null default 0,
  line_total    numeric(18,2),
  quantity_received numeric(16,3) not null default 0,
  expected_date date
);
create index po_lines_org_idx on purchase_order_lines (org_id);
create index po_lines_po_idx on purchase_order_lines (po_id);
create index po_lines_item_idx on purchase_order_lines (item_id);

create table goods_receipts (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  po_id         bigint references purchase_orders(id) on delete set null,
  warehouse_id  bigint references warehouses(id) on delete set null,
  grn_number    text not null,
  received_on   date not null default current_date,
  delivery_note text,
  carrier       text,
  received_by_employee_id bigint references employees(id) on delete set null,
  inspection_result text check (inspection_result in ('accepted','partially_accepted','rejected','quarantined')),
  total_value   numeric(18,2),
  notes         text,
  unique (org_id, grn_number)
);
create index grn_org_idx on goods_receipts (org_id, received_on desc);
create index grn_po_idx on goods_receipts (po_id);
create index grn_warehouse_idx on goods_receipts (warehouse_id);
create index grn_receiver_idx on goods_receipts (received_by_employee_id);

create table goods_receipt_lines (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  grn_id        bigint not null references goods_receipts(id) on delete cascade,
  po_line_id    bigint references purchase_order_lines(id) on delete set null,
  item_id       bigint references items(id) on delete set null,
  quantity_received numeric(16,3) not null,
  quantity_accepted numeric(16,3),
  quantity_rejected numeric(16,3) default 0,
  unit_cost     numeric(14,4),
  line_value    numeric(18,2),
  batch_no      text,
  expiry_date   date,
  rejection_reason text
);
create index grn_lines_org_idx on goods_receipt_lines (org_id);
create index grn_lines_grn_idx on goods_receipt_lines (grn_id);
create index grn_lines_po_line_idx on goods_receipt_lines (po_line_id);
create index grn_lines_item_idx on goods_receipt_lines (item_id);

create table supplier_invoices (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  supplier_id   bigint not null references suppliers(id) on delete restrict,
  po_id         bigint references purchase_orders(id) on delete set null,
  invoice_no    text not null,
  invoice_date  date not null,
  due_date      date,
  currency      text default 'USD',
  subtotal      numeric(18,2),
  tax_amount    numeric(18,2),
  total_amount  numeric(18,2) not null,
  paid_amount   numeric(18,2) default 0,
  status        text not null default 'received' check (status in ('received','matched','disputed','approved','partially_paid','paid','cancelled')),
  three_way_matched boolean not null default false,
  paid_on       date,
  unique (org_id, supplier_id, invoice_no)
);
create index sup_inv_org_idx on supplier_invoices (org_id, invoice_date desc);
create index sup_inv_supplier_idx on supplier_invoices (supplier_id);
create index sup_inv_po_idx on supplier_invoices (po_id);
create index sup_inv_unpaid_idx on supplier_invoices (org_id, due_date) where status not in ('paid','cancelled');

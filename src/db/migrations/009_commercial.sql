-- =====================================================================
-- 009_commercial.sql — selling the product: customers, offtake
-- contracts, sales orders, weighbridge, shipments and receivables.
-- =====================================================================

create table customers (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  code          text not null,
  name          text not null,
  customer_type text check (customer_type in ('refinery','trader','utility','steel_mill','smelter','domestic','export','spot')),
  country       text,
  contact_name  text,
  email         text,
  phone         text,
  credit_limit  numeric(18,2),
  payment_terms text,
  currency      text default 'USD',
  status        text not null default 'active' check (status in ('prospect','active','on_hold','closed')),
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index customers_org_idx on customers (org_id);

create table sales_contracts (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  customer_id   bigint not null references customers(id) on delete restrict,
  product_spec_id bigint references product_specs(id) on delete set null,
  contract_no   text not null,
  title         text,
  commodity     text not null,
  contract_type text not null default 'offtake' check (contract_type in ('offtake','spot','term','tolling','streaming','forward')),
  start_date    date not null,
  end_date      date,
  contracted_tonnes numeric(18,3),
  delivered_tonnes numeric(18,3) default 0,
  price_basis   text check (price_basis in ('fixed','index_linked','spot','formula','provisional')),
  base_price    numeric(16,4),
  price_index   text,
  currency      text default 'USD',
  incoterms     text check (incoterms in ('EXW','FCA','FOB','CFR','CIF','DAP','DDP','FAS','CPT','CIP')),
  delivery_point text,
  quality_penalties text,
  status        text not null default 'active' check (status in ('draft','active','suspended','completed','terminated')),
  unique (org_id, contract_no)
);
create index contracts_org_idx on sales_contracts (org_id);
create index contracts_customer_idx on sales_contracts (customer_id);
create index contracts_spec_idx on sales_contracts (product_spec_id);

create table sales_orders (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  customer_id   bigint not null references customers(id) on delete restrict,
  contract_id   bigint references sales_contracts(id) on delete set null,
  order_no      text not null,
  order_date    date not null default current_date,
  requested_delivery date,
  commodity     text,
  quantity_tonnes numeric(16,3),
  unit_price    numeric(16,4),
  currency      text default 'USD',
  order_value   numeric(18,2),
  destination   text,
  transport_mode text check (transport_mode in ('road','rail','conveyor','ship','barge','pipeline','air')),
  status        text not null default 'confirmed' check (status in ('draft','confirmed','allocated','in_transit','delivered','invoiced','closed','cancelled')),
  unique (org_id, order_no)
);
create index sales_orders_org_idx on sales_orders (org_id, order_date desc);
create index sales_orders_customer_idx on sales_orders (customer_id);
create index sales_orders_contract_idx on sales_orders (contract_id);

-- Every truck/wagon over the weighbridge, in or out.
create table weighbridge_tickets (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint not null references sites(id) on delete cascade,
  ticket_no     text not null,
  weighed_at    timestamptz not null default now(),
  direction     text not null check (direction in ('inbound','outbound','internal')),
  vehicle_rego  text,
  carrier       text,
  driver_name   text,
  driver_licence text,
  asset_id      bigint references assets(id) on delete set null,
  material      text,
  product_spec_id bigint references product_specs(id) on delete set null,
  gross_kg      numeric(14,2),
  tare_kg       numeric(14,2),
  net_kg        numeric(14,2),
  moisture_pct  numeric(6,3),
  dry_net_kg    numeric(14,2),
  stockpile_id  bigint references stockpiles(id) on delete set null,
  sales_order_id bigint references sales_orders(id) on delete set null,
  shipment_id   bigint,
  seal_no       text,
  operator      text,
  status        text not null default 'complete' check (status in ('open','complete','void','disputed')),
  unique (org_id, ticket_no)
);
create index wb_org_idx on weighbridge_tickets (org_id, weighed_at desc);
create index wb_site_idx on weighbridge_tickets (site_id, weighed_at desc);
create index wb_asset_idx on weighbridge_tickets (asset_id);
create index wb_spec_idx on weighbridge_tickets (product_spec_id);
create index wb_stockpile_idx on weighbridge_tickets (stockpile_id);
create index wb_order_idx on weighbridge_tickets (sales_order_id);
create index wb_shipment_idx on weighbridge_tickets (shipment_id);

create table shipments (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  customer_id   bigint references customers(id) on delete set null,
  contract_id   bigint references sales_contracts(id) on delete set null,
  sales_order_id bigint references sales_orders(id) on delete set null,
  shipment_no   text not null,
  dispatched_on date,
  arrived_on    date,
  transport_mode text check (transport_mode in ('road','rail','conveyor','ship','barge','pipeline','air')),
  carrier       text,
  vessel_name   text,
  wagon_count   int,
  truck_count   int,
  origin        text,
  destination   text,
  gross_tonnes  numeric(16,3),
  moisture_pct  numeric(6,3),
  dry_tonnes    numeric(16,3),
  grade         numeric(12,4),
  ash_pct       numeric(6,3),
  cv_kcal_kg    numeric(9,2),
  sulphur_pct   numeric(6,3),
  quality_certificate text,
  freight_cost  numeric(18,2),
  royalty_amount numeric(18,2),
  invoice_value numeric(18,2),
  currency      text default 'USD',
  status        text not null default 'planned' check (status in ('planned','loading','in_transit','delivered','weighed','invoiced','settled','claimed')),
  unique (org_id, shipment_no)
);
create index shipments_org_idx on shipments (org_id, dispatched_on desc);
create index shipments_site_idx on shipments (site_id);
create index shipments_customer_idx on shipments (customer_id);
create index shipments_contract_idx on shipments (contract_id);
create index shipments_order_idx on shipments (sales_order_id);

create table customer_invoices (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  customer_id   bigint not null references customers(id) on delete restrict,
  shipment_id   bigint references shipments(id) on delete set null,
  sales_order_id bigint references sales_orders(id) on delete set null,
  invoice_no    text not null,
  invoice_date  date not null default current_date,
  due_date      date,
  quantity_tonnes numeric(16,3),
  unit_price    numeric(16,4),
  subtotal      numeric(18,2),
  quality_adjustment numeric(18,2) default 0,
  royalty       numeric(18,2) default 0,
  tax_amount    numeric(18,2) default 0,
  total_amount  numeric(18,2) not null,
  received_amount numeric(18,2) default 0,
  currency      text default 'USD',
  status        text not null default 'issued' check (status in ('draft','issued','provisional','final','partially_paid','paid','overdue','disputed','written_off')),
  paid_on       date,
  unique (org_id, invoice_no)
);
create index cust_inv_org_idx on customer_invoices (org_id, invoice_date desc);
create index cust_inv_customer_idx on customer_invoices (customer_id);
create index cust_inv_shipment_idx on customer_invoices (shipment_id);
create index cust_inv_order_idx on customer_invoices (sales_order_id);
create index cust_inv_outstanding_idx on customer_invoices (org_id, due_date) where status not in ('paid','written_off');

create table royalties (
  id            bigint generated always as identity primary key,
  org_id        bigint not null references orgs(id) on delete cascade,
  site_id       bigint references sites(id) on delete set null,
  period_start  date not null,
  period_end    date not null,
  royalty_type  text not null check (royalty_type in ('government','landowner','community','private','ngr','ad_valorem','profit_based')),
  payee         text,
  basis_tonnes  numeric(18,3),
  basis_revenue numeric(18,2),
  rate_pct      numeric(8,4),
  amount        numeric(18,2) not null,
  currency      text default 'USD',
  status        text not null default 'accrued' check (status in ('accrued','declared','paid','disputed')),
  paid_on       date,
  reference     text
);
create index royalties_org_idx on royalties (org_id, period_start desc);
create index royalties_site_idx on royalties (site_id);

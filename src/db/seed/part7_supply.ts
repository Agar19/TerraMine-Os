import { insertMany, pad } from './helpers'
import { addDays, isoDate } from './rng'
import type { SeedContext } from './context'
import { SPARE_PARTS, SUPPLIER_NAMES } from './names'

export async function seedSupplyChain(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx

  await insertMany(
    db,
    'suppliers',
    ['org_id', 'code', 'name', 'category', 'contact_name', 'email', 'phone', 'address', 'country', 'tax_number', 'payment_terms', 'currency', 'lead_time_days', 'rating', 'is_local', 'status'],
    SUPPLIER_NAMES.map((name, i) => [
      orgId, `SUP-${pad(i + 1, 4)}`, name,
      rng.weighted([['spares', 30], ['consumables', 20], ['services', 14], ['ppe', 10], ['reagents', 8], ['fuel', 6], ['explosives', 5], ['logistics', 4], ['it', 3]]),
      `${rng.pick(['A.', 'M.', 'J.', 'K.', 'S.'])} ${rng.pick(['Naidoo', 'Chen', 'Larsen', 'Osei', 'Reyes', 'Botha'])}`,
      `sales@${name.split(' ')[0].toLowerCase()}.com`,
      `+${rng.int(20, 61)} ${rng.int(10, 89)} ${rng.int(200, 999)} ${rng.int(1000, 9999)}`,
      `${rng.int(1, 400)} ${rng.pick(['Industrial', 'Mining', 'Commerce', 'Foundry'])} Road, ${rng.pick(['Perth', 'Johannesburg', 'Lima', 'Kitwe', 'Singapore'])}`,
      rng.pick(['Australia', 'South Africa', 'Peru', 'Zambia', 'Singapore', 'Germany']),
      `VAT${rng.int(1000000, 9999999)}`,
      rng.pick(['30 days', '45 days', '60 days', 'Cash on delivery']), 'USD',
      rng.int(2, 120), rng.num(2.4, 5, 1), rng.bool(0.4),
      rng.weighted([['active', 8], ['approved', 2], ['on_hold', 1], ['blacklisted', 1]]),
    ]),
  )
  ctx.supplierIds = SUPPLIER_NAMES.map((_, i) => i + 1)

  const itemRows: unknown[][] = []
  const itemCosts: number[] = []
  SPARE_PARTS.forEach(([name, category, uom, cost], i) => {
    const reorder = rng.int(2, 60)
    itemRows.push([
      orgId, `ITM-${pad(i + 1, 5)}`, name,
      `${name} - stocked line for site maintenance and operations.`,
      category, uom,
      rng.pick(['Caterpillar', 'Komatsu', 'Sandvik', 'Weir', 'Metso', 'Generic', 'Epiroc', 'MSA']),
      `MP-${rng.int(10000, 99999)}`, rng.pick(ctx.supplierIds), cost, 'USD',
      reorder, reorder * rng.int(2, 5), reorder * rng.int(6, 12), rng.int(3, 120),
      cost > 5000 || category === 'explosive', category === 'explosive' || category === 'reagent',
      category === 'reagent' ? 720 : null, true,
    ])
    itemCosts.push(cost)
  })
  await insertMany(
    db,
    'items',
    ['org_id', 'item_code', 'name', 'description', 'category', 'uom', 'manufacturer', 'manufacturer_part_no', 'preferred_supplier_id', 'unit_cost', 'currency', 'reorder_point', 'reorder_qty', 'max_level', 'lead_time_days', 'is_critical', 'hazardous', 'shelf_life_days', 'active'],
    itemRows,
  )
  ctx.itemIds = SPARE_PARTS.map((_, i) => i + 1)
  ctx.itemCosts = itemCosts

  const whRows: unknown[][] = []
  let whId = 0
  for (const site of ctx.sites) {
    for (const [code, name, type] of [
      ['MAIN', 'Main Warehouse', 'main'],
      ['WKS', 'Workshop Store', 'satellite'],
      ['FUEL', 'Fuel Farm', 'fuel'],
    ] as const) {
      whId += 1
      whRows.push([
        orgId, site.id, `${site.code}-${code}`, `${site.code} ${name}`, type,
        rng.pick(['Main gate area', 'Workshop precinct', 'Plant area']), null, true,
      ])
    }
  }
  await insertMany(
    db,
    'warehouses',
    ['org_id', 'site_id', 'code', 'name', 'warehouse_type', 'location', 'storekeeper_employee_id', 'active'],
    whRows,
  )
  ctx.warehouseIds = whRows.map((_, i) => i + 1)
  const mainWarehouses = ctx.warehouseIds.filter((_, i) => i % 3 === 0)

  // ---- Stock levels ------------------------------------------------------
  const stockRows: unknown[][] = []
  const stockIndex: { warehouseId: number; itemId: number; qty: number; cost: number }[] = []
  for (const warehouseId of mainWarehouses) {
    for (const itemId of ctx.itemIds) {
      if (rng.bool(0.18)) continue
      const cost = itemCosts[itemId - 1]
      const qty = rng.weighted([[0, 6], [rng.num(1, 12, 1), 22], [rng.num(12, 90, 1), 52], [rng.num(90, 600, 1), 20]])
      stockRows.push([
        orgId, warehouseId, itemId, `${rng.pick(['A', 'B', 'C', 'D'])}${rng.int(1, 24)}-${rng.int(1, 8)}`,
        qty, rng.bool(0.2) ? rng.num(1, 12, 1) : 0, rng.bool(0.3) ? rng.num(2, 40, 1) : 0,
        Math.round(cost * rng.num(0.9, 1.14, 4) * 10000) / 10000,
        isoDate(addDays(today, -rng.int(5, 320))), addDays(today, -rng.int(0, 60)).toISOString(),
      ])
      stockIndex.push({ warehouseId, itemId, qty, cost })
    }
  }
  await insertMany(
    db,
    'stock_levels',
    ['org_id', 'warehouse_id', 'item_id', 'bin_location', 'quantity_on_hand', 'quantity_reserved', 'quantity_on_order', 'average_cost', 'last_counted_on', 'last_movement_at'],
    stockRows,
  )

  const artisans = ctx.employees.filter((e) => e.group === 'artisan')
  const moveRows: unknown[][] = []
  for (let i = 0; i < 4200; i++) {
    const entry = rng.pick(stockIndex)
    const type = rng.weighted([['issue', 48], ['receipt', 28], ['return', 8], ['transfer_out', 6], ['adjustment', 5], ['stocktake', 3], ['scrap', 2]])
    const qty = rng.num(1, 24, 2)
    const signed = ['issue', 'transfer_out', 'scrap'].includes(type) ? -qty : qty
    moveRows.push([
      orgId, entry.warehouseId, entry.itemId,
      addDays(today, -rng.int(0, 180)).toISOString(), type, signed, entry.cost,
      Math.round(Math.abs(signed) * entry.cost * 100) / 100,
      Math.max(0, Math.round((entry.qty + signed) * 100) / 100),
      type === 'issue' ? rng.pick(ctx.workOrderIds) : null,
      rng.pick(ctx.costCenterIds),
      type === 'issue' && artisans.length ? rng.pick(artisans).id : null,
      type === 'receipt' ? `GRN-${rng.int(1000, 9999)}` : type === 'issue' ? `WO-${rng.int(1000, 9999)}` : `REF-${rng.int(1000, 9999)}`,
      null,
    ])
  }
  await insertMany(
    db,
    'stock_movements',
    ['org_id', 'warehouse_id', 'item_id', 'moved_at', 'movement_type', 'quantity', 'unit_cost', 'total_value', 'balance_after', 'work_order_id', 'cost_center_id', 'issued_to_employee_id', 'reference', 'notes'],
    moveRows,
  )

  // Work-order parts now that items exist.
  const woPartRows: unknown[][] = []
  for (const woId of ctx.workOrderIds) {
    if (rng.bool(0.35)) continue
    for (let k = 0; k < rng.int(1, 4); k++) {
      const itemId = rng.pick(ctx.itemIds)
      const qty = rng.num(1, 8, 2)
      const cost = itemCosts[itemId - 1]
      woPartRows.push([
        orgId, woId, itemId, `MP-${rng.int(10000, 99999)}`, SPARE_PARTS[itemId - 1][0], qty, cost,
        Math.round(qty * cost * 100) / 100,
        rng.bool(0.7) ? addDays(today, -rng.int(0, 140)).toISOString() : null,
        rng.weighted([['issued', 6], ['reserved', 2], ['requested', 2]]),
      ])
    }
  }
  await insertMany(
    db,
    'work_order_parts',
    ['org_id', 'work_order_id', 'item_id', 'part_number', 'description', 'quantity', 'unit_cost', 'line_cost', 'issued_at', 'status'],
    woPartRows,
  )

  // ---- Requisitions -> purchase orders -> receipts -------------------------
  const requesters = ctx.employees.filter((e) => ['supervisor', 'professional', 'management', 'administration'].includes(e.group))
  const reqRows: unknown[][] = []
  const reqLineRows: unknown[][] = []
  const REQ_COUNT = 180
  for (let i = 0; i < REQ_COUNT; i++) {
    const requested = addDays(today, -rng.int(0, 200))
    const lineCount = rng.int(1, 5)
    let value = 0
    for (let l = 0; l < lineCount; l++) {
      const itemId = rng.pick(ctx.itemIds)
      const qty = rng.num(1, 40, 1)
      const cost = itemCosts[itemId - 1]
      const total = Math.round(qty * cost * 100) / 100
      value += total
      reqLineRows.push([orgId, i + 1, itemId, l + 1, SPARE_PARTS[itemId - 1][0], qty, SPARE_PARTS[itemId - 1][2], cost, total])
    }
    const status = requested < addDays(today, -30)
      ? rng.weighted([['converted', 7], ['approved', 1], ['rejected', 1], ['cancelled', 1]])
      : rng.weighted([['submitted', 4], ['approved', 4], ['draft', 2]])
    reqRows.push([
      orgId, rng.pick(ctx.sites).id, rng.pick(ctx.costCenterIds), `PR-${pad(i + 1, 5)}`,
      rng.pick(['Critical spares replenishment', 'Planned shutdown materials', 'PPE restock', 'Reagent bulk order', 'Workshop consumables', 'Tyre replacement programme', 'Conveyor belt spares']),
      requesters.length ? rng.pick(requesters).id : null, isoDate(requested),
      isoDate(addDays(requested, rng.int(7, 60))),
      rng.weighted([['normal', 6], ['urgent', 3], ['emergency', 1], ['low', 2]]),
      rng.pick(['Stock below reorder point', 'Required for planned shutdown', 'Breakdown recovery', 'Statutory compliance', 'New crew intake']),
      Math.round(value * 100) / 100, 'USD', status,
      status === 'approved' || status === 'converted' ? rng.pick(['T. Mokoena', 'S. Hughes', 'I. Petrov']) : null,
      status === 'approved' || status === 'converted' ? addDays(requested, rng.int(1, 8)).toISOString() : null,
      rng.bool(0.3) ? rng.pick(ctx.workOrderIds) : null,
    ])
  }
  await insertMany(
    db,
    'purchase_requisitions',
    ['org_id', 'site_id', 'cost_center_id', 'requisition_no', 'title', 'requested_by_employee_id', 'requested_on', 'required_by', 'priority', 'justification', 'estimated_value', 'currency', 'status', 'approved_by', 'approved_at', 'work_order_id'],
    reqRows,
  )
  await insertMany(
    db,
    'requisition_lines',
    ['org_id', 'requisition_id', 'item_id', 'line_no', 'description', 'quantity', 'uom', 'estimated_unit_cost', 'line_total'],
    reqLineRows,
  )

  const poRows: unknown[][] = []
  const poLineRows: unknown[][] = []
  const poMeta: { id: number; total: number; supplierId: number; ordered: Date; status: string }[] = []
  const PO_COUNT = 220
  let poLineId = 0
  for (let i = 0; i < PO_COUNT; i++) {
    const ordered = addDays(today, -rng.int(0, 220))
    const supplierId = rng.pick(ctx.supplierIds)
    const lineCount = rng.int(1, 6)
    let subtotal = 0
    const status = ordered < addDays(today, -60)
      ? rng.weighted([['closed', 5], ['received', 3], ['invoiced', 3], ['cancelled', 1]])
      : rng.weighted([['issued', 4], ['acknowledged', 3], ['partially_received', 2], ['received', 2], ['draft', 1]])
    const received = ['received', 'invoiced', 'closed'].includes(status)
    for (let l = 0; l < lineCount; l++) {
      poLineId += 1
      const itemId = rng.pick(ctx.itemIds)
      const qty = rng.num(1, 60, 1)
      const price = Math.round(itemCosts[itemId - 1] * rng.num(0.94, 1.12, 4) * 10000) / 10000
      const total = Math.round(qty * price * 100) / 100
      subtotal += total
      poLineRows.push([
        orgId, i + 1, itemId, l + 1, SPARE_PARTS[itemId - 1][0], qty, SPARE_PARTS[itemId - 1][2], price, total,
        received ? qty : status === 'partially_received' ? Math.round(qty * rng.num(0.2, 0.8, 2) * 10) / 10 : 0,
        isoDate(addDays(ordered, rng.int(5, 70))),
      ])
    }
    const tax = Math.round(subtotal * 0.15 * 100) / 100
    const freight = Math.round(subtotal * rng.num(0.01, 0.06, 4) * 100) / 100
    const total = Math.round((subtotal + tax + freight) * 100) / 100
    poRows.push([
      orgId, rng.pick(ctx.sites).id, supplierId,
      rng.bool(0.6) ? rng.int(1, REQ_COUNT) : null, rng.pick(ctx.costCenterIds),
      `PO-${pad(i + 1, 5)}`, isoDate(ordered), isoDate(addDays(ordered, rng.int(7, 90))),
      rng.pick(['Main Warehouse', 'Workshop Store', 'Plant laydown']),
      rng.pick(['DAP', 'CIP', 'EXW', 'FCA']), rng.pick(['30 days', '45 days', '60 days']), 'USD',
      Math.round(subtotal * 100) / 100, tax, freight, total,
      received ? total : status === 'partially_received' ? Math.round(total * 0.5 * 100) / 100 : 0,
      status,
      status === 'draft' ? null : rng.pick(['I. Petrov', 'D. Silva', 'Supply Manager']),
      status === 'draft' ? null : addDays(ordered, -1).toISOString(),
    ])
    poMeta.push({ id: i + 1, total, supplierId, ordered, status })
  }
  await insertMany(
    db,
    'purchase_orders',
    ['org_id', 'site_id', 'supplier_id', 'requisition_id', 'cost_center_id', 'po_number', 'order_date', 'expected_date', 'delivery_site', 'incoterms', 'payment_terms', 'currency', 'subtotal', 'tax_amount', 'freight', 'total_amount', 'received_value', 'status', 'approved_by', 'approved_at'],
    poRows,
  )
  await insertMany(
    db,
    'purchase_order_lines',
    ['org_id', 'po_id', 'item_id', 'line_no', 'description', 'quantity', 'uom', 'unit_price', 'line_total', 'quantity_received', 'expected_date'],
    poLineRows,
  )

  const grnRows: unknown[][] = []
  const grnLineRows: unknown[][] = []
  let grnId = 0
  const storemen = ctx.employees.filter((e) => e.title === 'Storeman')
  for (const po of poMeta) {
    if (!['received', 'invoiced', 'closed', 'partially_received'].includes(po.status)) continue
    grnId += 1
    const receivedOn = addDays(po.ordered, rng.int(5, 60))
    grnRows.push([
      orgId, po.id, rng.pick(mainWarehouses), `GRN-${pad(grnId, 5)}`, isoDate(receivedOn),
      `DN-${rng.int(100000, 999999)}`, rng.pick(['Supplier delivery', 'Courier', 'Own transport']),
      storemen.length ? rng.pick(storemen).id : null,
      rng.weighted([['accepted', 8], ['partially_accepted', 1], ['quarantined', 1]]),
      po.total, rng.bool(0.2) ? 'Packaging damaged, contents inspected and accepted.' : null,
    ])
    for (let l = 0; l < rng.int(1, 4); l++) {
      const itemId = rng.pick(ctx.itemIds)
      const qty = rng.num(1, 40, 1)
      const rejected = rng.bool(0.12) ? rng.num(0.5, 3, 1) : 0
      grnLineRows.push([
        orgId, grnId, null, itemId, qty, Math.round((qty - rejected) * 100) / 100, rejected,
        itemCosts[itemId - 1], Math.round(qty * itemCosts[itemId - 1] * 100) / 100,
        `B${rng.int(10000, 99999)}`, rng.bool(0.3) ? isoDate(addDays(today, rng.int(90, 900))) : null,
        rejected > 0 ? rng.pick(['Damaged in transit', 'Incorrect part number', 'Certificate missing']) : null,
      ])
    }
  }
  await insertMany(
    db,
    'goods_receipts',
    ['org_id', 'po_id', 'warehouse_id', 'grn_number', 'received_on', 'delivery_note', 'carrier', 'received_by_employee_id', 'inspection_result', 'total_value', 'notes'],
    grnRows,
  )
  await insertMany(
    db,
    'goods_receipt_lines',
    ['org_id', 'grn_id', 'po_line_id', 'item_id', 'quantity_received', 'quantity_accepted', 'quantity_rejected', 'unit_cost', 'line_value', 'batch_no', 'expiry_date', 'rejection_reason'],
    grnLineRows,
  )

  const invRows: unknown[][] = []
  let invSeq = 0
  for (const po of poMeta) {
    if (!['invoiced', 'closed', 'received'].includes(po.status)) continue
    invSeq += 1
    const invoiceDate = addDays(po.ordered, rng.int(20, 80))
    const due = addDays(invoiceDate, 30)
    const status = due < today
      ? rng.weighted([['paid', 7], ['partially_paid', 1], ['disputed', 1], ['approved', 1]])
      : rng.weighted([['approved', 4], ['matched', 3], ['received', 3]])
    invRows.push([
      orgId, po.supplierId, po.id, `INV-${pad(invSeq, 5)}-${po.id}`, isoDate(invoiceDate), isoDate(due), 'USD',
      Math.round(po.total / 1.15 * 100) / 100, Math.round((po.total - po.total / 1.15) * 100) / 100, po.total,
      status === 'paid' ? po.total : status === 'partially_paid' ? Math.round(po.total * 0.5 * 100) / 100 : 0,
      status, status !== 'received', status === 'paid' ? isoDate(addDays(due, -rng.int(0, 12))) : null,
    ])
  }
  await insertMany(
    db,
    'supplier_invoices',
    ['org_id', 'supplier_id', 'po_id', 'invoice_no', 'invoice_date', 'due_date', 'currency', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount', 'status', 'three_way_matched', 'paid_on'],
    invRows,
  )
}

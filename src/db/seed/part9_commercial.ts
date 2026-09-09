import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { SeedContext } from './context'
import { CUSTOMER_NAMES } from './names'

const KPIS: readonly (readonly [string, string, string, string, string, string])[] = [
  ['PRD-TOT', 'Total material moved', 'production', 't', 'higher_better', 'monthly'],
  ['PRD-ORE', 'Ore and coal mined', 'production', 't', 'higher_better', 'monthly'],
  ['PRD-SR', 'Strip ratio', 'production', 'waste:ore', 'lower_better', 'monthly'],
  ['PRD-GRD', 'Head grade delivered', 'production', 'g/t', 'target_band', 'monthly'],
  ['PRD-DEV', 'Development metres', 'production', 'm', 'higher_better', 'monthly'],
  ['PRC-THR', 'Plant throughput', 'processing', 't', 'higher_better', 'monthly'],
  ['PRC-REC', 'Metallurgical recovery', 'processing', '%', 'higher_better', 'monthly'],
  ['PRC-YLD', 'Plant yield', 'processing', '%', 'higher_better', 'monthly'],
  ['PRC-AVL', 'Plant availability', 'processing', '%', 'higher_better', 'monthly'],
  ['PRC-KWH', 'Power intensity', 'processing', 'kWh/t', 'lower_better', 'monthly'],
  ['SAF-TRIFR', 'Total recordable injury frequency rate', 'safety', 'per 1M hrs', 'lower_better', 'monthly'],
  ['SAF-LTIFR', 'Lost time injury frequency rate', 'safety', 'per 1M hrs', 'lower_better', 'monthly'],
  ['SAF-NM', 'Near miss reports', 'safety', 'count', 'higher_better', 'monthly'],
  ['SAF-ACT', 'Actions closed on time', 'safety', '%', 'higher_better', 'monthly'],
  ['SAF-HIPO', 'High potential incidents', 'safety', 'count', 'lower_better', 'monthly'],
  ['ENV-WTR', 'Water recycled', 'environment', '%', 'higher_better', 'monthly'],
  ['ENV-BRC', 'Environmental limit breaches', 'environment', 'count', 'lower_better', 'monthly'],
  ['ENV-CO2', 'Greenhouse gas emissions', 'environment', 'tCO2e', 'lower_better', 'monthly'],
  ['ENV-REH', 'Rehabilitation completed', 'environment', 'ha', 'higher_better', 'quarterly'],
  ['MNT-AVL', 'Fleet physical availability', 'maintenance', '%', 'higher_better', 'monthly'],
  ['MNT-UTL', 'Fleet utilisation', 'maintenance', '%', 'higher_better', 'monthly'],
  ['MNT-MTBF', 'Mean time between failures', 'maintenance', 'hours', 'higher_better', 'monthly'],
  ['MNT-PMC', 'PM compliance', 'maintenance', '%', 'higher_better', 'monthly'],
  ['WRK-ABS', 'Absenteeism rate', 'workforce', '%', 'lower_better', 'monthly'],
  ['WRK-TRN', 'Training hours per employee', 'workforce', 'hours', 'higher_better', 'monthly'],
  ['WRK-COMP', 'Competency compliance', 'workforce', '%', 'higher_better', 'monthly'],
  ['WRK-TURN', 'Employee turnover', 'workforce', '%', 'lower_better', 'quarterly'],
  ['SUP-STK', 'Stockout incidents', 'supply', 'count', 'lower_better', 'monthly'],
  ['SUP-OTD', 'Supplier on time delivery', 'supply', '%', 'higher_better', 'monthly'],
  ['FIN-CPT', 'Operating cost per tonne', 'finance', 'USD/t', 'lower_better', 'monthly'],
  ['FIN-AISC', 'All in sustaining cost', 'finance', 'USD/oz', 'lower_better', 'monthly'],
  ['FIN-BUD', 'Budget variance', 'finance', '%', 'target_band', 'monthly'],
  ['COM-SLS', 'Tonnes despatched', 'commercial', 't', 'higher_better', 'monthly'],
  ['COM-QLT', 'Product within specification', 'commercial', '%', 'higher_better', 'monthly'],
  ['GEO-REC', 'Grade reconciliation variance', 'geology', '%', 'target_band', 'monthly'],
]

export async function seedCommercial(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx

  await insertMany(
    db,
    'customers',
    ['org_id', 'code', 'name', 'customer_type', 'country', 'contact_name', 'email', 'phone', 'credit_limit', 'payment_terms', 'currency', 'status'],
    CUSTOMER_NAMES.map(([name, type, country], i) => [
      orgId, `CUS-${pad(i + 1, 4)}`, name, type, country,
      `${rng.pick(['R.', 'H.', 'T.', 'Y.'])} ${rng.pick(['Tanaka', 'Muller', 'Silva', 'Kaur', 'Lindqvist'])}`,
      `trading@${name.split(' ')[0].toLowerCase()}.com`,
      `+${rng.int(1, 91)} ${rng.int(20, 99)} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)}`,
      rng.num(2_000_000, 90_000_000, 0), rng.pick(['30 days', '45 days', 'Letter of credit', 'Cash against documents']),
      'USD', rng.weighted([['active', 9], ['prospect', 1]]),
    ]),
  )
  ctx.customerIds = CUSTOMER_NAMES.map((_, i) => i + 1)

  // A refinery does not buy thermal coal and a power utility does not buy
  // concentrate, so contracts are matched to the customer's actual trade.
  const BUYERS: Record<string, readonly string[]> = {
    coal: ['utility', 'trader', 'domestic', 'export', 'spot'],
    copper: ['smelter', 'trader'],
    iron_ore: ['steel_mill', 'trader'],
  }
  const customerTypeById = new Map(CUSTOMER_NAMES.map(([, type], i) => [i + 1, type]))

  const contractRows: unknown[][] = []
  const contracts: { id: number; customerId: number; commodity: string; price: number }[] = []
  let contractId = 0
  for (let i = 0; i < 24; i++) {
    contractId += 1
    // Bulk commodities only: gold leaves site as bullion, not tonnage, and is
    // sold through the refinery settlement in bullion_shipments instead.
    const commodity = rng.weighted([['coal', 10], ['copper', 5], ['iron_ore', 5]])
    const eligible = ctx.customerIds.filter((id) =>
      BUYERS[commodity].includes(customerTypeById.get(id) ?? ''),
    )
    const customerId = eligible.length > 0 ? rng.pick(eligible) : rng.pick(ctx.customerIds)
    const price =
      commodity === 'copper'
        ? rng.num(1800, 2600, 2) // concentrate, not contained metal
        : commodity === 'iron_ore'
          ? rng.num(88, 138, 2)
          : rng.num(74, 148, 2)
    const start = addDays(today, -rng.int(60, 900))
    const contracted = rng.num(60000, 3_600_000, 0)
    contractRows.push([
      orgId, customerId, rng.pick(ctx.productSpecIds), `CON-${pad(contractId, 4)}`,
      `${commodity.replace('_', ' ')} supply agreement`, commodity,
      rng.weighted([['offtake', 5], ['term', 3], ['spot', 2]]),
      isoDate(start), isoDate(addDays(start, rng.int(365, 1460))),
      contracted, Math.round(contracted * rng.num(0.1, 0.85, 3)),
      rng.weighted([['index_linked', 4], ['fixed', 3], ['formula', 2], ['spot', 1]]),
      price, rng.pick(['API4', 'GCNewc', 'LME Cu', 'Platts IODEX', 'LBMA PM']), 'USD',
      rng.pick(['FOB', 'CIF', 'CFR', 'DAP', 'EXW']),
      rng.pick(['Richards Bay', 'Port Hedland', 'Matarani', 'Beira', 'Mine gate']),
      'CV and ash penalties per contract schedule 3.',
      rng.weighted([['active', 8], ['completed', 1], ['suspended', 1]]),
    ])
    contracts.push({ id: contractId, customerId, commodity, price })
  }
  await insertMany(
    db,
    'sales_contracts',
    ['org_id', 'customer_id', 'product_spec_id', 'contract_no', 'title', 'commodity', 'contract_type', 'start_date', 'end_date', 'contracted_tonnes', 'delivered_tonnes', 'price_basis', 'base_price', 'price_index', 'currency', 'incoterms', 'delivery_point', 'quality_penalties', 'status'],
    contractRows,
  )

  const orderRows: unknown[][] = []
  const orders: { id: number; contract: (typeof contracts)[number]; tonnes: number; date: Date }[] = []
  let orderId = 0
  for (let i = 0; i < 200; i++) {
    orderId += 1
    const contract = rng.pick(contracts)
    const date = addDays(today, -rng.int(0, 300))
    const tonnes = rng.num(2000, 78000, 1)
    const status = date < addDays(today, -40)
      ? rng.weighted([['closed', 5], ['invoiced', 3], ['delivered', 2]])
      : rng.weighted([['confirmed', 3], ['allocated', 3], ['in_transit', 2], ['delivered', 2]])
    orderRows.push([
      orgId, contract.customerId, contract.id, `SO-${pad(orderId, 5)}`, isoDate(date),
      isoDate(addDays(date, rng.int(7, 60))), contract.commodity, tonnes, contract.price, 'USD',
      Math.round(tonnes * contract.price * 100) / 100,
      rng.pick(['Richards Bay Coal Terminal', 'Port Hedland', 'Matarani Port', 'Domestic power station', 'Refinery vault']),
      rng.weighted([['rail', 4], ['road', 3], ['ship', 2], ['conveyor', 1]]),
      status,
    ])
    orders.push({ id: orderId, contract, tonnes, date })
  }
  await insertMany(
    db,
    'sales_orders',
    ['org_id', 'customer_id', 'contract_id', 'order_no', 'order_date', 'requested_delivery', 'commodity', 'quantity_tonnes', 'unit_price', 'currency', 'order_value', 'destination', 'transport_mode', 'status'],
    orderRows,
  )

  // ---- Shipments ------------------------------------------------------------
  const shipRows: unknown[][] = []
  const shipments: { id: number; order: (typeof orders)[number]; tonnes: number; date: Date; value: number }[] = []
  let shipId = 0
  for (const order of orders) {
    const parts = rng.int(1, 3)
    for (let p = 0; p < parts; p++) {
      shipId += 1
      const dispatched = addDays(order.date, rng.int(2, 40))
      const gross = Math.round((order.tonnes / parts) * rng.num(0.9, 1.05, 3) * 100) / 100
      const moisture = rng.num(3, 12, 2)
      const dry = Math.round(gross * (1 - moisture / 100) * 100) / 100
      const value = Math.round(dry * order.contract.price * 100) / 100
      shipRows.push([
        orgId, rng.pick(ctx.sites).id, order.contract.customerId, order.contract.id, order.id,
        `SHP-${pad(shipId, 5)}`, isoDate(dispatched),
        dispatched < today ? isoDate(addDays(dispatched, rng.int(1, 24))) : null,
        rng.weighted([['rail', 4], ['ship', 3], ['road', 2], ['conveyor', 1]]),
        rng.pick(['Transnet Freight Rail', 'Aurizon', 'Local Haulage Co', 'Ocean Bulk Lines']),
        rng.bool(0.4) ? rng.pick(['MV Iron Voyager', 'MV Coal Trader', 'MV Andes Star']) : null,
        rng.bool(0.5) ? rng.int(30, 104) : null, rng.bool(0.5) ? rng.int(20, 180) : null,
        rng.pick(['Mine load out', 'Rail siding', 'ROM pad']),
        rng.pick(['Richards Bay', 'Port Hedland', 'Matarani', 'Domestic plant']),
        gross, moisture, dry,
        order.contract.commodity === 'gold' ? rng.num(0.6, 0.95, 4) : rng.num(0.4, 62, 3),
        order.contract.commodity === 'coal' ? rng.num(9, 24, 2) : null,
        order.contract.commodity === 'coal' ? rng.num(5100, 6400, 0) : null,
        rng.num(0.3, 1.4, 3), `COA-${rng.int(10000, 99999)}`,
        Math.round(dry * rng.num(6, 28, 2) * 100) / 100,
        Math.round(value * rng.num(0.02, 0.06, 4) * 100) / 100,
        value, 'USD',
        dispatched < addDays(today, -20) ? rng.weighted([['settled', 5], ['invoiced', 3], ['claimed', 1]]) : dispatched < today ? rng.weighted([['delivered', 4], ['in_transit', 3], ['weighed', 2]]) : 'planned',
      ])
      shipments.push({ id: shipId, order, tonnes: dry, date: dispatched, value })
    }
  }
  await insertMany(
    db,
    'shipments',
    ['org_id', 'site_id', 'customer_id', 'contract_id', 'sales_order_id', 'shipment_no', 'dispatched_on', 'arrived_on', 'transport_mode', 'carrier', 'vessel_name', 'wagon_count', 'truck_count', 'origin', 'destination', 'gross_tonnes', 'moisture_pct', 'dry_tonnes', 'grade', 'ash_pct', 'cv_kcal_kg', 'sulphur_pct', 'quality_certificate', 'freight_cost', 'royalty_amount', 'invoice_value', 'currency', 'status'],
    shipRows,
  )

  // ---- Weighbridge ------------------------------------------------------------
  const wbRows: unknown[][] = []
  for (let i = 0; i < 3000; i++) {
    const site = rng.pick(ctx.sites)
    const direction = rng.weighted([['outbound', 5], ['inbound', 3], ['internal', 2]])
    const tare = rng.num(14000, 26000, 0)
    const net = direction === 'inbound' ? rng.num(2000, 34000, 0) : rng.num(24000, 68000, 0)
    const moisture = rng.num(2, 12, 2)
    wbRows.push([
      orgId, site.id, `WB-${pad(i + 1, 6)}`, addHours(today, -rng.num(1, 24 * 120, 1)).toISOString(),
      direction, `${rng.pick(['BX', 'CA', 'DM', 'JH'])} ${rng.int(10, 99)} ${rng.pick(['ABC', 'XYZ', 'MNP'])} GP`,
      rng.pick(['Local Haulage Co', 'Transnet', 'Own fleet', 'Contractor fleet']),
      `${rng.pick(['J.', 'S.', 'M.'])} ${rng.pick(['Dlamini', 'Reyes', 'Banda', 'Khan'])}`,
      `DL${rng.int(1000000, 9999999)}`,
      rng.bool(0.4) ? rng.pick(ctx.assets).id : null,
      rng.weighted([['coal_product', 4], ['ore', 3], ['waste', 2], ['concentrate', 1]]),
      rng.pick(ctx.productSpecIds),
      tare + net, tare, net, moisture, Math.round(net * (1 - moisture / 100)),
      ctx.stockpileIds.length ? rng.pick(ctx.stockpileIds) : null,
      rng.bool(0.5) && orders.length ? rng.pick(orders).id : null,
      rng.bool(0.4) && shipments.length ? rng.pick(shipments).id : null,
      `SEAL${rng.int(10000, 99999)}`, rng.pick(['Weighbridge Operator', 'Automated']),
      rng.weighted([['complete', 19], ['disputed', 1]]),
    ])
  }
  await insertMany(
    db,
    'weighbridge_tickets',
    ['org_id', 'site_id', 'ticket_no', 'weighed_at', 'direction', 'vehicle_rego', 'carrier', 'driver_name', 'driver_licence', 'asset_id', 'material', 'product_spec_id', 'gross_kg', 'tare_kg', 'net_kg', 'moisture_pct', 'dry_net_kg', 'stockpile_id', 'sales_order_id', 'shipment_id', 'seal_no', 'operator', 'status'],
    wbRows,
  )

  const custInvRows: unknown[][] = []
  let custInvId = 0
  for (const shipment of shipments) {
    if (shipment.date > addDays(today, -5)) continue
    custInvId += 1
    const invoiceDate = addDays(shipment.date, rng.int(1, 14))
    const due = addDays(invoiceDate, 30)
    const status = due < today
      ? rng.weighted([['paid', 7], ['partially_paid', 1], ['overdue', 1], ['disputed', 1]])
      : rng.weighted([['issued', 5], ['provisional', 3], ['final', 2]])
    const royalty = Math.round(shipment.value * 0.03 * 100) / 100
    const adj = Math.round(shipment.value * rng.num(-0.04, 0.02, 4) * 100) / 100
    const total = Math.round((shipment.value + adj + royalty) * 1.0 * 100) / 100
    custInvRows.push([
      orgId, shipment.order.contract.customerId, shipment.id, shipment.order.id,
      `CI-${pad(custInvId, 5)}`, isoDate(invoiceDate), isoDate(due),
      shipment.tonnes, shipment.order.contract.price, shipment.value, adj, royalty, 0, total,
      status === 'paid' ? total : status === 'partially_paid' ? Math.round(total * 0.6 * 100) / 100 : 0,
      'USD', status, status === 'paid' ? isoDate(addDays(due, -rng.int(0, 14))) : null,
    ])
  }
  await insertMany(
    db,
    'customer_invoices',
    ['org_id', 'customer_id', 'shipment_id', 'sales_order_id', 'invoice_no', 'invoice_date', 'due_date', 'quantity_tonnes', 'unit_price', 'subtotal', 'quality_adjustment', 'royalty', 'tax_amount', 'total_amount', 'received_amount', 'currency', 'status', 'paid_on'],
    custInvRows,
  )

  const royaltyRows: unknown[][] = []
  for (const site of ctx.sites) {
    for (let m = 11; m >= 0; m--) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1))
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m + 1, 0))
      for (const type of ['government', 'landowner', 'community'] as const) {
        const revenue = rng.num(2_000_000, 42_000_000, 2)
        const rate = type === 'government' ? rng.num(2.5, 5, 3) : type === 'landowner' ? rng.num(0.5, 1.5, 3) : rng.num(0.2, 0.8, 3)
        royaltyRows.push([
          orgId, site.id, isoDate(start), isoDate(end), type,
          type === 'government' ? 'Department of Mineral Resources' : type === 'landowner' ? 'Registered surface owner' : 'Community Trust',
          rng.num(40000, 900000, 1), revenue, rate, Math.round(revenue * rate / 100 * 100) / 100, 'USD',
          m > 1 ? 'paid' : rng.weighted([['accrued', 3], ['declared', 2]]),
          m > 1 ? isoDate(addDays(end, 25)) : null, `ROY-${site.code}-${isoDate(start).slice(0, 7)}-${type.slice(0, 3)}`,
        ])
      }
    }
  }
  await insertMany(
    db,
    'royalties',
    ['org_id', 'site_id', 'period_start', 'period_end', 'royalty_type', 'payee', 'basis_tonnes', 'basis_revenue', 'rate_pct', 'amount', 'currency', 'status', 'paid_on', 'reference'],
    royaltyRows,
  )

  // ---- Budgets, costs, KPIs ---------------------------------------------------
  const fiscalYear = today.getUTCFullYear()
  const budgetRows: unknown[][] = []
  const budgetLineRows: unknown[][] = []
  let budgetId = 0
  for (const site of ctx.sites) {
    for (const type of ['operating', 'capital'] as const) {
      budgetId += 1
      budgetRows.push([
        orgId, site.id, `BUD-${site.code}-${fiscalYear}-${type.slice(0, 3).toUpperCase()}`,
        `${site.name} ${fiscalYear} ${type} budget`, fiscalYear, 'v2', type, null, 'USD',
        'approved', 'S. Hughes', addDays(today, -rng.int(60, 200)).toISOString(),
      ])
      const siteCostCentres = ctx.costCenterIds.filter((_, idx) => Math.floor(idx / 21) === site.id - 1)
      for (const ccId of siteCostCentres) {
        for (let month = 1; month <= 12; month++) {
          budgetLineRows.push([
            orgId, budgetId, ccId, `${4000 + rng.int(0, 900)}`,
            `${type === 'capital' ? 'Capital' : 'Operating'} allocation month ${month}`,
            month, rng.num(40000, 1_800_000, 2), rng.num(1000, 90000, 1),
            rng.pick(['t', 'hours', 'each', 'm']),
          ])
        }
      }
    }
  }
  await insertMany(
    db,
    'budgets',
    ['org_id', 'site_id', 'code', 'name', 'fiscal_year', 'version', 'budget_type', 'total_amount', 'currency', 'status', 'approved_by', 'approved_at'],
    budgetRows,
  )
  await insertMany(
    db,
    'budget_lines',
    ['org_id', 'budget_id', 'cost_center_id', 'account_code', 'description', 'period_month', 'amount', 'quantity', 'unit'],
    budgetLineRows,
  )
  await db.query('update budgets b set total_amount = t.total from (select budget_id, sum(amount) total from budget_lines group by budget_id) t where t.budget_id = b.id')

  const CATEGORY_WEIGHTS: readonly (readonly [string, number])[] = [
    ['labour', 22], ['contractor', 16], ['fuel', 14], ['maintenance', 12], ['power', 8],
    ['explosives', 6], ['consumables', 6], ['spares', 5], ['reagents', 4], ['haulage', 3],
    ['drilling', 2], ['admin', 1], ['royalty', 1],
  ]
  const costRows: unknown[][] = []
  for (let d = ctx.historyDays; d >= 0; d--) {
    const date = addDays(today, -d)
    if (d % 2 !== 0) continue
    for (const mine of ctx.mines) {
      for (let k = 0; k < 4; k++) {
        const category = rng.weighted(CATEGORY_WEIGHTS)
        const amount = rng.num(4000, 460000, 2)
        costRows.push([
          orgId, mine.siteId, mine.id,
          ctx.costCenterIds.filter((_, idx) => Math.floor(idx / 21) === mine.siteId - 1)[rng.int(0, 20)],
          null, isoDate(date), `${4000 + rng.int(0, 900)}`, category,
          rng.weighted([['operating', 8], ['capital', 1], ['overhead', 1]]),
          `${category} cost posting for ${mine.code}`,
          amount, 'USD', rng.num(1000, 90000, 1),
          rng.pick(['tonne_ore', 'tonne_waste', 'bcm', 'hour', 'litre']),
          rng.pick(['work_orders', 'stock_movements', 'payroll_lines', 'supplier_invoices']),
          rng.int(1, 200), true,
        ])
      }
    }
  }
  await insertMany(
    db,
    'cost_entries',
    ['org_id', 'site_id', 'mine_id', 'cost_center_id', 'budget_id', 'entry_date', 'account_code', 'category', 'cost_type', 'description', 'amount', 'currency', 'driver_quantity', 'driver_unit', 'source_entity', 'source_id', 'posted'],
    costRows,
  )

  await insertMany(
    db,
    'kpi_definitions',
    ['org_id', 'code', 'name', 'module', 'unit', 'direction', 'formula', 'frequency', 'active'],
    KPIS.map(([code, name, module, unit, direction, frequency]) => [
      orgId, code, name, module, unit, direction,
      `Computed from the ${module} reporting views.`, frequency, true,
    ]),
  )

  const kpiValueRows: unknown[][] = []
  KPIS.forEach(([, , , , direction], i) => {
    for (const site of ctx.sites) {
      for (let m = 11; m >= 0; m--) {
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1))
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m + 1, 0))
        const target = rng.num(1, 1000, 2)
        const actual = rng.around(target, 0.22, 2)
        const variance = Math.round(((actual - target) / target) * 10000) / 100
        const good = direction === 'higher_better' ? variance >= -2 : direction === 'lower_better' ? variance <= 2 : Math.abs(variance) <= 5
        kpiValueRows.push([
          orgId, i + 1, site.id, null, isoDate(start), isoDate(end), target, actual, variance,
          good ? 'on_target' : Math.abs(variance) < 12 ? 'watch' : 'off_target',
          rng.bool(0.2) ? rng.pick(['Impacted by unplanned plant downtime', 'Improved after crew restructure', 'Weather related shortfall', 'Ahead of plan on higher grade feed']) : null,
        ])
      }
    }
  })
  await insertMany(
    db,
    'kpi_values',
    ['org_id', 'kpi_id', 'site_id', 'mine_id', 'period_start', 'period_end', 'target_value', 'actual_value', 'variance_pct', 'status', 'commentary'],
    kpiValueRows,
  )

  // ---- Compliance --------------------------------------------------------------
  const tenementRows: unknown[][] = []
  let tenementId = 0
  for (const site of ctx.sites) {
    for (const [type, count] of [['mining_lease', 2], ['exploration_licence', 3], ['water_right', 1]] as const) {
      for (let i = 0; i < count; i++) {
        tenementId += 1
        const granted = addDays(today, -rng.int(400, 3600))
        tenementRows.push([
          orgId, site.id, `${site.code}-${type.slice(0, 2).toUpperCase()}-${pad(tenementId, 3)}`,
          `${site.name} ${type.replace(/_/g, ' ')} ${i + 1}`, type,
          'Aurelia Resources Group', isoDate(granted),
          isoDate(addDays(granted, rng.int(1400, 7300))),
          rng.num(4, 620, 3), rng.num(12000, 480000, 2), rng.num(200000, 4_000_000, 2),
          rng.num(50000, 3_600_000, 2),
          rng.pick(['Western Australia', 'Mpumalanga', 'Arequipa', 'Copperbelt']),
          rng.weighted([['granted', 8], ['renewal_pending', 2]]),
          null,
        ])
      }
    }
  }
  await insertMany(
    db,
    'tenements',
    ['org_id', 'site_id', 'tenement_no', 'name', 'tenement_type', 'holder', 'granted_on', 'expires_on', 'area_km2', 'annual_rent', 'expenditure_commitment', 'expenditure_to_date', 'jurisdiction', 'status', 'notes'],
    tenementRows,
  )

  const obligationRows: unknown[][] = []
  const OBLIGATIONS: readonly (readonly [string, string, string])[] = [
    ['Monthly production return to regulator', 'report', 'monthly'],
    ['Quarterly environmental compliance report', 'report', 'quarterly'],
    ['Annual mine closure plan update', 'rehabilitation', 'annual'],
    ['Annual tenement rent payment', 'payment', 'annual'],
    ['Statutory ventilation survey', 'monitoring', 'quarterly'],
    ['Water use licence return', 'report', 'annual'],
    ['Explosives licence renewal', 'permit_renewal', 'annual'],
    ['Statutory lifting gear inspection', 'inspection', 'biannual'],
    ['Occupational hygiene survey', 'monitoring', 'annual'],
    ['Social and labour plan reporting', 'community', 'annual'],
    ['Tailings facility annual review', 'inspection', 'annual'],
    ['Greenhouse gas emissions disclosure', 'disclosure', 'annual'],
  ]
  let oblId = 0
  for (const site of ctx.sites) {
    for (const [title, type, frequency] of OBLIGATIONS) {
      oblId += 1
      const next = addDays(today, rng.int(-25, 200))
      obligationRows.push([
        orgId, site.id, rng.bool(0.5) ? rng.int(1, tenementId) : null,
        `OBL-${pad(oblId, 4)}`, title, type,
        rng.pick(['Department of Mineral Resources', 'Environmental Protection Authority', 'Water Authority', 'Mine Safety Inspectorate']),
        rng.pick(['Mine Health and Safety Act', 'Environmental Management Act', 'National Water Act', 'Mineral Resources Act']),
        frequency, isoDate(next), isoDate(addDays(next, -rng.int(30, 360))), isoDate(next),
        rng.pick(['HSE Manager', 'Environmental Officer', 'Finance Manager', 'Mine Manager']),
        rng.weighted([['medium', 4], ['high', 3], ['critical', 2], ['low', 1]]),
        next < today ? rng.weighted([['overdue', 3], ['in_progress', 4], ['submitted', 3]]) : rng.weighted([['open', 6], ['in_progress', 4]]),
      ])
    }
  }
  await insertMany(
    db,
    'regulatory_obligations',
    ['org_id', 'site_id', 'tenement_id', 'reference', 'title', 'obligation_type', 'regulator', 'legislation', 'frequency', 'due_on', 'last_completed_on', 'next_due_on', 'responsible', 'penalty_risk', 'status'],
    obligationRows,
  )

  const auditRows: unknown[][] = []
  const findingRows: unknown[][] = []
  let auditId = 0
  for (let i = 0; i < 36; i++) {
    auditId += 1
    const planned = addDays(today, -rng.int(-60, 420))
    const performed = planned < today && rng.bool(0.85)
    const major = rng.weighted([[0, 6], [1, 3], [2, 1]])
    const minor = rng.int(0, 12)
    auditRows.push([
      orgId, rng.pick(ctx.sites).id, `AUD-${pad(auditId, 4)}`,
      rng.pick(['ISO 45001 surveillance audit', 'Tailings governance review', 'Contractor safety audit', 'Environmental legal compliance audit', 'Internal financial controls audit', 'Explosives management audit', 'ICMM performance expectations review']),
      rng.weighted([['internal', 8], ['external', 5], ['regulatory', 3], ['certification', 3], ['contractor', 3], ['tsf', 2], ['iso45001', 2], ['iso14001', 1]]),
      rng.pick(['ISO 45001:2018', 'ISO 14001:2015', 'GISTM', 'ICMM', 'Internal standard']),
      rng.pick(['Bureau Veritas', 'SGS', 'Internal Audit', 'DNV', 'Regulator']),
      isoDate(planned), performed ? isoDate(planned) : null,
      'Systems, records and field verification across the nominated scope.',
      major + minor, major, minor,
      performed ? rng.num(62, 98, 1) : null,
      performed ? (major > 0 ? 'major_non_conformance' : minor > 0 ? 'minor_non_conformance' : 'conformant') : 'pending',
      performed ? `RPT-${rng.int(1000, 9999)}` : null,
      performed ? rng.weighted([['closed', 6], ['reporting', 3]]) : planned < today ? 'in_progress' : 'planned',
    ])
    for (let f = 0; f < major + minor; f++) {
      const due = addDays(planned, rng.int(14, 120))
      const closed = due < today && rng.bool(0.7)
      findingRows.push([
        orgId, auditId, `${pad(auditId, 4)}-F${f + 1}`,
        `Clause ${rng.int(4, 10)}.${rng.int(1, 6)}`,
        f < major ? 'major' : rng.weighted([['minor', 6], ['observation', 3], ['opportunity', 1]]),
        rng.pick(['Records of training were incomplete for the sampled personnel', 'Risk assessment not reviewed within the required period', 'Emergency equipment inspection tags missing', 'Contractor induction records not retained', 'Monitoring results not reported within statutory timeframe', 'Change management process not applied to plant modification']),
        'Sampled records and field observation.',
        rng.pick(['HSE Manager', 'Training Manager', 'Engineering Manager', 'Environmental Officer']),
        isoDate(due), closed ? isoDate(addDays(due, -rng.int(0, 20))) : null,
        closed ? 'closed' : due < today ? 'in_progress' : 'open',
      ])
    }
  }
  await insertMany(
    db,
    'audits',
    ['org_id', 'site_id', 'audit_no', 'title', 'audit_type', 'standard', 'auditor', 'planned_on', 'performed_on', 'scope', 'findings_count', 'major_findings', 'minor_findings', 'score_pct', 'result', 'report_ref', 'status'],
    auditRows,
  )
  await insertMany(
    db,
    'audit_findings',
    ['org_id', 'audit_id', 'finding_no', 'clause', 'severity', 'description', 'evidence', 'responsible', 'due_on', 'closed_on', 'status'],
    findingRows,
  )

  const logRows: unknown[][] = []
  for (let i = 0; i < 900; i++) {
    const mine = rng.pick(ctx.mines)
    logRows.push([
      orgId, mine.siteId, mine.id, rng.pick(ctx.shiftIds),
      addHours(today, -rng.num(1, 24 * 90, 1)).toISOString(),
      rng.weighted([['handover', 40], ['statutory', 20], ['delay', 16], ['deviation', 10], ['instruction', 8], ['visitor', 4], ['general', 2]]),
      rng.pick(['Shift Supervisor', 'Mine Overseer', 'Control Room', 'Ventilation Officer']),
      rng.pick([
        'All headings inspected and found in a safe condition. Gas readings within limits.',
        'Crusher unavailable for two hours, ore diverted to ROM stockpile.',
        'Blast fired at 13:20, re-entry cleared at 14:05 after gas clearance.',
        'Two personnel sent to surface for medical assessment after minor incident.',
        'Ventilation door on level 670 damaged by LHD, temporary repair completed.',
        'Water make increased in the eastern sump, additional pump commissioned.',
        'Contractor crew inducted and escorted to the work area.',
        'Grade control results received, ore boundary adjusted on bench 405.',
      ]),
      rng.bool(0.3), rng.bool(0.5) ? rng.pick(['Oncoming Supervisor', 'Mine Manager']) : null,
      rng.bool(0.5) ? addHours(today, -rng.num(1, 24 * 80, 1)).toISOString() : null,
    ])
  }
  await insertMany(
    db,
    'shift_logs',
    ['org_id', 'site_id', 'mine_id', 'shift_id', 'logged_at', 'log_type', 'author', 'entry', 'requires_action', 'acknowledged_by', 'acknowledged_at'],
    logRows,
  )

  // ---- Documents, prices, settings, notifications --------------------------------
  const docRows: unknown[][] = []
  const DOC_TITLES: readonly (readonly [string, string])[] = [
    ['Ground Control Management Plan', 'plan'],
    ['Ventilation Management Plan', 'plan'],
    ['Emergency Response Plan', 'plan'],
    ['Explosives Management Procedure', 'procedure'],
    ['Isolation and Lockout Procedure', 'procedure'],
    ['Working at Heights Procedure', 'procedure'],
    ['Confined Space Entry Procedure', 'procedure'],
    ['Fatigue Management Policy', 'policy'],
    ['Contractor Management Standard', 'policy'],
    ['Tailings Operation Maintenance and Surveillance Manual', 'manual'],
    ['Water Use Licence', 'licence'],
    ['Environmental Authorisation', 'permit'],
    ['Mine Closure Plan', 'plan'],
    ['Haul Road Design Standard', 'drawing'],
    ['Blast Design Standard', 'procedure'],
    ['Gold Room Security Procedure', 'procedure'],
    ['Plant Startup and Shutdown Procedure', 'sop'],
    ['Weighbridge Operating Procedure', 'sop'],
    ['Incident Investigation Standard', 'procedure'],
    ['Occupational Health Surveillance Programme', 'procedure'],
  ]
  let docId = 0
  for (const site of ctx.sites) {
    for (const [title, type] of DOC_TITLES) {
      docId += 1
      const effective = addDays(today, -rng.int(30, 900))
      docRows.push([
        orgId, site.id, `DOC-${site.code}-${pad(docId, 4)}`, `${title} - ${site.code}`, type,
        rng.pick(['Mining', 'Processing', 'HSE', 'Engineering', 'Environment']),
        `${rng.int(1, 5)}.${rng.int(0, 9)}`,
        rng.weighted([['approved', 8], ['review', 1], ['draft', 1]]),
        rng.pick(['Mine Manager', 'HSE Manager', 'Engineering Manager', 'Environmental Manager']),
        isoDate(effective), isoDate(addDays(effective, 730)),
        `documents/${site.code.toLowerCase()}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
        null, null,
      ])
    }
  }
  await insertMany(
    db,
    'documents',
    ['org_id', 'site_id', 'doc_number', 'title', 'doc_type', 'discipline', 'version', 'status', 'owner', 'effective_on', 'review_due_on', 'storage_path', 'entity', 'entity_id'],
    docRows,
  )

  const priceRows: unknown[][] = []
  const PRICE_BASE: readonly (readonly [string, number, string])[] = [
    ['gold', 2380, 'oz'], ['silver', 29.4, 'oz'], ['copper', 9200, 't'],
    ['coal', 112, 't'], ['iron_ore', 108, 't'],
  ]
  for (const [commodity, base, unit] of PRICE_BASE) {
    let price = base
    for (let d = 400; d >= 0; d--) {
      price = Math.max(base * 0.7, Math.min(base * 1.3, price * rng.num(0.992, 1.008, 5)))
      priceRows.push([
        orgId, commodity, isoDate(addDays(today, -d)), Math.round(price * 10000) / 10000, 'USD', unit,
        rng.pick(['LBMA', 'LME', 'API4', 'Platts']),
      ])
    }
  }
  await insertMany(
    db,
    'commodity_prices',
    ['org_id', 'commodity', 'price_date', 'price', 'currency', 'unit', 'source'],
    priceRows,
  )

  await insertMany(
    db,
    'settings',
    ['org_id', 'scope', 'key', 'value'],
    [
      [orgId, 'org', 'units', JSON.stringify({ mass: 't', grade: 'g/t', distance: 'm', volume: 'bcm' })],
      [orgId, 'org', 'safety_targets', JSON.stringify({ trifr: 3.5, ltifr: 0.8, fatalities: 0 })],
      [orgId, 'org', 'shift_config', JSON.stringify({ shifts_per_day: 2, hours: 12, start_hour: 6 })],
      [orgId, 'org', 'fiscal', JSON.stringify({ year_start_month: 7, currency: 'USD' })],
      [orgId, 'org', 'alerts', JSON.stringify({ gas_ch4_alarm: 1.25, tsf_freeboard_min_m: 1.5, stock_reorder: true })],
    ],
  )

  const notifRows: unknown[][] = []
  const NOTIFS: readonly (readonly [string, string, string, string])[] = [
    ['critical', 'Methane alarm at Blackridge No.3', 'CH4 reading of 1.9% recorded in section 4 return airway. Section de-energised.', '/operations/gas'],
    ['warning', 'TSF freeboard below trigger', 'Sundowner TSF-1 freeboard measured at 0.9 m against a 1.5 m minimum.', '/environment/tailings'],
    ['warning', '14 corrective actions overdue', 'Overdue actions across three sites require supervisor attention.', '/safety/actions'],
    ['info', 'Monthly production return due', 'Regulatory production return for the month closes in 5 days.', '/compliance/obligations'],
    ['warning', 'Critical spares below reorder point', '23 critical stock lines are at or below their reorder point.', '/supply/stock'],
    ['success', 'Gold pour completed', 'POUR-0042 completed and secured in the vault pending shipment.', '/processing/gold-room'],
    ['warning', 'Competency expiries in 30 days', '38 statutory competencies expire within the next 30 days.', '/workforce/competencies'],
    ['critical', 'Slope radar alarm at Cerro Verde', 'Velocity of 18 mm/day recorded on the north wall. Area evacuated.', '/geology/geotechnical'],
    ['info', 'Plan attainment at 96%', 'Group month to date ore attainment is tracking slightly below plan.', '/operations/production'],
    ['warning', 'Maintenance overdue on 9 assets', 'Preventive services overdue on critical fleet units.', '/maintenance/schedule'],
  ]
  NOTIFS.forEach(([severity, title, body, link], i) => {
    notifRows.push([
      orgId, rng.int(1, 13), severity, title, body, link, null, null,
      i > 5 ? addHours(today, -rng.num(1, 40, 1)).toISOString() : null,
      addHours(today, -rng.num(0.5, 72, 2)).toISOString(),
    ])
  })
  await insertMany(
    db,
    'notifications',
    ['org_id', 'user_id', 'severity', 'title', 'body', 'link', 'entity', 'entity_id', 'read_at', 'created_at'],
    notifRows,
  )

  const auditLogRows: unknown[][] = []
  for (let i = 0; i < 600; i++) {
    auditLogRows.push([
      orgId,
      rng.pick(['production_records', 'work_orders', 'incidents', 'employees', 'purchase_orders', 'shipments', 'assets', 'mine_plans']),
      rng.int(1, 500),
      rng.weighted([['insert', 40], ['update', 34], ['approve', 12], ['delete', 6], ['export', 5], ['login', 3]]),
      rng.pick(['sarah.hughes@aurelia.com', 'thabo.mokoena@aurelia.com', 'ivan.petrov@aurelia.com', 'amara.okafor@aurelia.com', 'admin@aurelia.com']),
      rng.pick(['Record created from shift capture screen', 'Status changed to approved', 'Quantity corrected after survey reconciliation', 'Bulk export to CSV', 'Assignee updated']),
      null,
      addHours(today, -rng.num(0.5, 24 * 60, 2)).toISOString(),
    ])
  }
  await insertMany(
    db,
    'audit_log',
    ['org_id', 'entity', 'entity_id', 'action', 'actor', 'summary', 'diff', 'at'],
    auditLogRows,
  )
}

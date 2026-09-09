import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { AssetSeed, SeedContext } from './context'

const CATEGORIES: readonly (readonly [string, string, string, string])[] = [
  ['LOAD', 'Loading Equipment', 'mobile', 'hours'],
  ['HAUL', 'Haulage Fleet', 'mobile', 'kilometres'],
  ['SUPP', 'Support Equipment', 'mobile', 'hours'],
  ['DRILL', 'Drilling Equipment', 'mobile', 'hours'],
  ['UGMOB', 'Underground Mobile', 'mobile', 'hours'],
  ['CRUSH', 'Crushing and Screening', 'fixed', 'hours'],
  ['MILL', 'Milling and Classification', 'fixed', 'hours'],
  ['PUMP', 'Pumps and Slurry', 'fixed', 'hours'],
  ['CONV', 'Conveying', 'fixed', 'hours'],
  ['POWER', 'Power and Compressed Air', 'fixed', 'hours'],
  ['VENT', 'Ventilation and Hoisting', 'fixed', 'hours'],
  ['LV', 'Light Vehicles', 'light_vehicle', 'kilometres'],
]

interface Spec {
  type: string
  cat: number
  make: string
  model: string
  count: number
  cost: number
  meterMax: number
  fuel: string
  capacity?: [number, string]
  underground?: boolean
  fixed?: boolean
  critical?: string
}

const FLEET: Spec[] = [
  { type: 'excavator', cat: 1, make: 'Komatsu', model: 'PC3000-6', count: 6, cost: 6200000, meterMax: 32000, fuel: 'diesel', capacity: [16, 'm3'], critical: 'critical' },
  { type: 'shovel', cat: 1, make: 'Hitachi', model: 'EX5600-7', count: 3, cost: 8900000, meterMax: 28000, fuel: 'diesel', capacity: [29, 'm3'], critical: 'critical' },
  { type: 'loader', cat: 1, make: 'Caterpillar', model: '994K', count: 5, cost: 5400000, meterMax: 26000, fuel: 'diesel', capacity: [19, 'm3'] },
  { type: 'haul_truck', cat: 2, make: 'Caterpillar', model: '793F', count: 22, cost: 4800000, meterMax: 41000, fuel: 'diesel', capacity: [227, 't'], critical: 'critical' },
  { type: 'haul_truck', cat: 2, make: 'Komatsu', model: 'HD785-7', count: 12, cost: 2100000, meterMax: 36000, fuel: 'diesel', capacity: [91, 't'] },
  { type: 'dozer', cat: 3, make: 'Caterpillar', model: 'D11T', count: 8, cost: 2600000, meterMax: 24000, fuel: 'diesel' },
  { type: 'grader', cat: 3, make: 'Caterpillar', model: '16M3', count: 5, cost: 1100000, meterMax: 19000, fuel: 'diesel' },
  { type: 'water_cart', cat: 3, make: 'Komatsu', model: 'HD605 WC', count: 4, cost: 1300000, meterMax: 21000, fuel: 'diesel' },
  { type: 'drill_rig', cat: 3, make: 'Epiroc', model: 'Pit Viper 271', count: 6, cost: 3400000, meterMax: 23000, fuel: 'diesel', critical: 'critical' },
  { type: 'drill_rig', cat: 3, make: 'Sandvik', model: 'DD422i', count: 4, cost: 1500000, meterMax: 14000, fuel: 'diesel', underground: true },
  { type: 'lhd', cat: 4, make: 'Sandvik', model: 'LH621i', count: 9, cost: 1800000, meterMax: 22000, fuel: 'diesel', underground: true, critical: 'critical' },
  { type: 'continuous_miner', cat: 4, make: 'Joy', model: '12CM30', count: 4, cost: 5600000, meterMax: 18000, fuel: 'electric', underground: true, critical: 'critical' },
  { type: 'shuttle_car', cat: 4, make: 'Joy', model: '10SC32', count: 8, cost: 1400000, meterMax: 17000, fuel: 'electric', underground: true },
  { type: 'roof_bolter', cat: 4, make: 'Fletcher', model: 'RRII', count: 6, cost: 950000, meterMax: 15000, fuel: 'electric', underground: true },
  { type: 'longwall_shearer', cat: 4, make: 'Eickhoff', model: 'SL750', count: 1, cost: 21000000, meterMax: 12000, fuel: 'electric', underground: true, critical: 'critical' },
  { type: 'crusher', cat: 5, make: 'Metso', model: 'C160 Jaw', count: 4, cost: 2900000, meterMax: 48000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'screen', cat: 5, make: 'Kwatani', model: 'Triple Deck 3.6m', count: 7, cost: 620000, meterMax: 42000, fuel: 'electric', fixed: true },
  { type: 'mill', cat: 6, make: 'FLSmidth', model: 'SAG 34x18', count: 3, cost: 24000000, meterMax: 52000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'mill', cat: 6, make: 'Outotec', model: 'Ball 22x36', count: 3, cost: 15000000, meterMax: 51000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'pump', cat: 7, make: 'Weir', model: 'Warman 14/12', count: 16, cost: 240000, meterMax: 39000, fuel: 'electric', fixed: true },
  { type: 'conveyor', cat: 8, make: 'Continental', model: 'CV-1400 Overland', count: 9, cost: 1900000, meterMax: 60000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'generator', cat: 9, make: 'Cummins', model: 'C1675D5', count: 6, cost: 480000, meterMax: 29000, fuel: 'diesel', fixed: true },
  { type: 'compressor', cat: 9, make: 'Atlas Copco', model: 'GA160', count: 7, cost: 190000, meterMax: 44000, fuel: 'electric', fixed: true },
  { type: 'substation', cat: 9, make: 'ABB', model: '132/11kV', count: 4, cost: 3200000, meterMax: 0, fuel: 'none', fixed: true, critical: 'critical' },
  { type: 'ventilation_fan', cat: 10, make: 'Howden', model: 'AXP 3.6m', count: 5, cost: 1400000, meterMax: 46000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'hoist', cat: 10, make: 'Siemag', model: 'Koepe 4.5m', count: 2, cost: 12000000, meterMax: 38000, fuel: 'electric', fixed: true, critical: 'critical' },
  { type: 'light_vehicle', cat: 11, make: 'Toyota', model: 'Land Cruiser 79', count: 26, cost: 78000, meterMax: 290000, fuel: 'diesel' },
  { type: 'bus', cat: 11, make: 'Iveco', model: 'Crossway 55', count: 6, cost: 210000, meterMax: 420000, fuel: 'diesel' },
  { type: 'fuel_truck', cat: 3, make: 'Isuzu', model: 'FVZ 20000L', count: 3, cost: 260000, meterMax: 180000, fuel: 'diesel' },
  { type: 'ambulance', cat: 11, make: 'Toyota', model: 'Hilux Rescue', count: 4, cost: 145000, meterMax: 96000, fuel: 'diesel', critical: 'high' },
  { type: 'forklift', cat: 3, make: 'Hyster', model: 'H5.0FT', count: 5, cost: 95000, meterMax: 16000, fuel: 'lpg' },
  { type: 'crane', cat: 3, make: 'Liebherr', model: 'LTM 1090', count: 2, cost: 1700000, meterMax: 11000, fuel: 'diesel' },
]

const FAILURE_CODES: readonly (readonly [string, string, string, string])[] = [
  ['ENG-01', 'Engine overheating', 'engine', 'major'],
  ['ENG-02', 'Low oil pressure', 'engine', 'major'],
  ['ENG-03', 'Turbo failure', 'engine', 'major'],
  ['ENG-04', 'Injector fault', 'engine', 'moderate'],
  ['TRN-01', 'Transmission slip', 'transmission', 'major'],
  ['TRN-02', 'Torque converter fault', 'transmission', 'major'],
  ['HYD-01', 'Hydraulic hose burst', 'hydraulics', 'moderate'],
  ['HYD-02', 'Cylinder seal leak', 'hydraulics', 'minor'],
  ['HYD-03', 'Pump low pressure', 'hydraulics', 'major'],
  ['ELE-01', 'Alternator failure', 'electrical', 'moderate'],
  ['ELE-02', 'Wiring harness chafe', 'electrical', 'minor'],
  ['ELE-03', 'VSD trip', 'electrical', 'major'],
  ['BRK-01', 'Brake overheating', 'brakes', 'major'],
  ['BRK-02', 'Park brake fault', 'brakes', 'moderate'],
  ['STR-01', 'Chassis crack', 'structure', 'major'],
  ['STR-02', 'Bucket wear plate', 'structure', 'minor'],
  ['TYR-01', 'Tyre cut', 'tyres', 'moderate'],
  ['TYR-02', 'Tyre burst', 'tyres', 'major'],
  ['DRV-01', 'Final drive noise', 'drivetrain', 'major'],
  ['COL-01', 'Radiator blockage', 'cooling', 'moderate'],
  ['CTL-01', 'PLC communication loss', 'control', 'major'],
  ['INS-01', 'Sensor drift', 'instrumentation', 'minor'],
  ['PNE-01', 'Air leak', 'pneumatics', 'minor'],
  ['OTH-01', 'Operator damage', 'other', 'moderate'],
]

const PM_SERVICES: readonly (readonly [string, string, number, number])[] = [
  ['service_a', '250 hour service', 250, 4],
  ['service_b', '500 hour service', 500, 8],
  ['service_c', '1000 hour service', 1000, 16],
  ['service_d', '2000 hour major service', 2000, 36],
  ['inspection', 'Weekly condition inspection', 0, 2],
  ['statutory', 'Statutory certification', 0, 6],
]

export async function seedAssets(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx
  const ccPerSite = ctx.costCenterIds.length / ctx.sites.length

  await insertMany(
    db,
    'asset_categories',
    ['org_id', 'code', 'name', 'class', 'meter_type'],
    CATEGORIES.map(([code, name, cls, meter]) => [orgId, code, name, cls, meter]),
  )

  const assets: AssetSeed[] = []
  const assetRows: unknown[][] = []
  let assetId = 0
  let seq = 0
  for (const spec of FLEET) {
    for (let i = 0; i < spec.count; i++) {
      seq += 1
      const ugMines = ctx.mines.filter((m) => m.mineType === 'underground')
      const surfaceMines = ctx.mines.filter((m) => m.mineType !== 'underground')
      const mine = spec.underground
        ? rng.pick(ugMines)
        : spec.fixed
          ? null
          : rng.pick(surfaceMines)
      const siteId = mine ? mine.siteId : rng.pick(ctx.sites).id
      const meter = rng.num(spec.meterMax * 0.15, spec.meterMax, 0)
      const status = rng.weighted([
        ['operational', 76], ['standby', 8], ['maintenance', 8], ['breakdown', 4],
        ['awaiting_parts', 3], ['decommissioned', 1],
      ])
      const assetNo = `${spec.type.slice(0, 2).toUpperCase()}-${pad(seq, 3)}`
      const ownership = rng.weighted([['owned', 8], ['leased', 1], ['contractor', 1]])
      assetRows.push([
        orgId, siteId, mine?.id ?? null, spec.cat + 1, null,
        (siteId - 1) * ccPerSite + rng.int(11, 13),
        assetNo, `${spec.make} ${spec.model} #${i + 1}`, spec.type, spec.make, spec.model,
        `SN${rng.int(100000, 999999)}`,
        spec.cat === 11 ? `${rng.pick(['BX', 'CA', 'DM'])} ${rng.int(10, 99)} ${rng.pick(['ABC', 'XYZ', 'MNP'])}` : null,
        rng.int(2011, 2025), isoDate(addDays(today, -rng.int(200, 3600))), spec.cost,
        'units_of_production', spec.meterMax > 0 ? spec.meterMax * 1.6 : null,
        ownership, ownership === 'contractor' ? rng.pick(ctx.contractorIds) : null,
        spec.capacity?.[0] ?? null, spec.capacity?.[1] ?? null, spec.fuel,
        spec.fuel === 'diesel' ? rng.num(400, 4500, 0) : null,
        spec.type === 'haul_truck' ? '40.00R57' : spec.type === 'loader' ? '35/65R33' : null,
        status, spec.critical ?? rng.weighted([['high', 3], ['medium', 5], ['low', 2]]),
        mine ? mine.name : rng.pick(['Process plant', 'Workshop', 'Surface infrastructure', 'ROM pad']),
        isoDate(addDays(today, -rng.int(180, 3400))), null,
        isoDate(addDays(today, rng.int(-400, 700))),
      ])
      assetId += 1
      assets.push({
        id: assetId, siteId, mineId: mine?.id ?? null, assetNo,
        name: `${spec.make} ${spec.model} #${i + 1}`, type: spec.type, meter,
        critical: spec.critical ?? 'medium', status,
      })
    }
  }
  await insertMany(
    db,
    'assets',
    ['org_id', 'site_id', 'mine_id', 'category_id', 'parent_asset_id', 'cost_center_id', 'asset_no', 'name', 'asset_type', 'manufacturer', 'model', 'serial_no', 'registration_no', 'year_built', 'acquired_on', 'acquisition_cost', 'depreciation_method', 'useful_life_hours', 'ownership', 'contractor_id', 'capacity_value', 'capacity_unit', 'fuel_type', 'fuel_capacity_l', 'tyre_size', 'status', 'criticality', 'location', 'commissioned_on', 'decommissioned_on', 'warranty_expiry'],
    assetRows,
  )
  ctx.assets = assets

  // ---- Meter readings (30 days of daily readings) ---------------------
  const meterRows: unknown[][] = []
  for (const asset of assets) {
    if (asset.type === 'substation') continue
    const daily = asset.type === 'light_vehicle' || asset.type === 'bus' ? rng.num(90, 320, 1) : rng.num(9, 21, 1)
    for (let d = 30; d >= 0; d--) {
      meterRows.push([
        orgId, asset.id, addHours(addDays(today, -d), 6).toISOString(),
        asset.type === 'light_vehicle' || asset.type === 'bus' ? 'kilometres' : 'hours',
        Math.round((asset.meter - daily * d) * 100) / 100,
        rng.weighted([['telemetry', 6], ['manual', 3], ['fms', 1]]),
        'Automated capture',
      ])
    }
  }
  await insertMany(
    db,
    'meter_readings',
    ['org_id', 'asset_id', 'reading_at', 'meter_type', 'reading', 'source', 'recorded_by'],
    meterRows,
  )

  // ---- PM plans -------------------------------------------------------
  const planRows: unknown[][] = []
  let planId = 0
  for (const asset of assets) {
    if (asset.status === 'decommissioned') continue
    for (const [service, name, intervalHours, estHours] of PM_SERVICES) {
      if (rng.bool(0.35) && intervalHours > 0) continue
      planId += 1
      const lastMeter = intervalHours > 0 ? Math.floor(asset.meter / intervalHours) * intervalHours : null
      const nextMeter = lastMeter != null ? lastMeter + intervalHours : null
      const nextDue = addDays(today, rng.int(-12, 60))
      planRows.push([
        orgId, asset.id, `PM-${pad(planId, 4)}`, `${asset.assetNo} ${name}`, service,
        intervalHours > 0 ? intervalHours : null,
        intervalHours === 0 ? (service === 'inspection' ? 7 : 180) : null,
        null,
        addDays(today, -rng.int(5, 90)).toISOString(), lastMeter,
        nextDue.toISOString(), nextMeter, estHours, Math.round(estHours * 180 + rng.num(200, 4000, 0)),
        JSON.stringify({ items: rng.int(12, 48), category: service }), true,
      ])
    }
  }
  await insertMany(
    db,
    'maintenance_plans',
    ['org_id', 'asset_id', 'code', 'name', 'service_type', 'interval_hours', 'interval_days', 'interval_km', 'last_done_at', 'last_done_meter', 'next_due_at', 'next_due_meter', 'estimated_hours', 'estimated_cost', 'checklist', 'active'],
    planRows,
  )

  await insertMany(
    db,
    'failure_codes',
    ['org_id', 'code', 'name', 'system', 'severity'],
    FAILURE_CODES.map(([code, name, system, severity]) => [orgId, code, name, system, severity]),
  )

  // ---- Work orders ----------------------------------------------------
  const artisans = ctx.employees.filter((e) => e.group === 'artisan' || e.group === 'apprentice')
  const woRows: unknown[][] = []
  const woMeta: { id: number; assetId: number; cost: number }[] = []
  const WO_COUNT = 620
  for (let i = 0; i < WO_COUNT; i++) {
    const asset = rng.pick(assets)
    const type = rng.weighted([
      ['preventive', 42], ['corrective', 26], ['breakdown', 16], ['inspection', 6],
      ['predictive', 4], ['modification', 3], ['statutory', 3],
    ])
    const reported = addDays(today, -rng.int(0, 150))
    const status = reported < addDays(today, -20)
      ? rng.weighted([['completed', 6], ['verified', 3], ['cancelled', 1]])
      : rng.weighted([['open', 4], ['planned', 3], ['in_progress', 3], ['awaiting_parts', 2], ['on_hold', 1], ['completed', 4]])
    const done = status === 'completed' || status === 'verified'
    const labourHours = rng.num(2, 46, 1)
    const labourCost = Math.round(labourHours * 62 * 100) / 100
    const partsCost = rng.num(80, 42000, 2)
    const contractorCost = rng.bool(0.22) ? rng.num(1500, 68000, 2) : 0
    const total = Math.round((labourCost + partsCost + contractorCost) * 100) / 100
    const start = addHours(reported, rng.num(1, 60, 1))
    woRows.push([
      orgId, asset.siteId, asset.id,
      type === 'preventive' ? rng.int(1, planId) : null,
      type === 'breakdown' || type === 'corrective' ? rng.int(1, FAILURE_CODES.length) : null,
      (asset.siteId - 1) * ccPerSite + rng.int(11, 13),
      `WO-${pad(i + 1, 5)}`,
      `${asset.assetNo} - ${type === 'preventive' ? rng.pick(['250h service', '500h service', '1000h service', 'Statutory inspection']) : rng.pick(['Hydraulic leak repair', 'Engine fault diagnosis', 'Brake system overhaul', 'Electrical fault finding', 'Structural crack repair', 'Conveyor belt splice', 'Pump impeller replacement', 'Tyre change'])}`,
      rng.pick([
        'Operator reported fault during pre-start inspection.',
        'Condition monitoring flagged elevated vibration.',
        'Scheduled preventive maintenance as per OEM interval.',
        'Breakdown on shift, unit recovered to workshop.',
        'Statutory certification due.',
      ]),
      type,
      type === 'breakdown' ? rng.weighted([['emergency', 3], ['high', 5], ['medium', 2]]) : rng.weighted([['high', 2], ['medium', 5], ['low', 2], ['planned', 3]]),
      status,
      rng.pick(['Operator', 'Supervisor', 'Condition Monitoring', 'Planner']),
      artisans.length > 0 ? rng.pick(artisans).id : null,
      reported.toISOString(),
      start.toISOString(), addHours(start, labourHours).toISOString(),
      done ? start.toISOString() : null,
      done ? addHours(start, labourHours + rng.num(0, 14, 1)).toISOString() : null,
      done ? rng.num(1, 52, 1) : null,
      done ? labourHours : null,
      done ? labourCost : 0, done ? partsCost : 0, done ? contractorCost : 0, done ? total : 0,
      asset.meter - rng.num(0, 900, 0),
      done ? rng.pick(['Component wear beyond limit', 'Contamination in hydraulic circuit', 'Operator error', 'Fatigue crack', 'End of service life', 'Manufacturing defect']) : null,
      done ? rng.pick(['Component replaced and tested', 'System flushed and refilled', 'Weld repair and NDT verified', 'Retrained operator', 'Sensor recalibrated']) : null,
      rng.bool(0.28),
    ])
    woMeta.push({ id: i + 1, assetId: asset.id, cost: total })
  }
  await insertMany(
    db,
    'work_orders',
    ['org_id', 'site_id', 'asset_id', 'plan_id', 'failure_code_id', 'cost_center_id', 'wo_number', 'title', 'description', 'wo_type', 'priority', 'status', 'reported_by', 'assigned_to_employee_id', 'reported_at', 'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end', 'downtime_hours', 'labour_hours', 'labour_cost', 'parts_cost', 'contractor_cost', 'total_cost', 'meter_at_service', 'root_cause', 'corrective_action', 'safety_permit_required'],
    woRows,
  )
  ctx.workOrderIds = woMeta.map((w) => w.id)

  const taskRows: unknown[][] = []
  const TASKS = ['Isolate and tag out', 'Remove guarding', 'Drain fluids', 'Replace component', 'Refit and torque to spec', 'Refill and bleed system', 'Function test', 'Remove isolation and hand back']
  for (const wo of woMeta) {
    const count = rng.int(3, 6)
    for (let t = 0; t < count; t++) {
      const est = rng.num(0.5, 8, 1)
      taskRows.push([
        orgId, wo.id, t + 1, TASKS[t % TASKS.length],
        rng.pick(['Mechanical', 'Electrical', 'Boilermaker', 'Rigging']),
        est, rng.bool(0.7) ? rng.around(est, 0.3, 1) : null,
        artisans.length > 0 ? rng.pick(artisans).id : null,
        rng.weighted([['done', 6], ['pending', 2], ['in_progress', 1], ['skipped', 1]]),
        rng.bool(0.7) ? addDays(today, -rng.int(0, 120)).toISOString() : null,
      ])
    }
  }
  await insertMany(
    db,
    'work_order_tasks',
    ['org_id', 'work_order_id', 'seq', 'description', 'trade', 'estimated_hours', 'actual_hours', 'employee_id', 'status', 'completed_at'],
    taskRows,
  )

  // ---- Downtime -------------------------------------------------------
  const downtimeRows: unknown[][] = []
  for (let i = 0; i < 2400; i++) {
    const asset = rng.pick(assets)
    const started = addHours(today, -rng.num(1, 24 * 90, 1))
    const category = rng.weighted([
      ['planned_maintenance', 26], ['unplanned_breakdown', 20], ['operational_delay', 14],
      ['shift_change', 10], ['refuelling', 8], ['blasting', 7], ['no_operator', 5],
      ['weather', 4], ['awaiting_parts', 3], ['standby', 2], ['power_outage', 1],
    ])
    const duration = category === 'unplanned_breakdown' ? rng.num(1.5, 42, 2)
      : category === 'planned_maintenance' ? rng.num(2, 28, 2)
      : rng.num(0.2, 4, 2)
    const open = rng.bool(0.02)
    downtimeRows.push([
      orgId, asset.id, null,
      category === 'unplanned_breakdown' || category === 'planned_maintenance' ? rng.pick(ctx.workOrderIds) : null,
      category,
      rng.pick(['Hydraulic leak', 'Scheduled service', 'Waiting on truck', 'Crib break', 'Blast clearance', 'Tyre change', 'No operator available', 'Heavy rain - haul road closed', 'Awaiting spare from supplier', 'Belt tear', 'Trip on overload']),
      started.toISOString(), open ? null : addHours(started, duration).toISOString(),
      open ? null : duration,
      !['shift_change', 'refuelling', 'blasting', 'standby'].includes(category),
      rng.pick(['Control Room', 'Supervisor', 'FMS', 'Maintenance Planner']),
    ])
  }
  await insertMany(
    db,
    'downtime_events',
    ['org_id', 'asset_id', 'shift_id', 'work_order_id', 'category', 'reason', 'started_at', 'ended_at', 'duration_hours', 'is_availability_loss', 'recorded_by'],
    downtimeRows,
  )

  // ---- Fuel -----------------------------------------------------------
  const dieselAssets = assets.filter((a) => !['mill', 'crusher', 'conveyor', 'substation', 'ventilation_fan', 'hoist', 'pump', 'compressor', 'continuous_miner', 'shuttle_car', 'roof_bolter', 'longwall_shearer'].includes(a.type))
  const fuelRows: unknown[][] = []
  const operators = ctx.employees.filter((e) => e.group === 'operator')
  for (let i = 0; i < 3600; i++) {
    const asset = rng.pick(dieselAssets)
    const litres = asset.type === 'haul_truck' ? rng.num(600, 2400, 1)
      : asset.type === 'light_vehicle' ? rng.num(40, 120, 1)
      : rng.num(120, 1200, 1)
    const price = rng.num(0.94, 1.28, 4)
    fuelRows.push([
      orgId, asset.siteId, asset.id, null,
      addHours(today, -rng.num(1, 24 * 60, 1)).toISOString(), 'diesel', litres,
      asset.meter - rng.num(0, 1400, 0), price, Math.round(litres * price * 100) / 100,
      `Bay ${rng.int(1, 6)}`,
      operators.length > 0 ? rng.pick(operators).id : null,
      rng.weighted([['bowser', 6], ['fuel_truck', 3], ['tank_transfer', 1]]),
    ])
  }
  await insertMany(
    db,
    'fuel_transactions',
    ['org_id', 'site_id', 'asset_id', 'shift_id', 'transacted_at', 'fuel_type', 'litres', 'meter_reading', 'unit_price', 'total_cost', 'bay', 'operator_employee_id', 'source'],
    fuelRows,
  )

  // ---- Tyres ----------------------------------------------------------
  const tyreAssets = assets.filter((a) => a.type === 'haul_truck' || a.type === 'loader')
  const tyreRows: unknown[][] = []
  for (const asset of tyreAssets) {
    for (let p = 1; p <= 6; p++) {
      const fitted = addDays(today, -rng.int(20, 700))
      const removed = rng.bool(0.3)
      tyreRows.push([
        orgId, asset.id, `TY${rng.int(100000, 999999)}`,
        rng.pick(['Bridgestone', 'Michelin', 'Goodyear', 'Triangle']),
        asset.type === 'haul_truck' ? '40.00R57' : '35/65R33',
        `P${p}`, fitted.toISOString(), removed ? addDays(fitted, rng.int(60, 400)).toISOString() : null,
        rng.num(1000, 30000, 0), removed ? rng.num(2000, 40000, 0) : null,
        rng.num(1200, 8600, 0), rng.num(12, 92, 1),
        removed ? rng.weighted([['worn', 5], ['cut', 3], ['sidewall', 1], ['burst', 1]]) : null,
        asset.type === 'haul_truck' ? 42000 : 12400,
        removed ? rng.weighted([['removed', 5], ['scrapped', 3], ['retread', 2]]) : 'fitted',
      ])
    }
  }
  await insertMany(
    db,
    'tyre_records',
    ['org_id', 'asset_id', 'serial_no', 'brand', 'size', 'position_code', 'fitted_at', 'removed_at', 'fitted_meter', 'removed_meter', 'hours_run', 'tread_depth_mm', 'removal_reason', 'cost', 'status'],
    tyreRows,
  )

  // ---- Pre-start inspections -------------------------------------------
  const inspRows: unknown[][] = []
  for (let i = 0; i < 2600; i++) {
    const asset = rng.pick(assets)
    const defects = rng.weighted([[0, 70], [1, 16], [2, 8], [3, 4], [5, 2]])
    inspRows.push([
      orgId, asset.id, null,
      operators.length > 0 ? rng.pick(operators).id : null,
      rng.weighted([['pre_start', 80], ['weekly', 10], ['statutory', 5], ['post_trip', 4], ['third_party', 1]]),
      addHours(today, -rng.num(1, 24 * 45, 1)).toISOString(),
      defects === 0 ? 'pass' : defects >= 3 ? 'fail' : 'pass_with_defects',
      defects,
      defects > 0 ? rng.pick(['Reverse alarm intermittent', 'Windscreen chip', 'Handrail loose', 'Small hydraulic weep', 'Fire extinguisher due', 'Seatbelt frayed', 'Beacon not working']) : null,
      JSON.stringify({ checks: 32, failed: defects }),
      defects >= 3 ? rng.pick(ctx.workOrderIds) : null,
    ])
  }
  await insertMany(
    db,
    'equipment_inspections',
    ['org_id', 'asset_id', 'shift_id', 'employee_id', 'inspection_type', 'inspected_at', 'result', 'defects_found', 'defect_notes', 'checklist', 'work_order_id'],
    inspRows,
  )
}

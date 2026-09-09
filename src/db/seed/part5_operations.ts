import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { SeedContext } from './context'

export async function seedOperations(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx

  // ---- Mine plans (monthly budget per mine) ----------------------------
  const planRows: unknown[][] = []
  const planIndex = new Map<string, number>()
  let planId = 0
  const monthsBack = Math.ceil(ctx.historyDays / 30) + 1
  for (const mine of ctx.mines) {
    for (let m = monthsBack; m >= -1; m--) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1))
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m + 1, 0))
      const days = end.getUTCDate()
      const ore = Math.round(mine.oreTpd * days * rng.num(0.94, 1.06, 3))
      const waste = Math.round(ore * mine.stripRatio)
      planId += 1
      planRows.push([
        orgId, mine.id, `PLAN-${mine.code}-${isoDate(start).slice(0, 7)}`,
        `${mine.name} ${isoDate(start).slice(0, 7)} plan`, 'monthly',
        isoDate(start), isoDate(end),
        mine.commodity === 'coal' ? 0 : ore, waste, mine.commodity === 'coal' ? ore : 0,
        mine.stripRatio || null, mine.gradeMean || null, mine.gradeUnit,
        mine.mineType === 'underground' ? rng.num(180, 620, 1) : null,
        rng.num(9000, 42000, 0),
        Math.round((ore + waste) * rng.num(2.4, 6.8, 2)),
        m > 0 ? 'closed' : m === 0 ? 'active' : 'approved',
        'L. Anderson', addDays(start, -6).toISOString(),
      ])
      planIndex.set(`${mine.id}|${isoDate(start).slice(0, 7)}`, planId)
    }
  }
  await insertMany(
    db,
    'mine_plans',
    ['org_id', 'mine_id', 'code', 'name', 'horizon', 'period_start', 'period_end', 'ore_tonnes', 'waste_tonnes', 'coal_tonnes', 'strip_ratio', 'planned_grade', 'grade_unit', 'development_metres', 'drill_metres', 'budget_cost', 'status', 'approved_by', 'approved_at'],
    planRows,
  )

  // ---- Production ------------------------------------------------------
  const loaders = ctx.assets.filter((a) => ['excavator', 'shovel', 'loader', 'lhd', 'continuous_miner'].includes(a.type))
  const prodRows: unknown[][] = []
  for (let d = ctx.historyDays; d >= 0; d--) {
    const date = addDays(today, -d)
    const dateStr = isoDate(date)
    const monthKey = dateStr.slice(0, 7)
    // Weekend and wet-season effects keep the series from looking synthetic.
    const dow = date.getUTCDay()
    const weekend = dow === 0 ? 0.72 : dow === 6 ? 0.88 : 1
    const seasonal = 1 + 0.06 * Math.sin((date.getUTCMonth() / 12) * Math.PI * 2)
    for (const mine of ctx.mines) {
      const areas = ctx.areasByMine.get(mine.id) ?? []
      const mineLoaders = loaders.filter((l) => l.mineId === mine.id)
      const planIdForMonth = planIndex.get(`${mine.id}|${monthKey}`) ?? null
      for (const shiftType of ['day', 'night'] as const) {
        const shiftId = ctx.shiftIndex.get(`${mine.id}|${dateStr}|${shiftType}`) ?? null
        const shiftFactor = shiftType === 'day' ? 0.54 : 0.46
        const disrupted = rng.bool(0.06)
        const base = mine.oreTpd * weekend * seasonal * shiftFactor * (disrupted ? rng.num(0.25, 0.6, 3) : rng.num(0.88, 1.12, 3))

        const oreMaterial = mine.commodity === 'coal' ? 'coal' : 'ore'
        const oreTonnes = Math.round(base)
        const grade = mine.gradeMean ? Math.max(0.02, rng.around(mine.gradeMean, 0.18, 3)) : null
        const ash = mine.ashMean ? rng.around(mine.ashMean, 0.16, 2) : null
        const cv = mine.cvMean ? Math.round(rng.around(mine.cvMean, 0.06, 0)) : null
        prodRows.push([
          orgId, mine.siteId, mine.id, areas.length ? rng.pick(areas) : null, shiftId, planIdForMonth,
          dateStr, shiftType, oreMaterial, oreTonnes,
          Math.round(oreTonnes / (mine.commodity === 'coal' ? 1.45 : 2.7)),
          grade, mine.gradeUnit, ash, cv,
          mine.commodity === 'coal' ? rng.num(4, 12, 2) : rng.num(1.5, 6, 2),
          grade && mine.commodity === 'gold' ? Math.round((oreTonnes * grade) / 31.1035 * 100) / 100 : null,
          Math.round(oreTonnes / rng.num(90, 220, 0)),
          mineLoaders.length ? rng.pick(mineLoaders).id : null,
          mine.commodity === 'coal' ? rng.weighted([['washplant', 6], ['rom_pad', 3], ['stockpile', 1]]) : rng.weighted([['crusher', 5], ['rom_pad', 3], ['stockpile', 2]]),
          null, rng.num(1.2, 6.4, 2), 'production', d > 1,
          rng.pick(['Shift Supervisor', 'Control Room', 'Mine Captain']),
        ])

        if (mine.stripRatio > 0) {
          const wasteTonnes = Math.round(base * mine.stripRatio * rng.num(0.82, 1.18, 3))
          prodRows.push([
            orgId, mine.siteId, mine.id, areas.length ? rng.pick(areas) : null, shiftId, planIdForMonth,
            dateStr, shiftType, mine.commodity === 'coal' ? 'overburden' : 'waste', wasteTonnes,
            Math.round(wasteTonnes / 2.6), null, null, null, null, null, null,
            Math.round(wasteTonnes / rng.num(90, 220, 0)),
            mineLoaders.length ? rng.pick(mineLoaders).id : null,
            'waste_dump', null, rng.num(1.8, 7.2, 2), 'production', d > 1, 'Shift Supervisor',
          ])
        }

        if (rng.bool(0.3)) {
          const lowGrade = Math.round(base * rng.num(0.04, 0.16, 3))
          prodRows.push([
            orgId, mine.siteId, mine.id, areas.length ? rng.pick(areas) : null, shiftId, planIdForMonth,
            dateStr, shiftType, 'low_grade', lowGrade, Math.round(lowGrade / 2.7),
            grade ? Math.round(grade * 0.42 * 1000) / 1000 : null, mine.gradeUnit, null, null,
            rng.num(2, 8, 2), null, Math.round(lowGrade / 160),
            mineLoaders.length ? rng.pick(mineLoaders).id : null,
            'stockpile', null, rng.num(1, 4, 2), 'production', d > 1, 'Shift Supervisor',
          ])
        }
      }
    }
  }
  await insertMany(
    db,
    'production_records',
    ['org_id', 'site_id', 'mine_id', 'mining_area_id', 'shift_id', 'plan_id', 'record_date', 'shift_type', 'material', 'tonnes', 'volume_bcm', 'grade', 'grade_unit', 'ash_pct', 'cv_kcal_kg', 'moisture_pct', 'contained_metal', 'truck_loads', 'loader_asset_id', 'destination', 'destination_ref', 'hauled_distance_km', 'source_type', 'approved', 'entered_by'],
    prodRows,
  )

  // ---- Underground development ------------------------------------------
  const ugMines = ctx.mines.filter((m) => m.mineType === 'underground')
  const devRows: unknown[][] = []
  for (const mine of ugMines) {
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const mineCrews = ctx.crewIds.filter((_, i) => Math.floor(i / 4) === mine.id - 1)
    let cumulative = rng.num(4200, 12000, 1)
    for (let d = ctx.historyDays; d >= 0; d--) {
      if (rng.bool(0.25)) continue
      const advance = rng.num(1.4, 6.8, 2)
      cumulative = Math.round((cumulative + advance) * 100) / 100
      const date = addDays(today, -d)
      devRows.push([
        orgId, mine.id, areas.length ? rng.pick(areas) : null,
        ctx.shiftIndex.get(`${mine.id}|${isoDate(date)}|day`) ?? null,
        isoDate(date), `${mine.code}-HD${pad(rng.int(1, 14), 2)}`,
        advance, cumulative, rng.num(16, 32, 1), Math.round(advance * rng.num(58, 96, 1)),
        rng.pick(['Rock bolts and mesh', 'Shotcrete and bolts', 'Steel sets', 'Bolts only']),
        rng.int(8, 28), rng.int(0, 12), rng.num(0, 9, 2), rng.num(6, 14, 2),
        mineCrews.length ? rng.pick(mineCrews) : null,
        rng.bool(0.2) ? rng.pick(['Ground conditions poor, additional support installed', 'Water make increased', 'Face advance restricted by ventilation']) : null,
      ])
    }
  }
  await insertMany(
    db,
    'development_records',
    ['org_id', 'mine_id', 'mining_area_id', 'shift_id', 'record_date', 'heading_code', 'advance_m', 'cumulative_m', 'face_area_m2', 'tonnes_broken', 'support_installed', 'bolts_installed', 'mesh_sheets', 'shotcrete_m3', 'cycle_hours', 'crew_id', 'comments'],
    devRows,
  )

  // ---- Drill patterns, drilling, blasting -------------------------------
  const patternRows: unknown[][] = []
  const patterns: { id: number; mineId: number; areaId: number | null; tonnes: number }[] = []
  let patternId = 0
  for (const mine of ctx.mines) {
    if (mine.mineType === 'underground' && mine.commodity === 'coal') continue
    const areas = ctx.areasByMine.get(mine.id) ?? []
    for (let p = 0; p < 44; p++) {
      patternId += 1
      const burden = rng.num(4.5, 8.5, 1)
      const spacing = Math.round(burden * rng.num(1.05, 1.3, 2) * 10) / 10
      const holes = rng.int(48, 240)
      const depth = rng.num(8, 17, 1)
      const bench = rng.num(7.5, 15, 1)
      const areaId = areas.length ? rng.pick(areas) : null
      const tonnes = Math.round(holes * burden * spacing * bench * 2.65)
      patternRows.push([
        orgId, mine.id, areaId, `${mine.code}-P${pad(patternId, 4)}`,
        burden, spacing, rng.pick([152, 165, 200, 251, 270]), depth, rng.num(0.5, 1.5, 1),
        rng.num(3, 6, 1), bench, holes, Math.round(holes * depth * 10) / 10,
        rng.pick(['Fresh basalt', 'Weathered shale', 'Sandstone', 'BIF', 'Porphyry']),
        rng.num(0.18, 0.85, 4), 'L. Anderson',
        rng.weighted([['fired', 7], ['charged', 1], ['drilled', 1], ['designed', 1]]),
      ])
      patterns.push({ id: patternId, mineId: mine.id, areaId, tonnes })
    }
  }
  await insertMany(
    db,
    'drill_patterns',
    ['org_id', 'mine_id', 'mining_area_id', 'pattern_code', 'burden_m', 'spacing_m', 'hole_diameter_mm', 'hole_depth_m', 'subdrill_m', 'stemming_m', 'bench_height_m', 'hole_count', 'total_metres', 'rock_type', 'powder_factor_kg_t', 'designed_by', 'status'],
    patternRows,
  )

  const drillRigs = ctx.assets.filter((a) => a.type === 'drill_rig')
  const operators = ctx.employees.filter((e) => e.group === 'operator')
  const drillingRows: unknown[][] = []
  for (let i = 0; i < 900; i++) {
    const pattern = rng.pick(patterns)
    const date = addDays(today, -rng.int(0, ctx.historyDays))
    const metres = rng.num(90, 620, 1)
    drillingRows.push([
      orgId, pattern.mineId, pattern.id,
      drillRigs.length ? rng.pick(drillRigs).id : null,
      ctx.shiftIndex.get(`${pattern.mineId}|${isoDate(date)}|${rng.pick(['day', 'night'])}`) ?? null,
      isoDate(date), rng.int(4, 40), metres, rng.pick([152, 165, 200, 251]),
      rng.num(18, 62, 2), rng.num(0.2, 2.4, 2),
      operators.length ? rng.pick(operators).id : null,
      rng.num(0, 4.5, 2),
      rng.bool(0.18) ? rng.pick(['Hole collapse in weathered zone', 'Water inflow', 'Rod change delays', 'Bit change']) : null,
    ])
  }
  await insertMany(
    db,
    'drilling_records',
    ['org_id', 'mine_id', 'pattern_id', 'asset_id', 'shift_id', 'record_date', 'holes_drilled', 'metres_drilled', 'bit_size_mm', 'penetration_rate_m_h', 'bits_consumed', 'operator_employee_id', 'delays_hours', 'comments'],
    drillingRows,
  )

  const magRows: unknown[][] = []
  for (const site of ctx.sites) {
    for (const [type, name] of [['bulk', 'Bulk Emulsion Store'], ['packaged', 'Packaged Explosives Magazine'], ['detonator', 'Detonator Magazine']] as const) {
      magRows.push([
        orgId, site.id, `MAG-${site.code}-${type.slice(0, 3).toUpperCase()}`, `${site.code} ${name}`,
        type, `EXP-LIC-${rng.int(10000, 99999)}`, isoDate(addDays(today, rng.int(30, 700))),
        type === 'bulk' ? 240000 : type === 'packaged' ? 18000 : 2400,
        `${rng.int(1, 6)} km from plant, ${rng.int(300, 900)} m exclusion`,
        null, 'active',
      ])
    }
  }
  await insertMany(
    db,
    'explosives_magazines',
    ['org_id', 'site_id', 'code', 'name', 'magazine_type', 'licence_no', 'licence_expiry', 'capacity_kg', 'location', 'custodian_employee_id', 'status'],
    magRows,
  )
  const magazineCount = magRows.length

  // ---- Blasts ------------------------------------------------------------
  const shotfirers = ctx.employees.filter((e) => e.title === 'Shotfirer' || e.group === 'supervisor')
  const blastRows: unknown[][] = []
  const blasts: { id: number; magazineId: number; kg: number; firedAt: Date }[] = []
  let blastId = 0
  for (const pattern of patterns) {
    if (rng.bool(0.18)) continue
    blastId += 1
    const mine = ctx.mines.find((m) => m.id === pattern.mineId)!
    const fired = addHours(addDays(today, -rng.int(0, ctx.historyDays)), rng.int(11, 16))
    const holes = rng.int(48, 240)
    const kg = Math.round(pattern.tonnes * rng.num(0.2, 0.55, 3))
    const misfires = rng.weighted([[0, 92], [1, 5], [2, 2], [4, 1]])
    blastRows.push([
      orgId, mine.id, pattern.areaId, pattern.id,
      ctx.shiftIndex.get(`${mine.id}|${isoDate(fired)}|day`) ?? null,
      `BL-${mine.code}-${pad(blastId, 4)}`,
      rng.weighted([['production', 8], ['trim', 1], ['pre_split', 1]]),
      addHours(fired, -rng.num(1, 6, 1)).toISOString(), fired.toISOString(),
      holes, kg, holes + rng.int(0, 30),
      Math.round(pattern.tonnes / 2.65), pattern.tonnes,
      Math.round((kg / pattern.tonnes) * 10000) / 10000,
      Math.round(kg / rng.num(6, 22, 1)), rng.num(0.6, 12.4, 3), rng.num(96, 128, 1),
      rng.num(180, 620, 1), rng.bool(0.04), misfires, rng.num(300, 800, 0),
      shotfirers.length ? rng.pick(shotfirers).id : null,
      true, 'cleared',
      misfires > 0 ? 'Misfire made safe under supervision, area re-cleared before re-entry.' : null,
    ])
    blasts.push({ id: blastId, magazineId: rng.int(1, magazineCount), kg, firedAt: fired })
  }
  await insertMany(
    db,
    'blasts',
    ['org_id', 'mine_id', 'mining_area_id', 'pattern_id', 'shift_id', 'blast_number', 'blast_type', 'planned_at', 'fired_at', 'holes_charged', 'total_explosive_kg', 'detonators_used', 'volume_bcm', 'tonnes_blasted', 'powder_factor_kg_t', 'max_instantaneous_charge_kg', 'ppv_mm_s', 'air_blast_db', 'fragmentation_p80_mm', 'flyrock_observed', 'misfires', 'exclusion_zone_m', 'shotfirer_employee_id', 'clearance_confirmed', 'status', 'notes'],
    blastRows,
  )

  const explRows: unknown[][] = []
  const balances = new Map<number, number>()
  for (let m = 1; m <= magazineCount; m++) balances.set(m, rng.num(40000, 180000, 1))
  const sortedBlasts = [...blasts].sort((a, b) => a.firedAt.getTime() - b.firedAt.getTime())
  for (const blast of sortedBlasts) {
    if (rng.bool(0.4)) {
      const qty = rng.num(20000, 90000, 1)
      const bal = Math.round(((balances.get(blast.magazineId) ?? 0) + qty) * 100) / 100
      balances.set(blast.magazineId, bal)
      explRows.push([
        orgId, blast.magazineId, addHours(blast.firedAt, -rng.num(12, 72, 1)).toISOString(), 'receipt',
        'Emulsion bulk', 'emulsion', qty, 'kg', null, null, bal, `GRN-EXP-${rng.int(1000, 9999)}`, 'Magazine Custodian',
      ])
    }
    const bal = Math.round(((balances.get(blast.magazineId) ?? 0) - blast.kg) * 100) / 100
    balances.set(blast.magazineId, bal)
    explRows.push([
      orgId, blast.magazineId, addHours(blast.firedAt, -rng.num(1, 5, 1)).toISOString(), 'issue',
      rng.pick(['Emulsion bulk', 'Heavy ANFO', 'ANFO prill']),
      rng.pick(['emulsion', 'heavy_anfo', 'anfo']), blast.kg, 'kg', blast.id,
      shotfirers.length ? rng.pick(shotfirers).id : null, bal, `BL-${pad(blast.id, 4)}`, 'Magazine Custodian',
    ])
  }
  await insertMany(
    db,
    'explosives_transactions',
    ['org_id', 'magazine_id', 'transacted_at', 'direction', 'product', 'product_class', 'quantity', 'unit', 'blast_id', 'issued_to_employee_id', 'balance_after', 'reference', 'recorded_by'],
    explRows,
  )

  // ---- Haulage cycles ----------------------------------------------------
  const trucks = ctx.assets.filter((a) => a.type === 'haul_truck')
  const loadersForHaul = ctx.assets.filter((a) => ['excavator', 'shovel', 'loader'].includes(a.type))
  const haulRows: unknown[][] = []
  for (let i = 0; i < 4200; i++) {
    const truck = rng.pick(trucks)
    const mine = ctx.mines.find((m) => m.id === truck.mineId) ?? rng.pick(ctx.mines)
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const start = addHours(today, -rng.num(1, 24 * 30, 2))
    const queue = rng.num(0.2, 9, 2)
    const load = rng.num(1.8, 5.4, 2)
    const haul = rng.num(4, 16, 2)
    const dump = rng.num(0.8, 2.6, 2)
    const ret = rng.num(3, 12, 2)
    const total = Math.round((queue + load + haul + dump + ret) * 100) / 100
    haulRows.push([
      orgId, mine.id, null, truck.id,
      loadersForHaul.length ? rng.pick(loadersForHaul).id : null,
      operators.length ? rng.pick(operators).id : null,
      start.toISOString(), addHours(start, total / 60).toISOString(),
      areas.length ? rng.pick(areas) : null,
      rng.pick(['ROM pad', 'Crusher', 'Waste dump 3', 'Washplant', 'Stockpile A']),
      rng.weighted([['ore', 4], ['waste', 4], ['coal', 2]]),
      rng.num(88, 232, 2), rng.num(0.8, 6.4, 3), queue, load, haul, dump, ret, total,
      rng.num(28, 140, 1),
    ])
  }
  await insertMany(
    db,
    'haulage_cycles',
    ['org_id', 'mine_id', 'shift_id', 'truck_asset_id', 'loader_asset_id', 'operator_employee_id', 'cycle_start', 'cycle_end', 'source_area_id', 'destination', 'material', 'payload_tonnes', 'distance_km', 'queue_minutes', 'load_minutes', 'haul_minutes', 'dump_minutes', 'return_minutes', 'cycle_minutes', 'fuel_litres'],
    haulRows,
  )

  // ---- Stockpiles --------------------------------------------------------
  const spRows: unknown[][] = []
  const stockpiles: { id: number; material: string; siteId: number; tonnes: number }[] = []
  let spId = 0
  const SP_DEFS: readonly (readonly [string, string, string])[] = [
    ['ROM', 'ROM Pad', 'ore'],
    ['LG', 'Low Grade Stockpile', 'low_grade'],
    ['CRS', 'Crushed Ore Stockpile', 'ore'],
    ['RAW', 'Raw Coal Stockpile', 'coal_raw'],
    ['PRD', 'Product Coal Stockpile', 'coal_product'],
    ['MID', 'Middlings Stockpile', 'coal_middlings'],
    ['CON', 'Concentrate Shed', 'concentrate'],
    ['WST', 'Waste Dump North', 'waste'],
  ]
  for (const site of ctx.sites) {
    for (const [code, name, material] of SP_DEFS) {
      if (site.code !== 'BRC' && material.startsWith('coal')) continue
      if (site.code === 'BRC' && (material === 'ore' || material === 'low_grade' || material === 'concentrate')) continue
      spId += 1
      const tonnes = rng.num(4000, 480000, 1)
      spRows.push([
        orgId, site.id, null, `${site.code}-${code}`, `${site.code} ${name}`, material,
        material === 'coal_product' ? rng.pick(['RB1 6000', 'RB3 5500', 'Domestic']) : null,
        Math.round(tonnes * rng.num(1.4, 3.2, 2)), tonnes,
        ['ore', 'low_grade'].includes(material) ? rng.num(0.3, 3.4, 3) : null, 'g/t',
        material.startsWith('coal') ? rng.num(8, 28, 2) : null,
        material.startsWith('coal') ? rng.num(4900, 6500, 0) : null,
        rng.num(2, 11, 2),
        rng.pick(['Adjacent to plant', 'North of ROM', 'Rail siding', 'Pit exit']),
        'active', isoDate(addDays(today, -rng.int(1, 40))),
      ])
      stockpiles.push({ id: spId, material, siteId: site.id, tonnes })
    }
  }
  await insertMany(
    db,
    'stockpiles',
    ['org_id', 'site_id', 'mine_id', 'code', 'name', 'material', 'product_grade', 'capacity_tonnes', 'current_tonnes', 'average_grade', 'grade_unit', 'average_ash_pct', 'average_cv_kcal_kg', 'moisture_pct', 'location', 'status', 'last_surveyed_on'],
    spRows,
  )
  ctx.stockpileIds = stockpiles.map((s) => s.id)

  const moveRows: unknown[][] = []
  for (const sp of stockpiles) {
    let balance = sp.tonnes
    for (let d = 0; d < 90; d++) {
      const date = addDays(today, -d)
      const direction = rng.bool(0.5) ? 'in' : 'out'
      const tonnes = rng.num(200, 14000, 1)
      balance = Math.max(0, Math.round((direction === 'in' ? balance + tonnes : balance - tonnes) * 100) / 100)
      moveRows.push([
        orgId, sp.id, null, addHours(date, rng.int(0, 23)).toISOString(), direction, tonnes,
        ['ore', 'low_grade'].includes(sp.material) ? rng.num(0.3, 3.6, 3) : null,
        sp.material.startsWith('coal') ? rng.num(8, 28, 2) : null,
        sp.material.startsWith('coal') ? rng.num(4900, 6500, 0) : null,
        direction === 'in' ? rng.pick(['Pit', 'Rehandle', 'Plant product']) : null,
        direction === 'out' ? rng.pick(['Crusher', 'Washplant', 'Train load out', 'Truck dispatch']) : null,
        balance, `MV-${pad(sp.id, 3)}-${pad(d, 3)}`, 'Weighbridge',
      ])
    }
  }
  await insertMany(
    db,
    'stockpile_movements',
    ['org_id', 'stockpile_id', 'shift_id', 'moved_at', 'direction', 'tonnes', 'grade', 'ash_pct', 'cv_kcal_kg', 'source', 'destination', 'balance_after', 'reference', 'recorded_by'],
    moveRows,
  )

  // ---- Underground environment --------------------------------------------
  const ventRows: unknown[][] = []
  const gasRows: unknown[][] = []
  for (const mine of ugMines) {
    const areas = ctx.areasByMine.get(mine.id) ?? []
    for (let i = 0; i < 900; i++) {
      const velocity = rng.num(0.4, 6.5, 3)
      const area = rng.num(9, 32, 2)
      ventRows.push([
        orgId, mine.id, areas.length ? rng.pick(areas) : null,
        `VS-${pad(rng.int(1, 24), 2)}`, addHours(today, -rng.num(1, 24 * 60, 1)).toISOString(),
        velocity, area, Math.round(velocity * area * 100) / 100,
        rng.num(24, 38, 1), rng.num(20, 31, 1), rng.num(52, 96, 1), rng.num(88, 108, 2),
        rng.num(0.2, 6.4, 3), velocity > 0.5, rng.pick(['Ventilation Officer', 'Shift Boss']),
      ])
    }
    const isCoal = mine.commodity === 'coal'
    for (let i = 0; i < 1400; i++) {
      const ch4 = isCoal ? rng.weighted([[rng.num(0, 0.5, 3), 72], [rng.num(0.5, 1.25, 3), 20], [rng.num(1.25, 2, 3), 6], [rng.num(2, 4.2, 3), 2]]) : rng.num(0, 0.15, 3)
      const co = rng.weighted([[rng.num(0, 12, 1), 82], [rng.num(12, 30, 1), 12], [rng.num(30, 90, 1), 6]])
      const o2 = rng.num(18.6, 20.9, 2)
      const level = ch4 >= 2 || co >= 50 || o2 < 19 ? 'evacuate' : ch4 >= 1.25 || co >= 30 ? 'trip' : ch4 >= 0.8 || co >= 20 ? 'alarm' : ch4 >= 0.5 ? 'alert' : 'normal'
      gasRows.push([
        orgId, mine.id, areas.length ? rng.pick(areas) : null,
        `GS-${pad(rng.int(1, 30), 2)}`, addHours(today, -rng.num(1, 24 * 60, 1)).toISOString(),
        rng.weighted([['fixed_sensor', 6], ['handheld', 3], ['tube_bundle', 1]]),
        ch4, co, rng.num(0.02, 1.4, 3), o2, rng.num(0, 4, 2), rng.num(0, 3, 2), rng.num(0, 2, 2),
        rng.num(22, 36, 1), rng.num(0.05, 0.9, 4), level,
        level === 'evacuate' || level === 'trip' ? rng.pick(['Section de-energised and personnel withdrawn', 'Ventilation increased, area re-tested', 'Production stopped pending gas clearance']) : null,
        rng.pick(['Gas Testing Officer', 'Automated telemetry', 'Shift Boss']),
      ])
    }
  }
  await insertMany(
    db,
    'ventilation_readings',
    ['org_id', 'mine_id', 'mining_area_id', 'station_code', 'measured_at', 'air_velocity_m_s', 'cross_section_m2', 'air_quantity_m3_s', 'dry_bulb_c', 'wet_bulb_c', 'humidity_pct', 'pressure_kpa', 'dust_mg_m3', 'compliant', 'measured_by'],
    ventRows,
  )
  await insertMany(
    db,
    'gas_readings',
    ['org_id', 'mine_id', 'mining_area_id', 'station_code', 'measured_at', 'source', 'ch4_pct', 'co_ppm', 'co2_pct', 'o2_pct', 'h2s_ppm', 'nox_ppm', 'so2_ppm', 'temperature_c', 'graham_ratio', 'alarm_level', 'action_taken', 'measured_by'],
    gasRows,
  )

  const supportRows: unknown[][] = []
  for (const mine of ugMines) {
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const mineCrews = ctx.crewIds.filter((_, i) => Math.floor(i / 4) === mine.id - 1)
    for (let i = 0; i < 420; i++) {
      const type = rng.weighted([['rock_bolt', 40], ['mesh', 22], ['shotcrete', 14], ['cable_bolt', 10], ['steel_set', 6], ['straps', 5], ['timber', 3]])
      supportRows.push([
        orgId, mine.id, areas.length ? rng.pick(areas) : null,
        isoDate(addDays(today, -rng.int(0, ctx.historyDays))), type,
        rng.num(6, 420, 1), type === 'shotcrete' ? 'm3' : type === 'mesh' ? 'sheets' : 'ea',
        rng.num(1.8, 8, 1), rng.num(0.9, 1.6, 2), `GSS-${rng.int(100, 999)}`,
        type.includes('bolt') ? rng.num(60, 220, 1) : null,
        rng.weighted([['pass', 9], ['retest', 1]]),
        mineCrews.length ? rng.pick(mineCrews) : null,
        rng.pick(['Geotech Engineer', 'Shift Boss', 'Ground Control Officer']),
      ])
    }
  }
  await insertMany(
    db,
    'ground_support_records',
    ['org_id', 'mine_id', 'mining_area_id', 'installed_on', 'support_type', 'quantity', 'unit', 'length_m', 'spacing_m', 'design_ref', 'pull_test_kn', 'qa_result', 'installed_by_crew_id', 'inspected_by'],
    supportRows,
  )

  const pumps = ctx.assets.filter((a) => a.type === 'pump')
  const dewaterRows: unknown[][] = []
  for (const mine of ctx.mines) {
    for (let d = 0; d < 120; d++) {
      dewaterRows.push([
        orgId, mine.id, pumps.length ? rng.pick(pumps).id : null,
        isoDate(addDays(today, -d)), rng.num(400, 9800, 1), rng.num(6, 24, 1),
        rng.num(-320, 40, 2), rng.pick(['Settling dam 1', 'Return water dam', 'Licensed discharge point']),
        rng.num(5.8, 8.6, 2), rng.num(4, 240, 1), 'Dewatering Attendant',
      ])
    }
  }
  await insertMany(
    db,
    'dewatering_records',
    ['org_id', 'mine_id', 'asset_id', 'record_date', 'volume_pumped_m3', 'pump_hours', 'water_level_m', 'discharge_point', 'ph', 'turbidity_ntu', 'recorded_by'],
    dewaterRows,
  )
}

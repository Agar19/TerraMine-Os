import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { PlantSeed, SeedContext } from './context'
import { REAGENTS } from './names'

const PLANTS: readonly (readonly [number, string, string, string, string, number, number])[] = [
  // siteIdx, code, name, type, commodity, tph, recovery
  [0, 'SDG-CIL', 'Sundowner CIL Plant', 'cil', 'gold', 620, 93.4],
  [0, 'SDG-GRV', 'Sundowner Gravity Circuit', 'gravity', 'gold', 180, 38.0],
  [1, 'BRC-CHPP', 'Blackridge Coal Handling and Preparation Plant', 'chpp', 'coal', 1450, 72.5],
  [1, 'BRC-DMS', 'Blackridge Dense Medium Module', 'dms', 'coal', 780, 78.2],
  [2, 'CVA-CON', 'Cerro Verde Concentrator', 'flotation', 'copper', 2600, 88.6],
  [3, 'KMB-BEN', 'Kamba Beneficiation Plant', 'magnetic_separation', 'iron_ore', 1100, 84.1],
]

const CIRCUITS: readonly (readonly [string, string])[] = [
  ['ROM', 'rom'],
  ['PCR', 'primary_crushing'],
  ['SCR', 'secondary_crushing'],
  ['MIL', 'milling'],
  ['CLA', 'classification'],
  ['GRV', 'gravity'],
  ['LCH', 'leach'],
  ['ADS', 'adsorption'],
  ['ELU', 'elution'],
  ['EW', 'electrowinning'],
  ['THK', 'thickening'],
  ['TSF', 'tailings'],
]

export async function seedProcessing(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx

  await insertMany(
    db,
    'plants',
    ['org_id', 'site_id', 'code', 'name', 'plant_type', 'commodity', 'design_throughput_tph', 'design_recovery_pct', 'commissioned_on', 'status', 'manager'],
    PLANTS.map(([siteIdx, code, name, type, commodity, tph, recovery]) => [
      orgId, siteIdx + 1, code, name, type, commodity, tph, recovery,
      isoDate(addDays(today, -rng.int(900, 4000))), 'operating',
      rng.pick(['C. Wong', 'M. Rossi', 'S. Adeyemi', 'K. Novak']),
    ]),
  )
  const plants: PlantSeed[] = PLANTS.map(([siteIdx, code, name, type, commodity, tph, recovery], i) => ({
    id: i + 1, siteId: siteIdx + 1, code, name, plantType: type, commodity, tph, recovery,
  }))
  ctx.plants = plants

  const circuitRows: unknown[][] = []
  const circuitsByPlant = new Map<number, number[]>()
  let circuitId = 0
  for (const plant of plants) {
    const ids: number[] = []
    for (const [code, stage] of CIRCUITS) {
      if (plant.plantType === 'chpp' && ['LCH', 'ADS', 'ELU', 'EW', 'GRV'].includes(code)) continue
      if (plant.plantType === 'gravity' && ['LCH', 'ADS', 'ELU'].includes(code)) continue
      circuitRows.push([
        orgId, plant.id, code, `${plant.code} ${stage.replace(/_/g, ' ')}`, stage,
        Math.round(plant.tph * rng.num(0.9, 1.25, 2)),
        rng.weighted([['operating', 8], ['standby', 1], ['maintenance', 1]]),
      ])
      ids.push(++circuitId)
    }
    circuitsByPlant.set(plant.id, ids)
  }
  await insertMany(
    db,
    'plant_circuits',
    ['org_id', 'plant_id', 'code', 'name', 'stage', 'design_capacity_tph', 'status'],
    circuitRows,
  )

  // ---- Daily plant runs -------------------------------------------------
  const runRows: unknown[][] = []
  const runs: { id: number; plantId: number; date: Date; feed: number }[] = []
  let runId = 0
  for (const plant of plants) {
    const mine = ctx.mines.find((m) => m.siteId === plant.siteId)
    for (let d = ctx.historyDays; d >= 0; d--) {
      const date = addDays(today, -d)
      const availableHours = 24
      const downtime = rng.weighted([[rng.num(0, 1.5, 2), 55], [rng.num(1.5, 5, 2), 30], [rng.num(5, 14, 2), 12], [rng.num(14, 22, 2), 3]])
      const operating = Math.round((availableHours - downtime) * 100) / 100
      const tph = rng.around(plant.tph, 0.14, 2)
      const feed = Math.round(operating * tph)
      const feedGrade = mine?.gradeMean ? Math.max(0.05, rng.around(mine.gradeMean, 0.16, 3)) : null
      const recovery = Math.min(99, Math.max(40, rng.around(plant.recovery, 0.05, 2)))
      const isCoal = plant.commodity === 'coal'
      const yieldPct = isCoal ? rng.around(plant.recovery, 0.09, 2) : null
      const product = isCoal ? Math.round(feed * (yieldPct as number) / 100) : Math.round(feed * rng.num(0.9, 0.99, 3))
      const metal = plant.commodity === 'gold' && feedGrade
        ? Math.round((feed * feedGrade * recovery) / 100 / 31.1035 * 100) / 100
        : plant.commodity === 'copper' && feedGrade
          ? Math.round((feed * feedGrade * recovery) / 10000 * 100) / 100
          : null
      runId += 1
      runRows.push([
        orgId, plant.id, null, isoDate(date), 'daily', operating, availableHours, downtime,
        feed, feedGrade, mine?.gradeUnit ?? 'g/t', rng.num(2, 11, 2), tph,
        product, isCoal ? null : feedGrade ? Math.round(feedGrade * rng.num(20, 60, 2) * 100) / 100 : null,
        Math.round(feed - product), feedGrade ? Math.round(feedGrade * (1 - recovery / 100) * 1000) / 1000 : null,
        isCoal ? null : recovery, metal, plant.commodity === 'gold' ? 'oz' : 't',
        rng.num(2000, 42000, 2), Math.round(feed * rng.num(11, 34, 1)), Math.round(feed * rng.num(0.4, 1.4, 2)),
        yieldPct, isCoal ? rng.num(8, 16, 2) : null, isCoal ? rng.num(5600, 6500, 0) : null,
        Math.round((operating / availableHours) * 10000) / 100,
        rng.bool(0.2) ? rng.pick(['Mill liner change completed', 'Feed blend adjusted for hard ore', 'Thickener underflow density low', 'Belt scale calibrated', 'Power dip caused trip']) : null,
      ])
      runs.push({ id: runId, plantId: plant.id, date, feed })
    }
  }
  await insertMany(
    db,
    'plant_runs',
    ['org_id', 'plant_id', 'shift_id', 'run_date', 'shift_type', 'operating_hours', 'available_hours', 'downtime_hours', 'feed_tonnes', 'feed_grade', 'feed_grade_unit', 'feed_moisture_pct', 'throughput_tph', 'product_tonnes', 'product_grade', 'tailings_tonnes', 'tailings_grade', 'recovery_pct', 'metal_produced', 'metal_unit', 'reagent_cost', 'power_kwh', 'water_m3', 'yield_pct', 'ash_pct', 'cv_kcal_kg', 'utilisation_pct', 'comments'],
    runRows,
  )

  // ---- Reagents ----------------------------------------------------------
  const reagentRows: unknown[][] = []
  for (const run of runs) {
    if (rng.bool(0.55)) continue
    for (const reagent of rng.sample(REAGENTS, rng.int(2, 4))) {
      const dosage = rng.num(20, 1400, 3)
      const qty = Math.round((run.feed * dosage) / 1000) / 1000
      const unitCost = rng.num(0.6, 6.4, 3)
      reagentRows.push([
        orgId, run.id, run.plantId, reagent, qty, 'kg', dosage, unitCost,
        Math.round(qty * unitCost * 100) / 100, isoDate(run.date),
      ])
    }
  }
  await insertMany(
    db,
    'reagent_consumption',
    ['org_id', 'plant_run_id', 'plant_id', 'reagent', 'quantity', 'unit', 'dosage_g_t', 'unit_cost', 'total_cost', 'consumed_on'],
    reagentRows,
  )

  // ---- Metallurgical samples ---------------------------------------------
  const metRows: unknown[][] = []
  for (let i = 0; i < 2600; i++) {
    const plant = rng.pick(plants)
    const circuits = circuitsByPlant.get(plant.id) ?? []
    const stream = rng.weighted([['feed', 30], ['product', 24], ['tailings', 22], ['concentrate', 10], ['solution', 8], ['middlings', 6]])
    metRows.push([
      orgId, plant.id, circuits.length ? rng.pick(circuits) : null, null,
      rng.pick(['Mill feed belt', 'Cyclone overflow', 'Leach tank 4', 'CIL tail', 'Product belt', 'Reject conveyor', 'Thickener underflow']),
      addHours(today, -rng.num(1, 24 * 60, 1)).toISOString(), stream,
      rng.num(0.01, 6.5, 4), plant.commodity === 'copper' ? 'pct' : 'g/t',
      rng.num(28, 74, 2), rng.num(48, 220, 1), rng.num(8.5, 11.6, 2),
      plant.commodity === 'gold' ? rng.num(60, 340, 1) : null,
      plant.commodity === 'coal' ? rng.num(6, 32, 2) : null,
      rng.num(2, 14, 2),
      plant.commodity === 'coal' ? rng.num(4800, 6600, 0) : null,
      rng.num(0.2, 2.8, 3),
      rng.pick(['Lab Technician', 'Shift Metallurgist', 'Auto sampler']),
    ])
  }
  await insertMany(
    db,
    'metallurgical_samples',
    ['org_id', 'plant_id', 'circuit_id', 'plant_run_id', 'sample_point', 'sampled_at', 'stream_type', 'grade', 'grade_unit', 'solids_pct', 'p80_microns', 'ph', 'cn_ppm', 'ash_pct', 'moisture_pct', 'cv_kcal_kg', 'sulphur_pct', 'analysed_by'],
    metRows,
  )

  // ---- Gold room ----------------------------------------------------------
  const goldPlants = plants.filter((p) => p.commodity === 'gold')
  const pourRows: unknown[][] = []
  const pours: { id: number; oz: number; poured: Date }[] = []
  let pourId = 0
  for (let d = ctx.historyDays; d >= 0; d -= rng.int(4, 9)) {
    pourId += 1
    const poured = addHours(addDays(today, -d), 10)
    const gross = rng.num(8000, 42000, 2)
    const fineness = rng.num(0.72, 0.94, 4)
    const fineG = Math.round(gross * fineness * 1000) / 1000
    const oz = Math.round((fineG / 31.1035) * 10000) / 10000
    pourRows.push([
      orgId, rng.pick(goldPlants).id, `POUR-${pad(pourId, 4)}`, poured.toISOString(),
      rng.weighted([['elution', 6], ['gravity', 3], ['cleanup', 1]]),
      rng.int(1, 4), gross, fineness, fineG, oz, Math.round(gross * rng.num(0.02, 0.16, 4) * 1000) / 1000,
      rng.pick(['Rand Refinery', 'Perth Mint', 'Site Assay']),
      `${rng.pick(['S. Hughes', 'T. Mokoena', 'Security Manager'])} / ${rng.pick(['C. Wong', 'Gold Room Supervisor'])}`,
      `SEAL${rng.int(100000, 999999)}`,
      d < 14 ? 'in_vault' : rng.weighted([['sold', 6], ['dispatched', 2], ['refined', 2]]),
    ])
    pours.push({ id: pourId, oz, poured })
  }
  await insertMany(
    db,
    'gold_pours',
    ['org_id', 'plant_id', 'pour_number', 'poured_at', 'source', 'bars_count', 'gross_weight_g', 'fineness', 'fine_gold_g', 'fine_gold_oz', 'silver_g', 'assay_lab', 'witnessed_by', 'security_seal_no', 'status'],
    pourRows,
  )

  const shipRows: unknown[][] = []
  const linkRows: unknown[][] = []
  let shipId = 0
  for (let i = 0; i < pours.length; i += 3) {
    const group = pours.slice(i, i + 3)
    if (group.length === 0) continue
    shipId += 1
    const oz = Math.round(group.reduce((s, p) => s + p.oz, 0) * 10000) / 10000
    const shipped = addDays(group[group.length - 1].poured, rng.int(1, 6))
    const price = rng.num(2180, 2620, 2)
    const settlementOz = Math.round(oz * rng.num(0.9975, 1.0008, 6) * 10000) / 10000
    shipRows.push([
      orgId, 1, `BUL-${pad(shipId, 4)}`, shipped.toISOString(),
      rng.pick(['Rand Refinery', 'Perth Mint', 'Metalor Technologies']),
      rng.pick(['G4S Aviation', 'Brinks', 'Loomis']),
      group.length * rng.int(1, 3), Math.round(oz * 31.1035 * 1000) / 1000, oz,
      Math.round(oz * price * 100) / 100, 'USD', `INS-${rng.int(100000, 999999)}`,
      shipped < today ? addDays(shipped, rng.int(1, 5)).toISOString() : null,
      shipped < addDays(today, -10) ? settlementOz : null,
      shipped < addDays(today, -10) ? Math.round(settlementOz * price * 100) / 100 : null,
      shipped < addDays(today, -10) ? Math.round((settlementOz - oz) * 10000) / 10000 : null,
      shipped < addDays(today, -10) ? 'settled' : shipped < today ? 'received' : 'in_transit',
    ])
    for (const p of group) linkRows.push([orgId, p.id, shipId])
  }
  await insertMany(
    db,
    'bullion_shipments',
    ['org_id', 'site_id', 'shipment_no', 'shipped_at', 'refinery', 'carrier', 'bars_count', 'gross_weight_g', 'fine_gold_oz', 'declared_value', 'currency', 'insurance_ref', 'received_at', 'settlement_oz', 'settlement_value', 'variance_oz', 'status'],
    shipRows,
  )
  await insertMany(db, 'gold_pour_shipment_links', ['org_id', 'pour_id', 'shipment_id'], linkRows)

  // ---- Product specs and quality ------------------------------------------
  const SPECS: readonly (readonly [string, string, string, number | null, number | null, number | null, number | null, number | null])[] = [
    ['RB1-6000', 'Export Thermal RB1 6000 kcal', 'coal', 6000, 15, 8, 1.0, null],
    ['RB3-5500', 'Export Thermal RB3 5500 kcal', 'coal', 5500, 20, 10, 1.2, null],
    ['DOM-4800', 'Domestic Thermal 4800 kcal', 'coal', 4800, 26, 12, 1.6, null],
    ['MET-COK', 'Metallurgical Coking Coal', 'coal', 6800, 10, 9, 0.8, null],
    ['AU-DORE', 'Gold Dore Bar', 'gold', null, null, null, null, 0.7],
    ['CU-CON-25', 'Copper Concentrate 25%', 'copper', null, null, 9, 1.8, 25],
    ['FE-LUMP-62', 'Iron Ore Lump 62% Fe', 'iron_ore', null, null, 4, 0.05, 62],
    ['FE-FINE-58', 'Iron Ore Fines 58% Fe', 'iron_ore', null, null, 8, 0.08, 58],
  ]
  await insertMany(
    db,
    'product_specs',
    ['org_id', 'code', 'name', 'commodity', 'min_cv_kcal_kg', 'max_ash_pct', 'max_moisture_pct', 'max_sulphur_pct', 'min_grade', 'penalty_terms', 'active'],
    SPECS.map(([code, name, commodity, cv, ash, moisture, sulphur, grade]) => [
      orgId, code, name, commodity, cv, ash, moisture, sulphur, grade,
      cv ? 'CV penalty 0.5% of price per 50 kcal below spec; rejection below 4500 kcal.' : 'Rejection outside contractual assay tolerance.',
      true,
    ]),
  )
  ctx.productSpecIds = SPECS.map((_, i) => i + 1)

  const qualityRows: unknown[][] = []
  for (let i = 0; i < 1400; i++) {
    const specIdx = rng.int(0, SPECS.length - 1)
    const spec = SPECS[specIdx]
    // A plant that meets its contract nine times in ten is doing well; a
    // pass rate near 50% would mean the spec was never achievable.
    const onSpec = rng.bool(0.9)
    const cv = spec[3] ? Math.round(spec[3] * (onSpec ? rng.num(1.0, 1.07, 4) : rng.num(0.9, 0.995, 4))) : null
    const ash = spec[4] ? rng.num(spec[4] * (onSpec ? 0.6 : 1.02), spec[4] * (onSpec ? 0.99 : 1.28), 2) : null
    const moisture = spec[5] ? rng.num(spec[5] * (onSpec ? 0.5 : 1.02), spec[5] * (onSpec ? 0.97 : 1.3), 2) : null
    const sulphur = spec[6] ? rng.num(spec[6] * (onSpec ? 0.4 : 1.05), spec[6] * (onSpec ? 0.95 : 1.4), 3) : null
    const grade = spec[7] ? rng.num(spec[7] * (onSpec ? 1.0 : 0.9), spec[7] * (onSpec ? 1.06 : 0.995), 3) : null
    const inSpec =
      (cv == null || cv >= (spec[3] as number)) &&
      (ash == null || ash <= (spec[4] as number)) &&
      (moisture == null || moisture <= (spec[5] as number)) &&
      (grade == null || grade >= (spec[7] as number))
    qualityRows.push([
      orgId, rng.pick(ctx.sites).id, specIdx + 1,
      ctx.stockpileIds.length ? rng.pick(ctx.stockpileIds) : null,
      `QS-${pad(i + 1, 5)}`, addHours(today, -rng.num(1, 24 * 120, 1)).toISOString(),
      rng.pick(['Product belt', 'Train load out', 'Stockpile auger', 'Ship loader', 'Truck sample']),
      cv, ash, moisture, sulphur, rng.num(18, 34, 2), rng.num(6, 52, 1), grade,
      inSpec, inSpec ? null : rng.pick(['Ash above contractual maximum', 'CV shortfall - penalty applies', 'Moisture high after rainfall', 'Grade below minimum']),
      rng.pick(['Site Laboratory', 'SGS', 'Intertek']),
    ])
  }
  await insertMany(
    db,
    'quality_samples',
    ['org_id', 'site_id', 'product_spec_id', 'stockpile_id', 'sample_no', 'sampled_at', 'sample_point', 'cv_kcal_kg', 'ash_pct', 'moisture_pct', 'sulphur_pct', 'volatile_matter_pct', 'size_p80_mm', 'grade', 'within_spec', 'deviation_notes', 'analysed_by'],
    qualityRows,
  )

  // ---- Tailings storage ----------------------------------------------------
  const tsfRows: unknown[][] = []
  const facilities: number[] = []
  let tsfId = 0
  for (const site of ctx.sites) {
    const count = site.code === 'SDG' ? 2 : 1
    for (let i = 0; i < count; i++) {
      tsfId += 1
      const capacity = rng.num(8_000_000, 90_000_000, 0)
      tsfRows.push([
        orgId, site.id, `TSF-${site.code}-${i + 1}`, `${site.code} Tailings Facility ${i + 1}`,
        rng.weighted([['downstream', 4], ['centreline', 3], ['upstream', 1], ['dry_stack', 2]]),
        capacity, Math.round(capacity * rng.num(0.42, 0.88, 3)),
        rng.num(1180, 1620, 2), rng.num(0.9, 3.4, 2), 1.5,
        rng.weighted([['high', 4], ['very_high', 3], ['significant', 2], ['extreme', 1]]),
        rng.pick(['Knight Piesold', 'SRK Consulting', 'Golder Associates']),
        isoDate(addDays(today, -rng.int(30, 340))), isoDate(addDays(today, rng.int(20, 340))),
        'active',
      ])
      facilities.push(tsfId)
    }
  }
  await insertMany(
    db,
    'tailings_facilities',
    ['org_id', 'site_id', 'code', 'name', 'facility_type', 'design_capacity_m3', 'stored_volume_m3', 'crest_elevation_m', 'freeboard_m', 'min_freeboard_m', 'consequence_category', 'engineer_of_record', 'last_audit_on', 'next_audit_on', 'status'],
    tsfRows,
  )

  const tsfReadingRows: unknown[][] = []
  for (const facilityId of facilities) {
    for (let d = 0; d < 150; d++) {
      const freeboard = rng.num(0.7, 3.6, 2)
      tsfReadingRows.push([
        orgId, facilityId, addHours(addDays(today, -d), 8).toISOString(),
        rng.num(1176, 1618, 2), freeboard, rng.num(1140, 1590, 2), rng.num(0.2, 26, 2),
        rng.num(0, 34, 2), rng.num(1200, 18000, 1), rng.num(1.28, 1.62, 3),
        rng.num(6.8, 10.4, 2), rng.num(0.2, 18, 2),
        freeboard < 1.0 ? 'red' : freeboard < 1.5 ? 'amber' : 'green',
        rng.pick(['TSF Operator', 'Environmental Officer', 'Engineer of Record']),
        freeboard < 1.5 ? 'Freeboard below trigger, decant pumping increased.' : null,
      ])
    }
  }
  await insertMany(
    db,
    'tailings_readings',
    ['org_id', 'facility_id', 'measured_at', 'pond_level_m', 'freeboard_m', 'phreatic_surface_m', 'seepage_l_s', 'displacement_mm', 'deposition_tonnes', 'density_t_m3', 'ph', 'cn_wad_ppm', 'alarm_level', 'inspector', 'notes'],
    tsfReadingRows,
  )
}

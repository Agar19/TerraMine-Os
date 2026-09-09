import { insertMany, pad } from './helpers'
import { addDays, isoDate } from './rng'
import type { SeedContext } from './context'

const LITHOLOGIES = ['Basalt', 'Dolerite', 'Quartzite', 'Shale', 'Sandstone', 'Siltstone', 'Granodiorite', 'Ultramafic', 'Banded Iron Formation', 'Conglomerate', 'Mudstone', 'Coal', 'Carbonaceous shale', 'Porphyry', 'Skarn']
const ALTERATION = ['Silicification', 'Sericite', 'Chlorite', 'Carbonate', 'Potassic', 'Argillic', 'Propylitic', 'None']
const MINERALISATION = ['Pyrite', 'Chalcopyrite', 'Arsenopyrite', 'Galena', 'Sphalerite', 'Magnetite', 'Hematite', 'Visible gold', 'Bornite', 'None']

export async function seedGeology(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx

  await insertMany(
    db,
    'exploration_projects',
    ['org_id', 'site_id', 'code', 'name', 'commodity', 'stage', 'area_km2', 'budget', 'spend_to_date', 'start_date', 'end_date', 'geologist', 'status'],
    [
      [orgId, 1, 'EXP-SDG-N', 'Sundowner North Extension', 'gold', 'resource_definition', 42.5, 4800000, 3120000, isoDate(addDays(today, -520)), isoDate(addDays(today, 300)), 'P. Patel', 'active'],
      [orgId, 1, 'EXP-SDG-D', 'Deeps Down Plunge', 'gold', 'brownfield', 8.2, 2600000, 1880000, isoDate(addDays(today, -380)), isoDate(addDays(today, 180)), 'P. Patel', 'active'],
      [orgId, 2, 'EXP-BRC-W', 'Blackridge West Block', 'coal', 'prefeasibility', 118.0, 3200000, 940000, isoDate(addDays(today, -260)), isoDate(addDays(today, 520)), 'L. Dlamini', 'active'],
      [orgId, 3, 'EXP-CVA-S', 'Cerro Verde South Porphyry', 'copper', 'scoping', 210.0, 7400000, 2260000, isoDate(addDays(today, -700)), isoDate(addDays(today, 640)), 'A. Reyes', 'active'],
      [orgId, 4, 'EXP-KMB-R', 'Kamba Ridge Regional', 'iron_ore', 'target_generation', 340.0, 1900000, 420000, isoDate(addDays(today, -160)), isoDate(addDays(today, 800)), 'G. Banda', 'active'],
      [orgId, 1, 'EXP-SDG-GC', 'Sundowner Grade Control', 'gold', 'grade_control', 3.1, 2200000, 1640000, isoDate(addDays(today, -365)), isoDate(addDays(today, 90)), 'Grade Control Team', 'active'],
    ],
  )

  const programRows: unknown[][] = []
  const programs: { id: number; mineId: number; purpose: string; method: string }[] = []
  let programId = 0
  for (const mine of ctx.mines) {
    for (const [purpose, method, holes, metres] of [
      ['grade_control', 'rc', 180, 5400],
      ['resource_definition', 'diamond', 42, 12800],
      ['geotechnical', 'diamond', 12, 2100],
    ] as const) {
      programId += 1
      programRows.push([
        orgId, rng.int(1, 6), mine.id, `DP-${mine.code}-${purpose.slice(0, 2).toUpperCase()}`,
        `${mine.name} ${purpose.replace(/_/g, ' ')} programme`, purpose, method,
        holes, metres, Math.round(holes * rng.num(0.7, 1.05, 2)), Math.round(metres * rng.num(0.62, 1.02, 2)),
        method === 'diamond' ? rng.num(180, 320, 2) : rng.num(48, 92, 2),
        rng.pick(ctx.contractorIds),
        isoDate(addDays(today, -rng.int(120, 420))), isoDate(addDays(today, rng.int(-30, 240))),
        rng.weighted([['in_progress', 5], ['completed', 4], ['planned', 1]]),
      ])
      programs.push({ id: programId, mineId: mine.id, purpose, method })
    }
  }
  await insertMany(
    db,
    'drill_programs',
    ['org_id', 'project_id', 'mine_id', 'code', 'name', 'purpose', 'drill_method', 'planned_holes', 'planned_metres', 'actual_holes', 'actual_metres', 'cost_per_metre', 'contractor_id', 'start_date', 'end_date', 'status'],
    programRows,
  )

  // ---- Drillholes -----------------------------------------------------
  const holeRows: unknown[][] = []
  const holes: { id: number; mineId: number; depth: number; commodity: string; areaId: number }[] = []
  let holeId = 0
  for (const program of programs) {
    const mine = ctx.mines.find((m) => m.id === program.mineId)!
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const count = program.purpose === 'grade_control' ? 46 : program.purpose === 'resource_definition' ? 20 : 6
    for (let i = 0; i < count; i++) {
      holeId += 1
      const depth = program.method === 'rc' ? rng.num(24, 96, 1) : rng.num(180, 640, 1)
      const areaId = areas.length > 0 ? rng.pick(areas) : null
      const drilledFrom = addDays(today, -rng.int(10, 400))
      holeRows.push([
        orgId, program.id, mine.id, areaId,
        `${mine.code}${program.method === 'rc' ? 'RC' : 'DD'}${pad(holeId, 4)}`,
        program.method === 'rc' ? 'rc' : 'diamond',
        rng.num(300000, 340000, 3), rng.num(6200000, 6260000, 3), rng.num(280, 460, 3),
        rng.num(0, 360, 2), rng.num(-90, -45, 2),
        Math.round(depth * rng.num(0.95, 1.1, 2) * 10) / 10, depth,
        isoDate(drilledFrom), isoDate(addDays(drilledFrom, rng.int(1, 12))),
        program.method === 'diamond' ? rng.pick(['NQ', 'HQ', 'PQ']) : null,
        rng.num(78, 100, 1), rng.num(12, 180, 1),
        rng.pick(['P. Patel', 'A. Reyes', 'G. Banda', 'Site Geologist']),
        rng.weighted([['assayed', 6], ['logged', 2], ['completed', 1], ['drilling', 1]]),
        null,
      ])
      holes.push({ id: holeId, mineId: mine.id, depth, commodity: mine.commodity, areaId: areaId ?? 0 })
    }
  }
  await insertMany(
    db,
    'drillholes',
    ['org_id', 'program_id', 'mine_id', 'mining_area_id', 'hole_id', 'hole_type', 'easting', 'northing', 'elevation_m', 'azimuth_deg', 'dip_deg', 'planned_depth_m', 'final_depth_m', 'drilled_from', 'drilled_to', 'core_size', 'recovery_pct', 'water_table_m', 'logged_by', 'status', 'comments'],
    holeRows,
  )

  // ---- Downhole surveys and lithology ----------------------------------
  const surveyRows: unknown[][] = []
  const lithoRows: unknown[][] = []
  for (const hole of holes) {
    for (let d = 0; d <= hole.depth; d += 30) {
      surveyRows.push([orgId, hole.id, d, rng.num(0, 360, 2), rng.num(-90, -45, 2), 'gyro', addDays(today, -rng.int(10, 380)).toISOString()])
    }
    // Round each interval to the stored scale so accumulated float error
    // can never collapse an interval onto itself (to_m > from_m is checked).
    let from = 0
    while (from < hole.depth - 0.05) {
      const length = rng.num(2, 26, 1)
      const to = Math.min(hole.depth, Math.round((from + length) * 100) / 100)
      const isCoal = hole.commodity === 'coal' && rng.bool(0.22)
      lithoRows.push([
        orgId, hole.id, from, to,
        isCoal ? 'Coal' : rng.pick(LITHOLOGIES),
        rng.pick(ALTERATION), rng.pick(MINERALISATION),
        rng.weighted([['fresh', 6], ['slightly', 3], ['moderately', 2], ['highly', 1], ['completely', 1], ['transported', 1]]),
        rng.num(18, 100, 1), rng.num(2, 7, 1),
        isCoal ? rng.pick(['Alfred Seam', 'Gus Seam', 'Coalbrook Seam']) : null,
        rng.pick(['Grey', 'Dark grey', 'Green grey', 'Black', 'Brown', 'Pale']),
        null,
      ])
      from = to
    }
  }
  await insertMany(
    db,
    'drillhole_surveys',
    ['org_id', 'drillhole_id', 'depth_m', 'azimuth_deg', 'dip_deg', 'survey_method', 'surveyed_at'],
    surveyRows,
  )
  await insertMany(
    db,
    'lithology_intervals',
    ['org_id', 'drillhole_id', 'from_m', 'to_m', 'lithology', 'alteration', 'mineralisation', 'weathering', 'rqd_pct', 'hardness', 'seam_name', 'colour', 'description'],
    lithoRows,
  )

  // ---- Sample batches, samples, assays ---------------------------------
  const batchCount = 34
  const batchRows: unknown[][] = []
  for (let i = 0; i < batchCount; i++) {
    const dispatched = addDays(today, -rng.int(5, 320))
    const received = addDays(dispatched, rng.int(1, 6))
    const results = addDays(received, rng.int(4, 21))
    batchRows.push([
      orgId, `BATCH-${pad(i + 1, 4)}`,
      rng.pick(['SGS Analytical Labs', 'ALS Geochemistry', 'Intertek Minerals', 'Site Laboratory']),
      0, isoDate(dispatched), isoDate(received),
      results < today ? isoDate(results) : null,
      results < today ? rng.weighted([['validated', 6], ['results_received', 3], ['rejected', 1]]) : 'at_lab',
      Math.round((results.getTime() - dispatched.getTime()) / 86400000),
      rng.num(2400, 38000, 2),
    ])
  }
  await insertMany(
    db,
    'sample_batches',
    ['org_id', 'batch_no', 'laboratory', 'sample_count', 'dispatched_on', 'received_on', 'results_on', 'status', 'turnaround_days', 'cost'],
    batchRows,
  )

  const sampleRows: unknown[][] = []
  const samples: { id: number; commodity: string; grade: number }[] = []
  let sampleId = 0
  for (const hole of holes) {
    const count = Math.min(24, Math.max(4, Math.round(hole.depth / 12)))
    for (let s = 0; s < count; s++) {
      sampleId += 1
      const from = Math.round((s * (hole.depth / count)) * 10) / 10
      const to = Math.round((from + hole.depth / count) * 10) / 10
      const qaqc = rng.weighted([['primary', 90], ['field_duplicate', 4], ['pulp_duplicate', 2], ['crm', 3], ['blank', 1]])
      const mine = ctx.mines.find((m) => m.id === hole.mineId)!
      const grade = qaqc === 'blank' ? rng.num(0, 0.02, 4) : Math.max(0, rng.around(mine.gradeMean, 0.85, 4))
      sampleRows.push([
        orgId, hole.id, rng.int(1, batchCount), hole.areaId || null,
        `S${pad(sampleId, 6)}`,
        rng.weighted([['core', 5], ['half_core', 3], ['rc_chip', 6], ['channel', 1]]),
        from, to, Math.round((to - from) * 10) / 10, rng.num(1.4, 6.8, 3),
        isoDate(addDays(today, -rng.int(10, 380))),
        rng.pick(['Field Geologist', 'Grade Control Tech', 'Sampler']),
        qaqc, qaqc === 'crm' ? rng.num(0.8, 5.2, 3) : null,
        rng.weighted([['validated', 6], ['assayed', 3], ['dispatched', 1]]),
      ])
      samples.push({ id: sampleId, commodity: mine.commodity, grade })
    }
  }
  await insertMany(
    db,
    'samples',
    ['org_id', 'drillhole_id', 'batch_id', 'mining_area_id', 'sample_no', 'sample_type', 'from_m', 'to_m', 'length_m', 'weight_kg', 'collected_on', 'collected_by', 'qaqc_type', 'crm_expected', 'status'],
    sampleRows,
  )
  await db.query('update sample_batches b set sample_count = t.n from (select batch_id, count(*) n from samples group by batch_id) t where t.batch_id = b.id')

  const ELEMENTS: Record<string, readonly (readonly [string, string, number])[]> = {
    gold: [['Au', 'g/t', 1], ['Ag', 'g/t', 6], ['As', 'ppm', 220], ['S', 'pct', 1.4]],
    copper: [['Cu', 'pct', 1], ['Au', 'g/t', 0.12], ['Mo', 'ppm', 140], ['S', 'pct', 2.1]],
    iron_ore: [['Fe', 'pct', 1], ['SiO2', 'pct', 4.2], ['Al2O3', 'pct', 2.1], ['P', 'pct', 0.06]],
    coal: [['S', 'pct', 0.8], ['Ash', 'pct', 17]],
  }
  const assayRows: unknown[][] = []
  for (const sample of samples) {
    const elements = ELEMENTS[sample.commodity] ?? ELEMENTS.gold
    for (const [element, unit, factor] of elements) {
      const value = element === 'Au' || element === 'Cu' || element === 'Fe'
        ? Math.round(sample.grade * factor * 10000) / 10000
        : Math.round(rng.around(factor, 0.5, 4) * 10000) / 10000
      assayRows.push([
        orgId, sample.id, element, value, unit,
        rng.pick(['FA50', 'AAS', 'ICP-OES', 'ICP-MS', 'XRF']),
        unit === 'ppm' ? 0.5 : 0.01, value < 0.02,
        rng.pick(['SGS Analytical Labs', 'ALS Geochemistry', 'Site Laboratory']),
        isoDate(addDays(today, -rng.int(5, 340))), false,
      ])
    }
  }
  await insertMany(
    db,
    'assays',
    ['org_id', 'sample_id', 'element', 'value', 'unit', 'method', 'detection_limit', 'below_detection', 'laboratory', 'analysed_on', 'is_repeat'],
    assayRows,
  )

  const coalSamples = samples.filter((s) => s.commodity === 'coal')
  await insertMany(
    db,
    'coal_quality_results',
    ['org_id', 'sample_id', 'basis', 'moisture_pct', 'ash_pct', 'volatile_matter_pct', 'fixed_carbon_pct', 'sulphur_pct', 'calorific_value_kcal_kg', 'hgi', 'phosphorus_pct', 'chlorine_pct', 'ash_fusion_temp_c', 'swelling_index', 'analysed_on', 'laboratory'],
    coalSamples.map((s) => {
      const ash = rng.num(9, 32, 3)
      return [
        orgId, s.id, rng.weighted([['air_dried', 6], ['as_received', 3], ['dry', 1]]),
        rng.num(2.4, 11.5, 3), ash, rng.num(18, 34, 3), rng.num(38, 62, 3), rng.num(0.4, 2.6, 3),
        Math.round((7200 - ash * 78) * rng.num(0.96, 1.04, 3)), rng.num(42, 68, 2),
        rng.num(0.002, 0.06, 4), rng.num(0.005, 0.09, 4), rng.num(1180, 1480, 1), rng.num(0, 8, 1),
        isoDate(addDays(today, -rng.int(5, 340))), rng.pick(['SGS Analytical Labs', 'Site Laboratory']),
      ]
    }),
  )

  // ---- Block model summary and resource statements -----------------------
  const blockRows: unknown[][] = []
  for (const mine of ctx.mines) {
    const areas = ctx.areasByMine.get(mine.id) ?? []
    for (let b = 0; b < 160; b++) {
      const volume = rng.num(8000, 36000, 1)
      const density = mine.commodity === 'coal' ? rng.num(1.35, 1.55, 3) : rng.num(2.55, 3.15, 3)
      const grade = Math.max(0, rng.around(mine.gradeMean, 0.55, 4))
      const cutoff = mine.commodity === 'gold' ? 0.45 : mine.commodity === 'copper' ? 0.22 : 0
      blockRows.push([
        orgId, mine.id, areas.length ? rng.pick(areas) : null, `${mine.code}-BLK${pad(b + 1, 4)}`,
        rng.num(300000, 340000, 2), rng.num(6200000, 6260000, 2), rng.num(-800, 460, 2),
        volume, density, Math.round(volume * density),
        grade, mine.gradeUnit, mine.commodity === 'copper' ? rng.num(0.02, 0.28, 4) : null,
        mine.commodity === 'coal' ? rng.num(9, 30, 2) : null,
        mine.commodity === 'coal' ? rng.num(4800, 6600, 0) : null,
        rng.weighted([['measured', 3], ['indicated', 4], ['inferred', 3]]),
        mine.commodity === 'coal' ? rng.pick(['Alfred Seam', 'Gus Seam']) : rng.pick(['Oxide', 'Transition', 'Fresh']),
        rng.num(62, 94, 2), cutoff, grade >= cutoff, rng.bool(0.28),
        isoDate(addDays(today, -rng.int(30, 400))),
      ])
    }
  }
  await insertMany(
    db,
    'resource_blocks',
    ['org_id', 'mine_id', 'mining_area_id', 'block_code', 'easting', 'northing', 'elevation_m', 'volume_m3', 'density', 'tonnes', 'grade_primary', 'grade_unit', 'grade_secondary', 'ash_pct', 'cv_kcal_kg', 'classification', 'ore_type', 'recovery_pct', 'cut_off_grade', 'is_ore', 'mined', 'estimated_on'],
    blockRows,
  )

  const statementRows: unknown[][] = []
  for (const mine of ctx.mines) {
    for (const period of [0, 365]) {
      for (const category of ['measured', 'indicated', 'inferred', 'proven', 'probable'] as const) {
        const tonnes = rng.num(2_000_000, 68_000_000, 0)
        const grade = Math.max(0.05, rng.around(mine.gradeMean, 0.25, 3))
        statementRows.push([
          orgId, mine.id, isoDate(addDays(today, -period - 30)), category, 'JORC',
          tonnes, grade, mine.gradeUnit,
          mine.commodity === 'gold' ? Math.round((tonnes * grade) / 31.1035) : Math.round(tonnes * grade / 100),
          mine.commodity === 'gold' ? 'oz' : 't',
          mine.commodity === 'gold' ? 0.45 : mine.commodity === 'copper' ? 0.22 : 0,
          rng.pick(['P. Patel (MAusIMM)', 'A. Reyes (SME-RM)', 'G. Banda (SACNASP)']),
          'Reported in accordance with the JORC Code 2012 edition.',
        ])
      }
    }
  }
  await insertMany(
    db,
    'resource_statements',
    ['org_id', 'mine_id', 'as_at', 'category', 'reporting_code', 'tonnes', 'grade', 'grade_unit', 'contained_metal', 'contained_unit', 'cut_off_grade', 'competent_person', 'notes'],
    statementRows,
  )

  // ---- Geotechnical monitoring and survey pickups -------------------------
  const geoRows: unknown[][] = []
  for (let i = 0; i < 1400; i++) {
    const mine = rng.pick(ctx.mines)
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const velocity = rng.weighted([[rng.num(0, 0.8, 3), 80], [rng.num(0.8, 3.5, 3), 14], [rng.num(3.5, 14, 3), 5], [rng.num(14, 60, 3), 1]])
    geoRows.push([
      orgId, mine.id, areas.length ? rng.pick(areas) : null,
      `GT-${pad(rng.int(1, 40), 3)}`,
      rng.weighted([['prism', 5], ['extensometer', 3], ['piezometer', 3], ['radar', 2], ['inclinometer', 1], ['seismic', 1], ['convergence', 1]]),
      addDays(today, -rng.int(0, 120)).toISOString(),
      rng.num(0, 260, 2), velocity, rng.num(20, 780, 1),
      velocity > 14 ? 'evacuate' : velocity > 3.5 ? 'red' : velocity > 0.8 ? 'amber' : 'green',
      velocity > 3.5 ? rng.pick(['Area barricaded and personnel withdrawn', 'Increased monitoring frequency to hourly', 'Geotech review convened']) : null,
      rng.pick(['Geotech Technician', 'Survey', 'Automated system']),
    ])
  }
  await insertMany(
    db,
    'geotech_monitoring',
    ['org_id', 'mine_id', 'mining_area_id', 'station_code', 'instrument_type', 'measured_at', 'displacement_mm', 'velocity_mm_day', 'pore_pressure_kpa', 'alarm_level', 'action_taken', 'recorded_by'],
    geoRows,
  )

  const pickupRows: unknown[][] = []
  for (let i = 0; i < 480; i++) {
    const mine = rng.pick(ctx.mines)
    const areas = ctx.areasByMine.get(mine.id) ?? []
    const volume = rng.num(4000, 90000, 1)
    const density = mine.commodity === 'coal' ? 1.45 : 2.72
    const tonnes = Math.round(volume * density)
    const reconciled = Math.round(tonnes * rng.num(0.9, 1.08, 4))
    pickupRows.push([
      orgId, mine.id, areas.length ? rng.pick(areas) : null,
      isoDate(addDays(today, -rng.int(0, 180))),
      rng.pick(['M. Ncube', 'Survey Team', 'K. Larsen']),
      rng.weighted([['drone', 5], ['total_station', 3], ['gps', 2], ['laser_scan', 2]]),
      volume, tonnes,
      mine.commodity === 'coal' ? 'coal' : rng.weighted([['ore', 4], ['waste', 4], ['stockpile', 2]]),
      reconciled, Math.round(((reconciled - tonnes) / tonnes) * 10000) / 100,
      null,
    ])
  }
  await insertMany(
    db,
    'survey_pickups',
    ['org_id', 'mine_id', 'mining_area_id', 'pickup_date', 'surveyor', 'method', 'volume_m3', 'tonnes', 'material', 'reconciled_tonnes', 'variance_pct', 'notes'],
    pickupRows,
  )
}

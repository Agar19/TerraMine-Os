import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { SeedContext } from './context'

const HAZARD_DEFS: readonly (readonly [string, string, string, boolean])[] = [
  ['Fall of ground in development heading', 'ground_control', 'Rock mass failure onto personnel or equipment', true],
  ['Methane accumulation at the face', 'gas', 'Ignition or explosion of accumulated flammable gas', true],
  ['Spontaneous combustion in goaf', 'fire', 'Self heating of coal leading to underground fire', true],
  ['Inrush of water from old workings', 'inrush', 'Sudden inflow of water or slurry into workings', true],
  ['Mobile equipment interaction with light vehicle', 'mobile_equipment', 'Collision between haul truck and light vehicle', true],
  ['Pit wall instability', 'ground_control', 'Slope failure onto working benches', true],
  ['Uncontrolled release of stored energy', 'isolation', 'Failure to isolate before maintenance', true],
  ['Tailings dam failure', 'environment', 'Loss of containment from tailings storage facility', true],
  ['Explosives misfire and premature detonation', 'explosion', 'Uncontrolled initiation of explosives', true],
  ['Conveyor entanglement', 'lifting', 'Person drawn into moving conveyor components', false],
  ['Working at height on plant structures', 'working_at_height', 'Fall from elevated work platform', false],
  ['Confined space entry into thickener', 'confined_space', 'Asphyxiation or engulfment in confined space', false],
  ['Respirable dust exposure', 'dust', 'Long term exposure leading to pneumoconiosis or silicosis', true],
  ['Noise exposure above 85 dBA', 'noise', 'Noise induced hearing loss', false],
  ['Cyanide exposure in gold room', 'hazardous_substance', 'Acute toxicity from cyanide solution or gas', true],
  ['Heat stress underground', 'heat', 'Heat exhaustion in high wet bulb conditions', false],
  ['Fatigue on extended shift', 'fatigue', 'Impaired decision making and reaction times', true],
  ['Electrical arc flash at substation', 'electrical', 'Arc flash burns during switching', true],
  ['Manual handling of drill rods', 'manual_handling', 'Musculoskeletal injury', false],
  ['Diesel particulate matter underground', 'dust', 'Exposure to diesel exhaust emissions', false],
  ['Hydrogen sulphide in dewatering sumps', 'gas', 'Toxic gas exposure during sump cleaning', false],
  ['Vehicle rollover on haul ramp', 'traffic', 'Loss of control on gradient', true],
  ['Crane and lifting failure', 'lifting', 'Dropped load during lift', false],
  ['Radiation from nuclear density gauges', 'radiation', 'Exposure to sealed radioactive source', false],
  ['Hot work ignition in fuel farm', 'fire', 'Fire or explosion from hot work near flammables', true],
]

const INCIDENT_TITLES: readonly (readonly [string, string])[] = [
  ['Operator struck knee against handrail', 'first_aid'],
  ['Near miss - light vehicle entered haul road without call up', 'near_miss'],
  ['Hydraulic hose burst causing oil spray', 'medical_treatment'],
  ['Fall of ground in development heading', 'high_potential'],
  ['Haul truck tyre fire on ramp', 'fire'],
  ['Diesel spill at refuelling bay', 'environmental'],
  ['Hand laceration during belt splice', 'lost_time_injury'],
  ['Conveyor guard found removed while running', 'near_miss'],
  ['Methane alarm activated in return airway', 'dangerous_occurrence'],
  ['Light vehicle collision in car park', 'vehicle'],
  ['Slip on wet plant walkway', 'medical_treatment'],
  ['Dust exceedance recorded at crusher', 'occupational_illness'],
  ['Excavator boom contacted overhead power line', 'high_potential'],
  ['Uncontrolled release of slurry from pipeline', 'environmental'],
  ['Employee reported heat exhaustion symptoms', 'medical_treatment'],
  ['Misfire discovered during post blast inspection', 'dangerous_occurrence'],
  ['Damage to crusher liner from tramp metal', 'property_damage'],
  ['Back strain lifting drill rods', 'lost_time_injury'],
  ['Unauthorised entry into barricaded area', 'near_miss'],
  ['Fire in workshop welding bay', 'fire'],
  ['Loader bucket dropped during maintenance', 'high_potential'],
  ['Chemical splash to eye in laboratory', 'first_aid'],
  ['Security breach at gold room door', 'security'],
  ['Crushed finger between skid and load', 'restricted_work'],
  ['Ventilation fan failure in section 4', 'process_safety'],
]

export async function seedHse(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx
  const employees = ctx.employees

  // ---- Hazard register ---------------------------------------------------
  const hazardRows: unknown[][] = []
  HAZARD_DEFS.forEach(([title, category, description, principal], i) => {
    const likelihood = rng.int(1, 5)
    const consequence = principal ? rng.int(4, 5) : rng.int(2, 4)
    const rLikelihood = Math.max(1, likelihood - rng.int(1, 2))
    const rConsequence = Math.max(1, consequence - rng.int(0, 1))
    const residual = rLikelihood * rConsequence
    hazardRows.push([
      orgId, rng.pick(ctx.sites).id, rng.bool(0.7) ? rng.pick(ctx.mines).id : null,
      `HAZ-${pad(i + 1, 3)}`, title, description, category, principal,
      likelihood, consequence, likelihood * consequence,
      rLikelihood, rConsequence, residual,
      residual >= 15 ? 'extreme' : residual >= 9 ? 'high' : residual >= 4 ? 'moderate' : 'low',
      rng.pick(['Mine Manager', 'HSE Manager', 'Engineering Manager', 'Plant Manager']),
      isoDate(addDays(today, -rng.int(30, 300))), isoDate(addDays(today, rng.int(-40, 320))),
      rng.weighted([['controlled', 5], ['monitoring', 3], ['open', 2]]),
    ])
  })
  await insertMany(
    db,
    'hazards',
    ['org_id', 'site_id', 'mine_id', 'hazard_code', 'title', 'description', 'category', 'is_principal_hazard', 'likelihood', 'consequence', 'inherent_risk', 'residual_likelihood', 'residual_consequence', 'residual_risk', 'risk_rating', 'owner', 'reviewed_on', 'next_review_on', 'status'],
    hazardRows,
  )
  ctx.hazardIds = HAZARD_DEFS.map((_, i) => i + 1)

  const raRows: unknown[][] = []
  for (let i = 0; i < 160; i++) {
    const assessed = addDays(today, -rng.int(0, 400))
    raRows.push([
      orgId, rng.pick(ctx.sites).id, `RA-${pad(i + 1, 4)}`,
      rng.pick(['Change out of mill liners', 'Conveyor belt splicing', 'Working in the gold room', 'Charging a blast pattern', 'Confined space entry - thickener', 'High voltage switching', 'Recovery of bogged equipment', 'Tailings pipeline repair', 'Shaft inspection', 'Roof bolting cycle']),
      rng.weighted([['jsa', 40], ['take_5', 24], ['issue_based', 14], ['baseline', 8], ['bowtie', 6], ['hazop', 4], ['change_management', 4]]),
      rng.pick(['Maintenance', 'Production', 'Processing', 'Engineering']),
      rng.pick(['Underground level 670', 'Process plant', 'Pit floor', 'Workshop', 'TSF']),
      isoDate(assessed),
      `${rng.pick(['A. Okafor', 'T. Mokoena'])}, ${rng.pick(['crew leaders', 'artisans', 'operators'])}`,
      rng.pick(['A. Okafor', 'HSE Officer', 'Site Engineer']),
      rng.weighted([['low', 3], ['moderate', 4], ['high', 2], ['extreme', 1]]),
      rng.pick(['Mine Manager', 'HSE Manager']),
      isoDate(addDays(assessed, 365)),
      rng.weighted([['approved', 7], ['in_review', 2], ['expired', 1]]),
    ])
  }
  await insertMany(
    db,
    'risk_assessments',
    ['org_id', 'site_id', 'reference', 'title', 'assessment_type', 'activity', 'location', 'assessed_on', 'team', 'facilitator', 'highest_residual_risk', 'approved_by', 'next_review_on', 'status'],
    raRows,
  )

  // ---- Incidents ---------------------------------------------------------
  const incidentRows: unknown[][] = []
  const incidents: { id: number; siteId: number; occurred: Date; type: string }[] = []
  const INCIDENT_COUNT = 340
  for (let i = 0; i < INCIDENT_COUNT; i++) {
    const [title, defaultType] = rng.pick(INCIDENT_TITLES)
    const type = rng.bool(0.7)
      ? defaultType
      : rng.weighted([
          ['near_miss', 44], ['first_aid', 18], ['medical_treatment', 10], ['property_damage', 8],
          ['environmental', 6], ['restricted_work', 4], ['high_potential', 4], ['lost_time_injury', 3],
          ['fire', 2], ['dangerous_occurrence', 1],
        ])
    const mine = rng.pick(ctx.mines)
    const occurred = addHours(today, -rng.num(1, 24 * 400, 1))
    const injuryTypes = ['first_aid', 'medical_treatment', 'restricted_work', 'lost_time_injury', 'fatality']
    const isInjury = injuryTypes.includes(type)
    const daysLost = type === 'lost_time_injury' ? rng.int(1, 46) : 0
    const closed = occurred < addDays(today, -30) ? rng.bool(0.86) : rng.bool(0.3)
    const classification = { near_miss: 'nm', first_aid: 'fai', medical_treatment: 'mti', restricted_work: 'rwi', lost_time_injury: 'lti', fatality: 'fatal', environmental: 'ei', property_damage: 'pd', high_potential: 'hipo' }[type] ?? null
    incidentRows.push([
      orgId, mine.siteId, mine.id,
      (ctx.areasByMine.get(mine.id) ?? []).length ? rng.pick(ctx.areasByMine.get(mine.id)!) : null,
      null, rng.pick(ctx.departmentIds),
      rng.bool(0.4) ? rng.pick(ctx.assets).id : null,
      rng.bool(0.22) ? rng.pick(ctx.contractorIds) : null,
      `INC-${new Date().getUTCFullYear()}-${pad(i + 1, 4)}`,
      occurred.toISOString(), addHours(occurred, rng.num(0.2, 20, 2)).toISOString(),
      type, classification, title,
      `${title}. Reported by shift personnel and attended by the emergency response team where required.`,
      rng.pick(['Level 670 crosscut', 'Pit ramp 3', 'Process plant mill floor', 'Workshop bay 2', 'Haul road km 4', 'ROM pad', 'Fuel farm', 'TSF wall']),
      rng.pick(['Routine operation', 'Maintenance activity', 'Travelling to work area', 'Blast preparation', 'Housekeeping', 'Inspection']),
      rng.bool(0.75) ? rng.pick(ctx.hazardIds) : null,
      isInjury && employees.length ? rng.pick(employees).id : null,
      isInjury ? rng.pick(['Hand', 'Back', 'Knee', 'Eye', 'Shoulder', 'Foot', 'Head', 'Finger']) : null,
      isInjury ? rng.pick(['Laceration', 'Strain', 'Contusion', 'Fracture', 'Burn', 'Foreign body', 'Sprain']) : null,
      daysLost, type === 'restricted_work' ? rng.int(1, 21) : 0,
      rng.weighted([['minor', 30], ['moderate', 34], ['serious', 22], ['major', 11], ['catastrophic', 3]]),
      rng.weighted([['minor', 52], ['moderate', 30], ['serious', 12], ['major', 5], ['catastrophic', 1]]),
      rng.pick(['Inadequate barricading', 'Procedure not followed', 'Equipment defect', 'Poor visibility', 'Rushing to complete task', 'Ineffective isolation', 'Ground conditions deteriorated']),
      closed ? rng.pick(['Risk assessment did not identify the hazard', 'Training gap for the task', 'Supervision inadequate at the time', 'Maintenance strategy did not cover the failure mode', 'Design did not consider maintenance access']) : null,
      closed ? rng.weighted([['icam', 5], ['5_why', 4], ['fishbone', 1], ['taproot', 1]]) : 'none',
      type === 'environmental' ? rng.pick(['Hydrocarbon spill contained within bunded area', 'Sediment release to watercourse', 'Dust exceedance at boundary monitor']) : null,
      type === 'environmental' ? rng.num(20, 4200, 1) : null,
      type === 'property_damage' ? rng.num(2000, 480000, 2) : null,
      ['lost_time_injury', 'fatality', 'dangerous_occurrence', 'high_potential', 'environmental'].includes(type),
      rng.bool(0.3) ? `REG-${rng.int(10000, 99999)}` : null,
      rng.bool(0.3) ? addHours(occurred, rng.num(1, 24, 1)).toISOString() : null,
      rng.pick(['A. Okafor', 'HSE Officer', 'Mine Manager', 'Superintendent']),
      closed ? 'closed' : rng.weighted([['under_investigation', 4], ['actions_pending', 3], ['reported', 2]]),
      closed ? addDays(occurred, rng.int(4, 60)).toISOString() : null,
    ])
    incidents.push({ id: i + 1, siteId: mine.siteId, occurred, type })
  }
  await insertMany(
    db,
    'incidents',
    ['org_id', 'site_id', 'mine_id', 'mining_area_id', 'shift_id', 'department_id', 'asset_id', 'contractor_id', 'incident_no', 'occurred_at', 'reported_at', 'incident_type', 'classification', 'title', 'description', 'location', 'activity', 'hazard_id', 'injured_employee_id', 'body_part', 'injury_nature', 'days_lost', 'restricted_days', 'potential_severity', 'actual_severity', 'immediate_cause', 'root_cause', 'root_cause_method', 'environmental_impact', 'spill_volume_l', 'property_damage_cost', 'reportable_to_regulator', 'regulator_reference', 'regulator_notified_at', 'investigation_lead', 'status', 'closed_at'],
    incidentRows,
  )
  ctx.incidentIds = incidents.map((i) => i.id)

  // ---- Corrective actions -------------------------------------------------
  const actionRows: unknown[][] = []
  let actionSeq = 0
  const ACTION_TEXTS = [
    'Install additional barricading and signage at the location',
    'Revise the standard operating procedure and retrain the crew',
    'Fit engineering guard to eliminate the exposure',
    'Increase inspection frequency and record on the checklist',
    'Update the risk assessment to include the identified hazard',
    'Replace the defective component and review the maintenance strategy',
    'Conduct a toolbox talk across all crews on the learning',
    'Improve lighting and visibility at the work area',
    'Add the task to the permit to work system',
    'Commission an engineering review of the design',
  ]
  const sources: readonly (readonly [string, number])[] = [
    ['incident', 180], ['hse_inspection', 60], ['audit', 50], ['risk_assessment', 30], ['tailings_reading', 12],
  ]
  for (const [entity, count] of sources) {
    for (let i = 0; i < count; i++) {
      actionSeq += 1
      const raised = addDays(today, -rng.int(0, 300))
      const due = addDays(raised, rng.int(7, 90))
      const completed = due < today ? rng.bool(0.72) : rng.bool(0.2)
      actionRows.push([
        orgId, rng.pick(ctx.sites).id, entity,
        entity === 'incident' ? rng.pick(ctx.incidentIds) : rng.int(1, 60),
        `CA-${pad(actionSeq, 5)}`, rng.pick(ACTION_TEXTS),
        rng.weighted([['corrective', 5], ['preventive', 3], ['engineering', 2], ['training', 2], ['administrative', 2]]),
        rng.weighted([['engineering', 3], ['administrative', 4], ['ppe', 2], ['substitution', 1], ['elimination', 1]]),
        employees.length ? rng.pick(employees).id : null, null,
        isoDate(raised), isoDate(due),
        completed ? isoDate(addDays(due, -rng.int(-14, 10))) : null,
        rng.weighted([['critical', 1], ['high', 3], ['medium', 5], ['low', 2]]),
        completed ? rng.weighted([['completed', 6], ['verified', 4]]) : due < today ? 'overdue' : rng.weighted([['open', 5], ['in_progress', 5]]),
        completed ? rng.pick(['Verified in the field by the HSE officer', 'Evidence attached and closed out', 'Confirmed effective at follow up inspection']) : null,
        completed ? rng.weighted([['effective', 7], ['partially_effective', 2], ['not_effective', 1]]) : 'not_assessed',
        rng.bool(0.4) ? rng.num(500, 86000, 2) : null,
      ])
    }
  }
  await insertMany(
    db,
    'corrective_actions',
    ['org_id', 'site_id', 'source_entity', 'source_id', 'action_no', 'description', 'action_type', 'hierarchy_level', 'assigned_to_employee_id', 'assigned_to_name', 'raised_on', 'due_on', 'completed_on', 'priority', 'status', 'verification_notes', 'effectiveness_rating', 'cost'],
    actionRows,
  )

  // ---- Observations, permits, inspections, talks ---------------------------
  const obsRows: unknown[][] = []
  for (let i = 0; i < 1600; i++) {
    const mine = rng.pick(ctx.mines)
    const unsafe = rng.bool(0.62)
    obsRows.push([
      orgId, mine.siteId, mine.id, null, addHours(today, -rng.num(1, 24 * 150, 1)).toISOString(),
      employees.length ? rng.pick(employees).id : null,
      rng.weighted([['behavioural', 40], ['condition', 30], ['positive', 18], ['housekeeping', 8], ['stop_work', 3], ['planned_task', 1]]),
      rng.pick(['Housekeeping', 'PPE compliance', 'Isolation', 'Traffic management', 'Working at height', 'Manual handling', 'Ground support']),
      rng.pick(['Plant walkway', 'Level 580 drive', 'Pit floor', 'Workshop', 'ROM pad', 'Fuel bay']),
      unsafe
        ? rng.pick(['Housekeeping poor around conveyor drive', 'Person not wearing hearing protection in high noise area', 'Vehicle parked without wheel chocks', 'Cable running across walkway', 'Guard not refitted after maintenance', 'Working without a permit'])
        : rng.pick(['Crew conducted a thorough take 5 before starting', 'Excellent housekeeping in the workshop', 'Operator stopped work to report a hazard', 'Correct isolation applied and verified']),
      unsafe,
      unsafe ? rng.pick(['Corrected on the spot', 'Work stopped and area made safe', 'Reported to supervisor']) : null,
      unsafe ? rng.weighted([['low', 5], ['moderate', 3], ['high', 2]]) : 'low',
      rng.weighted([['closed', 7], ['actioned', 2], ['open', 1]]),
    ])
  }
  await insertMany(
    db,
    'safety_observations',
    ['org_id', 'site_id', 'mine_id', 'shift_id', 'observed_at', 'observer_employee_id', 'observation_type', 'category', 'location', 'description', 'is_unsafe', 'immediate_action', 'risk_rating', 'status'],
    obsRows,
  )

  const permitRows: unknown[][] = []
  for (let i = 0; i < 380; i++) {
    const from = addHours(today, -rng.num(-48, 24 * 120, 1))
    const to = addHours(from, rng.num(4, 30, 1))
    const active = from <= today && to >= today
    permitRows.push([
      orgId, rng.pick(ctx.sites).id, `PTW-${pad(i + 1, 5)}`,
      rng.weighted([['hot_work', 22], ['electrical_isolation', 20], ['working_at_height', 16], ['confined_space', 12], ['excavation', 10], ['lifting', 10], ['breaking_containment', 6], ['blasting', 4]]),
      rng.pick(['Weld repair to chute liner', 'Isolate and replace motor', 'Access roof of screen house', 'Entry into thickener for cleaning', 'Excavate for cable route', 'Lift gearbox with mobile crane', 'Open slurry line for repair']),
      rng.pick(['Process plant', 'Underground level 670', 'Workshop', 'Substation 3', 'TSF pipeline']),
      rng.bool(0.6) ? rng.pick(ctx.assets).id : null,
      rng.bool(0.5) ? rng.pick(ctx.workOrderIds) : null,
      rng.bool(0.3) ? rng.pick(ctx.contractorIds) : null,
      employees.length ? rng.pick(employees).id : null,
      employees.length ? rng.pick(employees).id : null,
      from.toISOString(), to.toISOString(),
      `ISO-${rng.int(1000, 9999)}`, rng.bool(0.4),
      rng.bool(0.4) ? `CH4 ${rng.num(0, 0.4, 2)}%, O2 ${rng.num(20.1, 20.9, 1)}%, CO ${rng.int(0, 6)} ppm` : null,
      rng.pick(['Standby person appointed', 'Fire watch appointed', 'Not required']),
      rng.pick(['Area barricaded, fire extinguisher on hand', 'Isolation verified by second person', 'Rescue plan in place', 'Gas testing every 30 minutes']),
      active ? 'active' : to < today ? rng.weighted([['closed', 9], ['expired', 1]]) : rng.weighted([['approved', 6], ['requested', 4]]),
      to < today ? to.toISOString() : null,
      to < today ? rng.pick(['Permit Issuer', 'Shift Supervisor']) : null,
    ])
  }
  await insertMany(
    db,
    'permits_to_work',
    ['org_id', 'site_id', 'permit_no', 'permit_type', 'work_description', 'location', 'asset_id', 'work_order_id', 'contractor_id', 'requested_by_employee_id', 'issued_by_employee_id', 'valid_from', 'valid_to', 'isolation_ref', 'gas_test_required', 'gas_test_result', 'standby_person', 'precautions', 'status', 'closed_at', 'closed_by'],
    permitRows,
  )

  const inspRows: unknown[][] = []
  for (let i = 0; i < 420; i++) {
    const scheduled = addDays(today, -rng.int(-30, 240))
    const performed = scheduled < today && rng.bool(0.86)
    const findings = rng.weighted([[0, 30], [rng.int(1, 3), 40], [rng.int(4, 8), 22], [rng.int(9, 18), 8]])
    inspRows.push([
      orgId, rng.pick(ctx.sites).id, rng.bool(0.6) ? rng.pick(ctx.mines).id : null,
      `INSP-${pad(i + 1, 5)}`,
      rng.weighted([['statutory', 22], ['workplace', 20], ['housekeeping', 14], ['fire_equipment', 12], ['emergency_equipment', 10], ['electrical', 8], ['lifting_gear', 6], ['ventilation', 4], ['contractor', 3], ['management_walkabout', 1]]),
      isoDate(scheduled), performed ? isoDate(scheduled) : null,
      rng.pick(['A. Okafor', 'HSE Officer', 'Statutory Appointee', 'External Inspector']),
      rng.pick(['Process plant', 'Underground section 4', 'Workshop', 'Fuel farm', 'Admin building', 'TSF']),
      performed ? rng.num(58, 99, 1) : null, findings,
      Math.min(findings, rng.weighted([[0, 8], [1, 2]])),
      performed ? (findings === 0 ? 'compliant' : findings > 6 ? 'major_non_conformance' : 'minor_non_conformance') : null,
      performed && findings > 0 ? 'Findings raised as corrective actions and tracked to closure.' : null,
      performed ? 'completed' : scheduled < today ? 'overdue' : 'scheduled',
    ])
  }
  await insertMany(
    db,
    'hse_inspections',
    ['org_id', 'site_id', 'mine_id', 'inspection_no', 'inspection_type', 'scheduled_on', 'performed_on', 'inspector', 'area', 'score_pct', 'findings_count', 'critical_findings', 'result', 'notes', 'status'],
    inspRows,
  )

  const talkRows: unknown[][] = []
  for (let i = 0; i < 900; i++) {
    talkRows.push([
      orgId, rng.pick(ctx.sites).id, null, rng.pick(ctx.crewIds),
      addHours(today, -rng.num(1, 24 * 120, 1)).toISOString(),
      rng.pick(['Working near mobile equipment', 'Hand injury prevention', 'Fatigue management', 'Correct isolation practice', 'Gas testing before entry', 'Dust control on the ramp', 'Hydration in hot conditions', 'Reporting near misses', 'Emergency response refresher', 'Ground support standards']),
      rng.pick(['Shift Supervisor', 'HSE Officer', 'Crew Leader']),
      rng.int(6, 34), rng.int(10, 30),
      'Discussion of recent incidents, review of the task risk and confirmation of controls.',
      rng.bool(0.3) ? rng.pick(['Request for additional lighting', 'Crew raised concern about radio coverage', 'PPE sizing issue reported']) : null,
    ])
  }
  await insertMany(
    db,
    'toolbox_talks',
    ['org_id', 'site_id', 'shift_id', 'crew_id', 'held_at', 'topic', 'presenter', 'attendees_count', 'duration_minutes', 'key_points', 'issues_raised'],
    talkRows,
  )

  const ppeRows: unknown[][] = []
  const PPE_TYPES = ['hard_hat', 'safety_boots', 'overalls', 'gloves', 'eye_protection', 'hearing_protection', 'respirator', 'cap_lamp', 'self_rescuer', 'high_vis', 'gas_detector', 'harness'] as const
  for (const emp of employees) {
    for (const type of rng.sample(PPE_TYPES, rng.int(3, 7))) {
      const issued = addDays(today, -rng.int(5, 700))
      ppeRows.push([
        orgId, emp.id, rng.pick(ctx.itemIds), type, isoDate(issued),
        type === 'gloves' ? rng.int(2, 12) : 1,
        rng.pick(['S', 'M', 'L', 'XL', '2XL', '8', '9', '10', '11']),
        ['cap_lamp', 'self_rescuer', 'gas_detector', 'harness'].includes(type) ? `SN${rng.int(10000, 99999)}` : null,
        isoDate(addDays(issued, rng.int(180, 730))),
        rng.num(14, 940, 2),
        rng.bool(0.15) ? isoDate(addDays(issued, rng.int(120, 600))) : null,
        rng.weighted([['good', 5], ['new', 3], ['fair', 2], ['damaged', 1], ['expired', 1]]),
      ])
    }
  }
  await insertMany(
    db,
    'ppe_issues',
    ['org_id', 'employee_id', 'item_id', 'ppe_type', 'issued_on', 'quantity', 'size', 'serial_no', 'replacement_due', 'cost', 'returned_on', 'condition'],
    ppeRows,
  )

  const drillRows: unknown[][] = []
  for (let i = 0; i < 90; i++) {
    const target = rng.num(12, 45, 1)
    const actual = rng.around(target, 0.3, 1)
    const mine = rng.pick(ctx.mines)
    drillRows.push([
      orgId, mine.siteId, mine.id,
      rng.weighted([['evacuation', 26], ['fire', 18], ['gas_alarm', 14], ['inrush', 10], ['entrapment', 10], ['spill', 8], ['medical', 6], ['tsf_breach', 4], ['full_scale', 4]]),
      addHours(today, -rng.num(24, 24 * 400, 1)).toISOString(),
      rng.int(18, 240), actual, target, rng.int(0, 4),
      actual <= target ? 'satisfactory' : actual <= target * 1.25 ? 'needs_improvement' : 'unsatisfactory',
      rng.pick(['Muster completed, two personnel unaccounted for initially', 'Communication delays on the secondary channel', 'Refuge chamber checks completed successfully', 'Response times within target']),
      rng.pick(['Emergency Response Officer', 'Mine Rescue Captain', 'HSE Manager']),
    ])
  }
  await insertMany(
    db,
    'emergency_drills',
    ['org_id', 'site_id', 'mine_id', 'drill_type', 'held_at', 'participants', 'evacuation_minutes', 'target_minutes', 'refuge_chambers_used', 'outcome', 'observations', 'led_by'],
    drillRows,
  )

  // ---- Environment ---------------------------------------------------------
  const PARAMS: readonly (readonly [string, string, string, number, number])[] = [
    ['surface_water', 'pH', '', 6.5, 8.5],
    ['surface_water', 'Total suspended solids', 'mg/L', 0, 50],
    ['surface_water', 'Sulphate', 'mg/L', 0, 500],
    ['groundwater', 'Electrical conductivity', 'mS/m', 0, 150],
    ['groundwater', 'Arsenic', 'mg/L', 0, 0.01],
    ['discharge', 'Cyanide WAD', 'mg/L', 0, 0.5],
    ['discharge', 'Total dissolved solids', 'mg/L', 0, 1200],
    ['air', 'PM10', 'ug/m3', 0, 75],
    ['air', 'SO2', 'ug/m3', 0, 125],
    ['dust_fallout', 'Dust fallout', 'mg/m2/day', 0, 600],
    ['noise', 'Night time noise', 'dBA', 0, 45],
    ['vibration', 'Peak particle velocity', 'mm/s', 0, 12.5],
    ['rainfall', 'Daily rainfall', 'mm', 0, 999],
  ]
  const envRows: unknown[][] = []
  for (let i = 0; i < 3200; i++) {
    const [medium, parameter, unit, min, limit] = rng.pick(PARAMS)
    const value = rng.bool(0.08) ? rng.num(limit, limit * 1.8, 4) : rng.num(min, limit * 0.92, 4)
    envRows.push([
      orgId, rng.pick(ctx.sites).id, `EM-${pad(rng.int(1, 26), 2)}`, medium,
      addHours(today, -rng.num(1, 24 * 300, 1)).toISOString(), parameter, value, unit,
      parameter === 'Daily rainfall' ? null : limit,
      parameter === 'Daily rainfall' ? null : value <= limit,
      rng.pick(['Grab sample', 'Composite', 'Continuous monitor', 'Passive sampler']),
      rng.pick(['Site Laboratory', 'SGS', 'Bureau Veritas']),
      rng.num(-30, -12, 6), rng.num(20, 130, 6),
      null,
    ])
  }
  await insertMany(
    db,
    'environmental_monitoring',
    ['org_id', 'site_id', 'station_code', 'medium', 'measured_at', 'parameter', 'value', 'unit', 'limit_value', 'compliant', 'method', 'laboratory', 'latitude', 'longitude', 'notes'],
    envRows,
  )

  const rehabRows: unknown[][] = []
  let rehabId = 0
  for (const site of ctx.sites) {
    for (let i = 0; i < 5; i++) {
      rehabId += 1
      const disturbed = rng.num(12, 260, 2)
      const rehabbed = Math.round(disturbed * rng.num(0, 0.92, 3) * 100) / 100
      rehabRows.push([
        orgId, site.id, rng.bool(0.7) ? rng.pick(ctx.mines).id : null,
        `REH-${site.code}-${i + 1}`, `${site.code} rehabilitation area ${i + 1}`,
        disturbed, rehabbed,
        rng.weighted([['revegetation', 4], ['reshaping', 3], ['topsoil', 2], ['capping', 2], ['backfill', 1], ['water_treatment', 1]]),
        isoDate(addDays(today, -rng.int(100, 1400))),
        rehabbed >= disturbed * 0.9 ? isoDate(addDays(today, -rng.int(10, 200))) : null,
        rng.num(400000, 9800000, 2), rng.num(50000, 6400000, 2), rng.num(12, 96, 1),
        rehabbed >= disturbed * 0.9 ? rng.weighted([['signed_off', 3], ['monitoring', 2]]) : rng.weighted([['in_progress', 5], ['planned', 2], ['failed', 1]]),
      ])
    }
  }
  await insertMany(
    db,
    'rehabilitation_areas',
    ['org_id', 'site_id', 'mine_id', 'code', 'name', 'disturbed_hectares', 'rehabilitated_hectares', 'rehab_type', 'started_on', 'completed_on', 'provision_cost', 'spend_to_date', 'vegetation_cover_pct', 'status'],
    rehabRows,
  )

  const wasteRows: unknown[][] = []
  const energyRows: unknown[][] = []
  const waterRows: unknown[][] = []
  for (const site of ctx.sites) {
    for (let d = 0; d < 180; d++) {
      const date = isoDate(addDays(today, -d))
      if (rng.bool(0.5)) {
        wasteRows.push([
          orgId, site.id, date,
          rng.weighted([['general', 30], ['scrap_metal', 20], ['used_oil', 16], ['hazardous', 12], ['tyres', 8], ['recyclable', 8], ['batteries', 3], ['medical', 2], ['e_waste', 1]]),
          rng.num(0.4, 64, 3), 't',
          rng.weighted([['recycled', 4], ['landfill', 4], ['treated', 1], ['reused', 1]]),
          rng.pick(ctx.contractorIds), `MAN-${rng.int(10000, 99999)}`, rng.num(120, 9800, 2),
        ])
      }
      for (const source of ['grid', 'diesel_generator', 'solar'] as const) {
        const kwh = source === 'grid' ? rng.num(180000, 640000, 1) : source === 'solar' ? rng.num(4000, 42000, 1) : rng.num(2000, 38000, 1)
        energyRows.push([
          orgId, site.id, date, source, kwh,
          Math.round(kwh / 24), Math.round(kwh * rng.num(0.06, 0.18, 4) * 100) / 100,
          Math.round(kwh * (source === 'solar' ? 0 : source === 'grid' ? 0.00095 : 0.00072) * 1000) / 1000,
          source === 'grid' ? 'scope_2' : source === 'solar' ? 'scope_2' : 'scope_1',
          null,
        ])
      }
      const abstraction = rng.num(1200, 9800, 1)
      waterRows.push([
        orgId, site.id, date, abstraction, rng.weighted([[0, 6], [rng.num(0.2, 68, 1), 4]]),
        rng.num(3000, 24000, 1), rng.num(0, 2400, 1), rng.num(200, 3800, 1),
        rng.num(2000, 16000, 1), rng.num(300, 3200, 1), rng.num(40, 420, 1),
        rng.num(80000, 940000, 1), 4200000,
      ])
    }
  }
  await insertMany(
    db,
    'waste_records',
    ['org_id', 'site_id', 'record_date', 'waste_stream', 'quantity', 'unit', 'disposal_method', 'contractor_id', 'manifest_no', 'cost'],
    wasteRows,
  )
  await insertMany(
    db,
    'energy_records',
    ['org_id', 'site_id', 'record_date', 'source', 'consumption_kwh', 'demand_kw', 'cost', 'co2e_tonnes', 'scope', 'notes'],
    energyRows,
  )
  await insertMany(
    db,
    'water_balance',
    ['org_id', 'site_id', 'record_date', 'abstraction_m3', 'rainfall_mm', 'recycled_m3', 'discharged_m3', 'evaporation_m3', 'process_use_m3', 'dust_suppression_m3', 'potable_m3', 'storage_m3', 'licence_limit_m3'],
    waterRows,
  )

  const communityRows: unknown[][] = []
  for (let i = 0; i < 220; i++) {
    const occurred = addDays(today, -rng.int(0, 500))
    const type = rng.weighted([
      ['meeting', 26], ['grievance', 22], ['local_employment', 14], ['donation', 10],
      ['local_procurement', 10], ['project', 8], ['consultation', 6], ['compensation', 3], ['training', 1],
    ])
    const resolved = rng.bool(0.72)
    communityRows.push([
      orgId, rng.pick(ctx.sites).id, `COM-${pad(i + 1, 4)}`, type, isoDate(occurred),
      rng.pick(['Village council', 'Local chief', 'Farmers association', 'Youth forum', 'District municipality', 'NGO representative']),
      rng.pick(['Kwena Village', 'Riverside Settlement', 'Marikana Ward 4', 'Cerro Alto', 'Kamba East']),
      type === 'grievance'
        ? rng.pick(['Dust from haul road affecting homes', 'Blast vibration cracking walls', 'Water quality concerns downstream', 'Noise from night shift operations', 'Delay in local employment commitments'])
        : rng.pick(['Quarterly stakeholder meeting held', 'Borehole rehabilitation funded', 'Local supplier development workshop', 'Scholarship programme intake', 'Road maintenance support provided']),
      rng.pick(['Dust suppression schedule increased', 'Independent vibration monitoring installed', 'Quarterly water results shared publicly', 'Local recruitment target agreed', null]),
      ['donation', 'project', 'compensation', 'local_procurement'].includes(type) ? rng.num(4000, 480000, 2) : null,
      rng.int(20, 3200),
      resolved ? rng.weighted([['resolved', 6], ['closed', 4]]) : rng.weighted([['open', 4], ['in_progress', 4], ['escalated', 2]]),
      resolved ? rng.pick(['Agreement reached with the community', 'Mitigation implemented and verified', 'Compensation paid in full']) : null,
      resolved ? isoDate(addDays(occurred, rng.int(10, 120))) : null,
      rng.pick(['Community Relations Officer', 'Site Manager', 'Sustainability Lead']),
    ])
  }
  await insertMany(
    db,
    'community_engagements',
    ['org_id', 'site_id', 'reference', 'engagement_type', 'occurred_on', 'stakeholder', 'community', 'description', 'commitment', 'amount', 'beneficiaries', 'status', 'resolution', 'closed_on', 'owner'],
    communityRows,
  )
}

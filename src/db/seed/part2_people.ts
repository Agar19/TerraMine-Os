import { insertMany, pad } from './helpers'
import { addDays, addHours, isoDate } from './rng'
import type { EmployeeSeed, SeedContext } from './context'
import { FIRST_NAMES, JOB_TITLES, LAST_NAMES } from './names'

const EMPLOYEE_COUNT = 320

const SHIFT_PATTERNS: readonly (readonly [string, string, number, number, number, string])[] = [
  ['4X4-12', 'Four on four off, 12 hour', 8, 12, 2, 'rotating'],
  ['5-2-DAY', 'Five day week, day shift', 7, 9, 1, 'day_only'],
  ['CONT-8', 'Continental three shift', 7, 8, 3, 'continental'],
  ['FIFO-14', 'Fly in fly out, 14/7', 21, 12, 2, 'fly_in_fly_out'],
]

const COMPETENCIES: readonly (readonly [string, string, string, number, boolean])[] = [
  ['IND-GEN', 'General Site Induction', 'induction', 12, true],
  ['IND-UG', 'Underground Induction', 'induction', 12, true],
  ['MED-FIT', 'Medical Fitness Certificate', 'medical', 12, true],
  ['FA-L2', 'First Aid Level 2', 'first_aid', 24, false],
  ['FIRE-BASIC', 'Basic Fire Fighting', 'safety', 24, false],
  ['WAH', 'Working at Heights', 'safety', 24, false],
  ['CONF-SPACE', 'Confined Space Entry', 'safety', 24, false],
  ['LOTO', 'Lockout Tagout Isolation', 'safety', 24, true],
  ['HAZ-ID', 'Hazard Identification and Risk Assessment', 'safety', 24, true],
  ['BLAST-LIC', 'Blasting Licence', 'licence', 24, false],
  ['SHOT-CERT', 'Shotfirer Certificate of Competency', 'statutory', 36, false],
  ['MINE-OVER', 'Mine Overseer Certificate', 'statutory', 60, false],
  ['GAS-TEST', 'Gas Testing Certificate', 'statutory', 12, false],
  ['VENT-OFF', 'Ventilation Officer Certificate', 'statutory', 60, false],
  ['HT-OP', 'Haul Truck Operator Licence', 'operator', 36, false],
  ['EX-OP', 'Excavator Operator Licence', 'operator', 36, false],
  ['DOZ-OP', 'Dozer Operator Licence', 'operator', 36, false],
  ['LHD-OP', 'LHD Operator Licence', 'operator', 36, false],
  ['CM-OP', 'Continuous Miner Operator Licence', 'operator', 36, false],
  ['CRANE-OP', 'Crane and Rigging Licence', 'operator', 24, false],
  ['FORK-OP', 'Forklift Licence', 'operator', 36, false],
  ['LV-DRIVE', 'Light Vehicle Site Permit', 'licence', 36, true],
  ['TRADE-MECH', 'Diesel Mechanic Trade Certificate', 'trade', 0, false],
  ['TRADE-ELEC', 'Electrical Trade Certificate', 'trade', 0, false],
  ['HV-SWITCH', 'High Voltage Switching Authority', 'statutory', 24, false],
]

const COURSES: readonly (readonly [string, string, string, number, string, number, number])[] = [
  ['C-IND', 'General Site Induction', 'Internal Training', 8, 'classroom', 1, 120],
  ['C-UGIND', 'Underground Induction', 'Internal Training', 16, 'classroom', 2, 240],
  ['C-FA2', 'First Aid Level 2', 'St John Training', 16, 'classroom', 4, 380],
  ['C-FIRE', 'Basic Fire Fighting', 'Fire Safety Institute', 8, 'on_the_job', 5, 210],
  ['C-WAH', 'Working at Heights', 'Height Safety Co', 8, 'on_the_job', 6, 260],
  ['C-CONF', 'Confined Space Entry and Rescue', 'Rescue Training SA', 16, 'on_the_job', 7, 540],
  ['C-LOTO', 'Isolation and Lockout', 'Internal Training', 4, 'classroom', 8, 90],
  ['C-HIRA', 'Hazard Identification and Risk Assessment', 'Internal Training', 8, 'classroom', 9, 150],
  ['C-BLAST', 'Blasting Licence Preparation', 'Mining Qualifications Authority', 80, 'external', 10, 2400],
  ['C-SHOT', 'Shotfirer Certificate', 'Mining Qualifications Authority', 120, 'external', 11, 3800],
  ['C-GAS', 'Gas Testing and Interpretation', 'Internal Training', 16, 'simulator', 13, 320],
  ['C-HT', 'Haul Truck Operation', 'Internal Training', 40, 'simulator', 15, 1450],
  ['C-EX', 'Excavator Operation', 'Internal Training', 40, 'simulator', 16, 1450],
  ['C-LHD', 'LHD Operation Underground', 'Internal Training', 40, 'simulator', 18, 1680],
  ['C-CM', 'Continuous Miner Operation', 'OEM Training', 60, 'external', 19, 2900],
  ['C-CRANE', 'Crane and Rigging', 'Lifting Institute', 24, 'external', 20, 890],
  ['C-FORK', 'Forklift Operation', 'Internal Training', 8, 'on_the_job', 21, 180],
  ['C-LV', 'Light Vehicle Site Driving', 'Internal Training', 4, 'on_the_job', 22, 95],
  ['C-HV', 'High Voltage Switching', 'Electrical Institute', 40, 'external', 25, 2100],
  ['C-SUP', 'Frontline Supervisor Development', 'Leadership Partners', 60, 'classroom', null as unknown as number, 3200],
]

export async function seedPeople(ctx: SeedContext): Promise<void> {
  const { db, rng, today, orgId } = ctx
  const deptPerSite = ctx.departmentIds.length / ctx.sites.length

  await insertMany(
    db,
    'shift_patterns',
    ['org_id', 'code', 'name', 'cycle_days', 'shift_hours', 'shifts_per_day', 'rotation', 'description'],
    SHIFT_PATTERNS.map(([code, name, cycle, hours, per, rotation]) => [
      orgId, code, name, cycle, hours, per, rotation,
      `${hours} hour shifts on a ${cycle} day cycle (${rotation.replace(/_/g, ' ')}).`,
    ]),
  )

  // ---- Employees -----------------------------------------------------
  const employees: EmployeeSeed[] = []
  const empRows: unknown[][] = []
  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const siteId = rng.weighted([[1, 3], [2, 4], [3, 5], [4, 2]])
    const [title, group, location] = rng.weighted(
      JOB_TITLES.map((jt) => [jt, jt[1] === 'operator' || jt[1] === 'artisan' ? 4 : 1] as const),
    )
    const first = rng.pick(FIRST_NAMES)
    const last = rng.pick(LAST_NAMES)
    const contractorId = rng.bool(0.18) ? rng.pick(ctx.contractorIds) : null
    const deptOffset = { management: 0, professional: 0, supervisor: 0, operator: 0, artisan: 2, administration: 9, labourer: 0, apprentice: 2 }[group] ?? 0
    const departmentId = (siteId - 1) * deptPerSite + 1 + ((deptOffset + rng.int(0, 3)) % deptPerSite)
    const baseRate = { management: 96, professional: 62, supervisor: 48, artisan: 38, operator: 29, administration: 24, labourer: 17, apprentice: 14 }[group] ?? 25
    const rate = rng.around(baseRate, 0.18, 2)
    const status = rng.weighted([['active', 88], ['on_leave', 6], ['medical_hold', 2], ['suspended', 1], ['terminated', 3]])
    const hired = addDays(today, -rng.int(60, 4200))
    empRows.push([
      orgId, siteId, departmentId, contractorId, `E${pad(1000 + i, 5)}`, first, last,
      `${rng.int(60, 99)}${rng.int(10, 99)}${rng.int(10, 28)}${rng.int(1000, 9999)}`,
      rng.weighted([['male', 62], ['female', 36], ['other', 1], ['undisclosed', 1]]),
      isoDate(addDays(today, -rng.int(7600, 21000))),
      rng.pick(['South Africa', 'Australia', 'Peru', 'Zambia', 'Philippines', 'India', 'Ghana']),
      `+${rng.int(20, 61)} ${rng.int(60, 89)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      `${first.toLowerCase()}.${last.toLowerCase()}${i}@aurelia.com`,
      `${rng.pick(FIRST_NAMES)} ${last}`,
      `+${rng.int(20, 61)} ${rng.int(60, 89)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      title, group,
      contractorId ? 'contractor' : rng.weighted([['permanent', 8], ['fixed_term', 2], ['casual', 1], ['apprentice', 1]]),
      location, isoDate(hired),
      status === 'terminated' ? isoDate(addDays(today, -rng.int(1, 200))) : null,
      status, rate, Math.round(rate * 173), 'USD',
      `****${rng.int(1000, 9999)}`, `TX${rng.int(100000, 999999)}`,
      null, rng.pick(['O+', 'A+', 'B+', 'AB+', 'O-', 'A-']),
    ])
    employees.push({
      id: i + 1, siteId, name: `${first} ${last}`, title, group, location,
      underground: location === 'underground' || (location === 'mixed' && rng.bool(0.4)),
      contractorId, rate,
    })
  }
  await insertMany(
    db,
    'employees',
    ['org_id', 'site_id', 'department_id', 'contractor_id', 'employee_no', 'first_name', 'last_name', 'national_id', 'gender', 'date_of_birth', 'nationality', 'phone', 'email', 'emergency_contact_name', 'emergency_contact_phone', 'job_title', 'occupation_group', 'employment_type', 'work_location', 'hired_on', 'terminated_on', 'status', 'hourly_rate', 'monthly_salary', 'currency', 'bank_account', 'tax_number', 'photo_url', 'blood_type'],
    empRows,
  )
  ctx.employees = employees

  const activeEmployees = employees.filter((_, i) => empRows[i][21] === 'active')
  const supervisors = employees.filter((e) => e.group === 'supervisor' || e.group === 'management')

  // ---- Crews ---------------------------------------------------------
  const crewRows: unknown[][] = []
  const crewIds: number[] = []
  let crewId = 0
  for (const mine of ctx.mines) {
    for (const letter of ['A', 'B', 'C', 'D']) {
      crewRows.push([
        orgId, mine.siteId, mine.id, rng.int(1, 4), `${mine.code}-${letter}`,
        `${mine.name} Crew ${letter}`, 'mining',
        supervisors.length > 0 ? rng.pick(supervisors).id : null,
        rng.int(14, 32), true,
      ])
      crewIds.push(++crewId)
    }
  }
  await insertMany(
    db,
    'crews',
    ['org_id', 'site_id', 'mine_id', 'shift_pattern_id', 'code', 'name', 'discipline', 'supervisor_employee_id', 'headcount_target', 'active'],
    crewRows,
  )
  ctx.crewIds = crewIds

  const memberRows: unknown[][] = []
  for (const id of crewIds) {
    for (const emp of rng.sample(activeEmployees, rng.int(10, 18))) {
      memberRows.push([orgId, id, emp.id, emp.title, isoDate(addDays(today, -rng.int(30, 900))), null])
    }
  }
  await insertMany(db, 'crew_members', ['org_id', 'crew_id', 'employee_id', 'role_in_crew', 'joined_on', 'left_on'], memberRows)

  // ---- Shifts --------------------------------------------------------
  const shiftRows: unknown[][] = []
  const shiftIndex = new Map<string, number>()
  const shiftIds: number[] = []
  let shiftId = 0
  for (let d = ctx.historyDays; d >= 0; d--) {
    const date = addDays(today, -d)
    const dateStr = isoDate(date)
    for (const mine of ctx.mines) {
      const mineCrews = crewIds.filter((_, i) => Math.floor(i / 4) === mine.id - 1)
      for (const [idx, type] of (['day', 'night'] as const).entries()) {
        const start = addHours(date, idx === 0 ? 6 : 18)
        const planned = rng.int(22, 46)
        shiftRows.push([
          orgId, mine.siteId, mine.id, mineCrews[(d + idx) % mineCrews.length], dateStr, type,
          start.toISOString(), addHours(start, 12).toISOString(),
          supervisors.length > 0 ? rng.pick(supervisors).id : null,
          planned, Math.max(12, planned - rng.int(0, 7)),
          d === 0 ? 'in_progress' : 'signed_off',
          rng.bool(0.35)
            ? rng.pick([
                'Handover complete. Two units down for scheduled service.',
                'Ramp watered ahead of night shift. No outstanding hazards.',
                'Ventilation door repaired on level 670. Gas readings normal.',
                'Crusher tripped twice on tramp metal, magnet cleaned.',
                'Late start due to blasting clearance, 45 minutes lost.',
              ])
            : null,
          rng.weighted([['clear', 6], ['overcast', 3], ['rain', 2], ['storm', 1], ['dust', 1], ['fog', 1]]),
        ])
        shiftIndex.set(`${mine.id}|${dateStr}|${type}`, ++shiftId)
        shiftIds.push(shiftId)
      }
    }
  }
  await insertMany(
    db,
    'shifts',
    ['org_id', 'site_id', 'mine_id', 'crew_id', 'shift_date', 'shift_type', 'starts_at', 'ends_at', 'supervisor_employee_id', 'planned_headcount', 'actual_headcount', 'status', 'handover_notes', 'weather'],
    shiftRows,
  )
  ctx.shiftIndex = shiftIndex
  ctx.shiftIds = shiftIds

  // ---- Attendance (last 30 days) -------------------------------------
  const attRows: unknown[][] = []
  for (let d = 30; d >= 0; d--) {
    const date = addDays(today, -d)
    const dateStr = isoDate(date)
    for (const emp of activeEmployees) {
      if (rng.bool(0.28)) continue // rostered off
      const status = rng.weighted([
        ['present', 88], ['absent', 3], ['late', 3], ['leave', 3], ['sick', 2], ['training', 1],
      ])
      const worked = status === 'present' || status === 'late'
      const hours = worked ? rng.num(7.5, 12.5, 2) : 0
      const clockIn = addHours(date, 6 + (rng.bool(0.5) ? 0 : 12) + (status === 'late' ? rng.num(0.3, 2, 2) : 0))
      attRows.push([
        orgId, emp.id, null, dateStr,
        worked ? clockIn.toISOString() : null,
        worked ? addHours(clockIn, hours).toISOString() : null,
        hours, worked && hours > 12 ? rng.num(0.5, 2.5, 2) : 0,
        status, status === 'absent' ? rng.pick(['Unauthorised', 'Family responsibility', 'Transport failure']) : null,
        worked ? rng.weighted([['passed', 96], ['failed', 2], ['not_required', 2]]) : 'not_required',
        worked ? rng.weighted([['pass', 97], ['not_tested', 2], ['fail', 1]]) : 'not_tested',
      ])
    }
  }
  await insertMany(
    db,
    'attendance',
    ['org_id', 'employee_id', 'shift_id', 'work_date', 'clock_in', 'clock_out', 'hours_worked', 'overtime_hours', 'status', 'absence_reason', 'fitness_check', 'alcohol_test'],
    attRows,
  )

  // ---- Tag board -----------------------------------------------------
  const ugMines = ctx.mines.filter((m) => m.mineType === 'underground')
  const posRows: unknown[][] = []
  const ugEmployees = activeEmployees.filter((e) => e.underground)
  for (const emp of rng.sample(ugEmployees, Math.min(58, ugEmployees.length))) {
    const mine = rng.pick(ugMines)
    posRows.push([
      orgId, mine.siteId, mine.id, emp.id, null, `T${pad(emp.id, 4)}`, `L${pad(emp.id, 4)}`,
      `SR${rng.int(1000, 9999)}`, addHours(today, -rng.num(0.5, 9, 2)).toISOString(), null,
      `Level ${rng.pick([490, 580, 670, 760, 850])} ${rng.pick(['stope', 'drive', 'crosscut', 'workshop', 'pump station'])}`,
      rng.pick(['Production', 'Development', 'Maintenance', 'Inspection', 'Survey']), null,
    ])
  }
  for (let i = 0; i < 420; i++) {
    const emp = rng.pick(ugEmployees.length > 0 ? ugEmployees : activeEmployees)
    const mine = rng.pick(ugMines)
    const entered = addHours(today, -rng.num(12, 720, 1))
    posRows.push([
      orgId, mine.siteId, mine.id, emp.id, null, `T${pad(emp.id, 4)}`, `L${pad(emp.id, 4)}`,
      `SR${rng.int(1000, 9999)}`, entered.toISOString(), addHours(entered, rng.num(4, 11.5, 2)).toISOString(),
      `Level ${rng.pick([490, 580, 670, 760, 850])}`, 'Production', null,
    ])
  }
  await insertMany(
    db,
    'personnel_on_site',
    ['org_id', 'site_id', 'mine_id', 'employee_id', 'visitor_name', 'tag_number', 'lamp_number', 'self_rescuer_no', 'entered_at', 'exited_at', 'location', 'purpose', 'escorted_by_employee_id'],
    posRows,
  )

  // ---- Competencies and training -------------------------------------
  await insertMany(
    db,
    'competencies',
    ['org_id', 'code', 'name', 'category', 'validity_months', 'is_mandatory', 'applies_to'],
    COMPETENCIES.map(([code, name, category, months, mandatory]) => [
      orgId, code, name, category, months === 0 ? null : months, mandatory,
      mandatory ? 'All personnel' : 'Role specific',
    ]),
  )

  const ecRows: unknown[][] = []
  COMPETENCIES.forEach(([, , , months, mandatory], ci) => {
    const holders = mandatory ? activeEmployees : rng.sample(activeEmployees, rng.int(30, 110))
    for (const emp of holders) {
      const achieved = addDays(today, -rng.int(30, 1400))
      const expires = months ? addDays(achieved, months * 30) : null
      const daysToExpiry = expires ? Math.round((expires.getTime() - today.getTime()) / 86400000) : 9999
      ecRows.push([
        orgId, emp.id, ci + 1, isoDate(achieved), expires ? isoDate(expires) : null,
        `CERT-${rng.int(100000, 999999)}`, rng.pick(['Internal Training', 'MQA Assessor', 'External Provider']),
        daysToExpiry < 0 ? 'expired' : daysToExpiry < 30 ? 'expiring' : 'valid',
      ])
    }
  })
  await insertMany(
    db,
    'employee_competencies',
    ['org_id', 'employee_id', 'competency_id', 'achieved_on', 'expires_on', 'certificate_no', 'assessor', 'status'],
    ecRows,
  )

  await insertMany(
    db,
    'training_courses',
    ['org_id', 'code', 'name', 'provider', 'duration_hours', 'delivery', 'competency_id', 'cost_per_person', 'active'],
    COURSES.map(([code, name, provider, hours, delivery, compId, cost]) => [
      orgId, code, name, provider, hours, delivery, compId ?? null, cost, true,
    ]),
  )

  const trRows: unknown[][] = []
  for (let i = 0; i < 720; i++) {
    const emp = rng.pick(activeEmployees)
    const courseIdx = rng.int(0, COURSES.length - 1)
    const scheduled = addDays(today, rng.int(-400, 45))
    const future = scheduled > today
    const result = future ? 'scheduled' : rng.weighted([['pass', 86], ['fail', 6], ['no_show', 5], ['incomplete', 3]])
    trRows.push([
      orgId, emp.id, courseIdx + 1, isoDate(scheduled),
      future || result === 'no_show' ? null : isoDate(scheduled),
      future ? null : rng.num(45, 99, 1), result,
      rng.pick(['A. Steyn', 'M. Ncube', 'External Assessor', 'P. Reyes']),
      COURSES[courseIdx][6], null,
    ])
  }
  await insertMany(
    db,
    'training_records',
    ['org_id', 'employee_id', 'course_id', 'scheduled_on', 'completed_on', 'score', 'result', 'trainer', 'cost', 'notes'],
    trRows,
  )

  // ---- Leave, medicals, employee relations ---------------------------
  const leaveRows: unknown[][] = []
  for (let i = 0; i < 280; i++) {
    const emp = rng.pick(activeEmployees)
    const start = addDays(today, rng.int(-220, 70))
    const days = rng.int(1, 18)
    leaveRows.push([
      orgId, emp.id,
      rng.weighted([['annual', 45], ['sick', 22], ['rostered_off', 12], ['compassionate', 6], ['unpaid', 5], ['maternity', 4], ['paternity', 3], ['injury', 3]]),
      isoDate(start), isoDate(addDays(start, days - 1)), days,
      rng.pick(['Family commitment', 'Annual break', 'Medical', 'Study', null]),
      start > today ? rng.weighted([['pending', 4], ['approved', 6]]) : rng.weighted([['taken', 8], ['approved', 1], ['rejected', 1]]),
      rng.pick(['T. Mokoena', 'L. Dlamini', 'N. Ncube']),
      addDays(start, -rng.int(3, 20)).toISOString(),
    ])
  }
  await insertMany(
    db,
    'leave_requests',
    ['org_id', 'employee_id', 'leave_type', 'start_date', 'end_date', 'days', 'reason', 'status', 'approved_by', 'approved_at'],
    leaveRows,
  )

  const medRows: unknown[][] = []
  for (const emp of activeEmployees) {
    const count = rng.int(1, 3)
    for (let k = 0; k < count; k++) {
      const examDate = addDays(today, -rng.int(10, 900))
      const type = rng.weighted([
        ['periodic', 50], ['pre_employment', 12], ['audiometric', 14], ['spirometry', 10],
        ['chest_xray', 6], ['return_to_work', 5], ['drug_alcohol', 3],
      ])
      medRows.push([
        orgId, emp.id, type, isoDate(examDate), isoDate(addDays(examDate, 365)),
        rng.pick(['Site Occupational Health Centre', 'Regional Medical Practice', 'Mobile Clinic']),
        rng.weighted([['fit', 86], ['fit_with_restrictions', 8], ['temporarily_unfit', 4], ['unfit', 1], ['pending', 1]]),
        rng.bool(0.1) ? rng.pick(['No underground work', 'No heavy lifting', 'Day shift only']) : null,
        type === 'audiometric' ? rng.num(0, 42, 1) : null,
        type === 'spirometry' ? rng.num(68, 108, 1) : null,
        null,
      ])
    }
  }
  await insertMany(
    db,
    'medical_examinations',
    ['org_id', 'employee_id', 'exam_type', 'exam_date', 'next_due_on', 'provider', 'outcome', 'restrictions', 'hearing_loss_db', 'lung_function_pct', 'confidential_notes'],
    medRows,
  )

  const erRows: unknown[][] = []
  for (let i = 0; i < 46; i++) {
    const opened = addDays(today, -rng.int(5, 500))
    const closed = rng.bool(0.65)
    erRows.push([
      orgId, rng.pick(activeEmployees).id, `ER-${new Date().getUTCFullYear()}-${pad(i + 1, 3)}`,
      rng.weighted([['disciplinary', 40], ['grievance', 25], ['performance', 15], ['union', 10], ['harassment', 6], ['appeal', 4]]),
      isoDate(opened), closed ? isoDate(addDays(opened, rng.int(7, 90))) : null,
      rng.weighted([['low', 5], ['medium', 3], ['high', 2]]),
      rng.pick([
        'Failure to follow isolation procedure',
        'Absenteeism without notification',
        'Dispute over shift allowance calculation',
        'Alleged unfair treatment in overtime allocation',
        'Damage to light vehicle - speeding on haul road',
        'Grievance regarding accommodation standards',
      ]),
      closed ? rng.pick(['Written warning issued', 'Case dismissed', 'Settled by agreement', 'Final written warning', 'Retraining completed']) : null,
      closed ? 'closed' : rng.weighted([['open', 3], ['investigating', 4], ['hearing', 2], ['escalated', 1]]),
      rng.pick(['N. Ncube', 'HR Business Partner', 'Site HR Manager']),
    ])
  }
  await insertMany(
    db,
    'employee_relations_cases',
    ['org_id', 'employee_id', 'case_number', 'case_type', 'opened_on', 'closed_on', 'severity', 'summary', 'outcome', 'status', 'handled_by'],
    erRows,
  )

  // ---- Payroll -------------------------------------------------------
  const periodRows: unknown[][] = []
  const periodCount = 6
  for (let p = periodCount - 1; p >= 0; p--) {
    const end = addDays(today, -p * 30)
    const start = addDays(end, -29)
    periodRows.push([
      orgId, null, `PAY-${isoDate(start).slice(0, 7)}`, isoDate(start), isoDate(end),
      isoDate(addDays(end, 5)), p === 0 ? 'open' : 'paid', null, null, null, 'USD',
    ])
  }
  await insertMany(
    db,
    'payroll_periods',
    ['org_id', 'site_id', 'code', 'period_start', 'period_end', 'pay_date', 'status', 'gross_total', 'deductions_total', 'net_total', 'currency'],
    periodRows,
  )

  const lineRows: unknown[][] = []
  for (let p = 1; p <= periodCount; p++) {
    for (const emp of activeEmployees) {
      const normal = rng.num(140, 190, 1)
      const ot = rng.num(0, 46, 1)
      const base = Math.round(normal * emp.rate * 100) / 100
      const otPay = Math.round(ot * emp.rate * 1.5 * 100) / 100
      const prodBonus = rng.bool(0.5) ? rng.num(50, 620, 2) : 0
      const safetyBonus = rng.bool(0.35) ? rng.num(40, 260, 2) : 0
      const ugAllow = emp.underground ? rng.num(120, 480, 2) : 0
      const other = rng.num(0, 220, 2)
      const gross = Math.round((base + otPay + prodBonus + safetyBonus + ugAllow + other) * 100) / 100
      const tax = Math.round(gross * rng.num(0.14, 0.31, 4) * 100) / 100
      const pension = Math.round(gross * 0.075 * 100) / 100
      const otherDed = rng.num(0, 180, 2)
      lineRows.push([
        orgId, p, emp.id, normal, ot, base, otPay, prodBonus, safetyBonus, ugAllow, other,
        gross, tax, pension, otherDed, Math.round((gross - tax - pension - otherDed) * 100) / 100,
      ])
    }
  }
  await insertMany(
    db,
    'payroll_lines',
    ['org_id', 'period_id', 'employee_id', 'normal_hours', 'overtime_hours', 'base_pay', 'overtime_pay', 'production_bonus', 'safety_bonus', 'underground_allowance', 'other_allowances', 'gross_pay', 'tax', 'pension', 'other_deductions', 'net_pay'],
    lineRows,
  )
  await db.query(`
    update payroll_periods p set
      gross_total = t.gross, deductions_total = t.ded, net_total = t.net
    from (
      select period_id, sum(gross_pay) gross, sum(tax + pension + other_deductions) ded, sum(net_pay) net
      from payroll_lines group by period_id
    ) t where t.period_id = p.id
  `)
}

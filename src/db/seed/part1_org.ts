import { insertMany } from './helpers'
import { isoDate, addDays } from './rng'
import type { SeedContext } from './context'
import { CONTRACTOR_NAMES } from './names'

const SITES = [
  ['SDG', 'Sundowner Gold Operations', 'Australia', 'Western Australia', -30.749, 121.466, 380],
  ['BRC', 'Blackridge Coal Complex', 'South Africa', 'Mpumalanga', -26.05, 29.21, 1580],
  ['CVA', 'Cerro Verde Andes Copper', 'Peru', 'Arequipa', -16.53, -71.59, 2680],
  ['KMB', 'Kamba Iron and Manganese', 'Zambia', 'Copperbelt', -12.82, 28.21, 1240],
] as const

const MINES: readonly (readonly [
  number, string, string, string, string, number, number, number, string, number | null, number | null,
])[] = [
  // siteIdx, code, name, commodity, mineType, oreTpd, stripRatio, gradeMean, gradeUnit, ash, cv
  [0, 'SDG-OP', 'Sundowner Main Pit', 'gold', 'open_pit', 9800, 5.4, 1.42, 'g/t', null, null],
  [0, 'SDG-UG', 'Sundowner Deeps Underground', 'gold', 'underground', 2400, 0, 4.85, 'g/t', null, null],
  [1, 'BRC-OC', 'Blackridge Open Cut', 'coal', 'strip', 26000, 6.8, 0, 't', 17.4, 5850],
  [1, 'BRC-UG', 'Blackridge No.3 Underground', 'coal', 'underground', 11500, 0, 0, 't', 14.8, 6180],
  [2, 'CVA-OP', 'Cerro Verde North Pit', 'copper', 'open_pit', 41000, 2.9, 0.58, 'pct', null, null],
  [3, 'KMB-OP', 'Kamba Ridge Open Pit', 'iron_ore', 'open_pit', 18500, 2.1, 61.4, 'pct', null, null],
]

const DEPARTMENTS: readonly (readonly [string, string])[] = [
  ['MIN', 'Mining Operations'],
  ['PRC', 'Processing'],
  ['ENG', 'Engineering and Maintenance'],
  ['GEO', 'Geology and Exploration'],
  ['SUR', 'Survey'],
  ['HSE', 'Health and Safety'],
  ['ENV', 'Environment'],
  ['HRD', 'Human Resources'],
  ['FIN', 'Finance'],
  ['SUP', 'Supply Chain'],
  ['SEC', 'Security'],
  ['TSF', 'Tailings and Water'],
]

const DEPT_DISCIPLINE: Record<string, string> = {
  MIN: 'mining', PRC: 'processing', ENG: 'engineering', GEO: 'geology', SUR: 'survey',
  HSE: 'hse', ENV: 'environment', HRD: 'hr', FIN: 'finance', SUP: 'supply',
  SEC: 'security', TSF: 'environment',
}

const COST_CENTRES: readonly (readonly [string, string, string])[] = [
  ['CC-1000', 'Drill and Blast', 'operating'],
  ['CC-1100', 'Load and Haul', 'operating'],
  ['CC-1200', 'Underground Development', 'operating'],
  ['CC-1300', 'Underground Production', 'operating'],
  ['CC-1400', 'Ancillary and Roads', 'operating'],
  ['CC-1500', 'Dewatering', 'operating'],
  ['CC-2000', 'Crushing and Milling', 'operating'],
  ['CC-2100', 'Leach and Adsorption', 'operating'],
  ['CC-2200', 'Coal Preparation Plant', 'operating'],
  ['CC-2300', 'Gold Room and Refining', 'operating'],
  ['CC-3000', 'Mobile Maintenance', 'operating'],
  ['CC-3100', 'Fixed Plant Maintenance', 'operating'],
  ['CC-3200', 'Electrical and Instrumentation', 'operating'],
  ['CC-4000', 'Geology and Grade Control', 'operating'],
  ['CC-4100', 'Exploration', 'exploration'],
  ['CC-5000', 'Health Safety and Environment', 'overhead'],
  ['CC-5100', 'Human Resources and Training', 'overhead'],
  ['CC-5200', 'Supply Chain and Warehouse', 'overhead'],
  ['CC-5300', 'Site Administration', 'overhead'],
  ['CC-6000', 'Capital Projects', 'capital'],
  ['CC-7000', 'Rehabilitation and Closure', 'closure'],
]

const ROLES: readonly (readonly [string, string, string, string[]])[] = [
  ['ADMIN', 'System Administrator', 'Full access to every module and configuration', ['*:*']],
  ['GM', 'General Manager', 'Read across the group, approves plans and budgets', ['*:read', 'plan:approve', 'budget:approve']],
  ['MINE_MGR', 'Mine Manager', 'Statutory manager for a site', ['production:*', 'safety:*', 'workforce:read', 'plan:approve']],
  ['SUPER', 'Shift Supervisor', 'Captures shift production and safety records', ['production:write', 'safety:write', 'workforce:read']],
  ['ENGINEER', 'Mining Engineer', 'Planning, drill and blast, reconciliation', ['plan:*', 'production:read', 'geology:read']],
  ['GEOLOGIST', 'Geologist', 'Drilling, sampling, resource model', ['geology:*', 'production:read']],
  ['METALLURGIST', 'Metallurgist', 'Plant performance and metallurgical accounting', ['processing:*', 'quality:*']],
  ['MAINT_PLANNER', 'Maintenance Planner', 'Work orders, PM schedules, asset register', ['maintenance:*', 'supply:read']],
  ['HSE_OFFICER', 'HSE Officer', 'Incidents, permits, inspections, actions', ['safety:*', 'environment:*']],
  ['HR_OFFICER', 'HR Officer', 'Employees, training, attendance, payroll', ['workforce:*']],
  ['STOREMAN', 'Storeman', 'Stock movements, receipts and issues', ['supply:*']],
  ['VIEWER', 'Read Only', 'Dashboards and reports only', ['*:read']],
]

export async function seedOrganisation(ctx: SeedContext): Promise<void> {
  const { db, rng, today } = ctx

  await insertMany(
    db,
    'orgs',
    ['code', 'name', 'country', 'currency', 'timezone', 'fiscal_year_start_month', 'logo_emoji'],
    [['AURELIA', 'Aurelia Resources Group', 'Australia', 'USD', 'UTC', 7, '⛏️']],
  )
  ctx.orgId = 1

  await insertMany(
    db,
    'sites',
    ['org_id', 'code', 'name', 'country', 'region', 'latitude', 'longitude', 'elevation_m', 'status', 'commissioned_on', 'workforce_target'],
    SITES.map((s, i) => [
      ctx.orgId, s[0], s[1], s[2], s[3], s[4], s[5], s[6], 'operating',
      isoDate(addDays(today, -(2400 + i * 700))), [640, 980, 1250, 520][i],
    ]),
  )
  ctx.sites = SITES.map((s, i) => ({ id: i + 1, code: s[0], name: s[1], country: s[2] }))

  await insertMany(
    db,
    'mines',
    ['org_id', 'site_id', 'code', 'name', 'commodity', 'mine_type', 'status', 'depth_m', 'area_hectares', 'life_of_mine_years', 'opened_on', 'description'],
    MINES.map((m, i) => [
      ctx.orgId, m[0] + 1, m[1], m[2], m[3], m[4], 'operating',
      m[4] === 'underground' ? rng.num(620, 1450, 0) : rng.num(180, 420, 0),
      rng.num(240, 1800, 1),
      rng.num(6, 19, 1),
      isoDate(addDays(today, -(1200 + i * 380))),
      `${m[2].replace('_', ' ')} ${m[4].replace('_', ' ')} operation feeding the ${SITES[m[0]][1]} processing circuit.`,
    ]),
  )
  ctx.mines = MINES.map((m, i) => ({
    id: i + 1, siteId: m[0] + 1, code: m[1], name: m[2], commodity: m[3], mineType: m[4],
    oreTpd: m[5], stripRatio: m[6], gradeMean: m[7], gradeUnit: m[8],
    ashMean: m[9] ?? undefined, cvMean: m[10] ?? undefined,
  }))

  // Mining areas: benches for open pit, levels/panels underground.
  const areaRows: unknown[][] = []
  const areasByMine = new Map<number, number[]>()
  let areaId = 0
  for (const mine of ctx.mines) {
    const ids: number[] = []
    if (mine.mineType === 'underground') {
      for (let lvl = 1; lvl <= 6; lvl++) {
        const rl = -(400 + lvl * 90)
        areaRows.push([
          ctx.orgId, mine.id, null, `${mine.code}-L${lvl * 90 + 400}`, `${mine.commodity === 'coal' ? 'Section' : 'Level'} ${lvl * 90 + 400}`,
          mine.commodity === 'coal' ? 'panel' : 'level',
          mine.commodity === 'coal' ? ['Alfred Seam', 'Gus Seam', 'Coalbrook Seam'][lvl % 3] : null,
          rl, rl - 90, 'active', rng.num(320, 1400, 1),
        ])
        ids.push(++areaId)
      }
    } else {
      for (let b = 1; b <= 8; b++) {
        const rl = 420 - b * 15
        areaRows.push([
          ctx.orgId, mine.id, null, `${mine.code}-B${rl}`, `Bench ${rl} RL`,
          mine.mineType === 'strip' ? 'strip' : 'bench',
          mine.commodity === 'coal' ? ['Alfred Seam', 'Gus Seam'][b % 2] : null,
          rl, rl - 15, b <= 6 ? 'active' : 'planned', rng.num(180, 900, 1),
        ])
        ids.push(++areaId)
      }
    }
    areasByMine.set(mine.id, ids)
  }
  await insertMany(
    db,
    'mining_areas',
    ['org_id', 'mine_id', 'parent_id', 'code', 'name', 'area_type', 'seam_name', 'rl_from_m', 'rl_to_m', 'status', 'strike_length_m'],
    areaRows,
  )
  ctx.areasByMine = areasByMine

  const deptRows: unknown[][] = []
  for (const site of ctx.sites) {
    for (const [code, name] of DEPARTMENTS) {
      deptRows.push([ctx.orgId, site.id, `${site.code}-${code}`, `${name} (${site.code})`, DEPT_DISCIPLINE[code]])
    }
  }
  await insertMany(db, 'departments', ['org_id', 'site_id', 'code', 'name', 'discipline'], deptRows)
  ctx.departmentIds = deptRows.map((_, i) => i + 1)

  const ccRows: unknown[][] = []
  for (const site of ctx.sites) {
    for (const [code, name, category] of COST_CENTRES) {
      ccRows.push([ctx.orgId, site.id, `${site.code}-${code}`, name, category])
    }
  }
  await insertMany(db, 'cost_centers', ['org_id', 'site_id', 'code', 'name', 'category'], ccRows)
  ctx.costCenterIds = ccRows.map((_, i) => i + 1)

  await insertMany(
    db,
    'roles',
    ['org_id', 'code', 'name', 'description', 'is_system'],
    ROLES.map(([code, name, description]) => [ctx.orgId, code, name, description, code === 'ADMIN']),
  )
  const permRows: unknown[][] = []
  ROLES.forEach(([, , , perms], i) => {
    for (const p of perms) permRows.push([ctx.orgId, i + 1, p])
  })
  await insertMany(db, 'role_permissions', ['org_id', 'role_id', 'permission'], permRows)

  const users: readonly (readonly [string, string, string, number, number])[] = [
    ['sarah.hughes@aurelia.com', 'Sarah Hughes', 'Group General Manager', 1, 2],
    ['thabo.mokoena@aurelia.com', 'Thabo Mokoena', 'Mine Manager - Sundowner', 1, 3],
    ['lerato.dlamini@aurelia.com', 'Lerato Dlamini', 'Mine Manager - Blackridge', 2, 3],
    ['andres.reyes@aurelia.com', 'Andres Reyes', 'Mine Manager - Cerro Verde', 3, 3],
    ['grace.banda@aurelia.com', 'Grace Banda', 'Mine Manager - Kamba', 4, 3],
    ['liam.anderson@aurelia.com', 'Liam Anderson', 'Senior Mining Engineer', 1, 5],
    ['priya.patel@aurelia.com', 'Priya Patel', 'Chief Geologist', 1, 6],
    ['chen.wong@aurelia.com', 'Chen Wong', 'Plant Metallurgist', 2, 7],
    ['ivan.petrov@aurelia.com', 'Ivan Petrov', 'Maintenance Planner', 3, 8],
    ['amara.okafor@aurelia.com', 'Amara Okafor', 'Group HSE Manager', 1, 9],
    ['nomsa.ncube@aurelia.com', 'Nomsa Ncube', 'HR Business Partner', 2, 10],
    ['diego.silva@aurelia.com', 'Diego Silva', 'Warehouse Supervisor', 4, 11],
    ['admin@aurelia.com', 'System Administrator', 'Platform Administrator', 1, 1],
  ]
  await insertMany(
    db,
    'app_users',
    ['org_id', 'email', 'full_name', 'job_title', 'site_id', 'status', 'last_login_at'],
    users.map(([email, name, title, siteId]) => [
      ctx.orgId, email, name, title, siteId, 'active', addDays(today, -rng.int(0, 6)).toISOString(),
    ]),
  )
  await insertMany(
    db,
    'user_roles',
    ['org_id', 'user_id', 'role_id'],
    users.map(([, , , , roleId], i) => [ctx.orgId, i + 1, roleId]),
  )

  await insertMany(
    db,
    'contractors',
    ['org_id', 'site_id', 'code', 'name', 'scope_of_work', 'contact_name', 'contact_email', 'contact_phone', 'contract_start', 'contract_end', 'insurance_expiry', 'safety_rating', 'status'],
    CONTRACTOR_NAMES.map(([name, scope], i) => [
      ctx.orgId, (i % 4) + 1, `CTR-${String(i + 1).padStart(3, '0')}`, name, scope,
      `${rng.pick(['J.', 'M.', 'A.', 'K.'])} ${rng.pick(['Naidoo', 'Steyn', 'Owusu', 'Reyes'])}`,
      `contracts@${name.split(' ')[0].toLowerCase()}.com`,
      `+27 ${rng.int(10, 87)} ${rng.int(200, 999)} ${rng.int(1000, 9999)}`,
      isoDate(addDays(today, -rng.int(200, 900))),
      isoDate(addDays(today, rng.int(60, 700))),
      isoDate(addDays(today, rng.int(-30, 400))),
      rng.weighted([['A', 5], ['B', 4], ['C', 2], ['D', 1]]),
      rng.weighted([['active', 8], ['prequalified', 1], ['suspended', 1]]),
    ]),
  )
  ctx.contractorIds = CONTRACTOR_NAMES.map((_, i) => i + 1)
}

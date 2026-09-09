import type { MineDb } from '../client'
import type { Progress, SeedContext } from './context'
import { Rng } from './rng'
import { seedOrganisation } from './part1_org'
import { seedPeople } from './part2_people'
import { seedAssets } from './part3_assets'
import { seedGeology } from './part4_geology'
import { seedOperations } from './part5_operations'
import { seedProcessing } from './part6_processing'
import { seedSupplyChain } from './part7_supply'
import { seedHse } from './part8_hse'
import { seedCommercial } from './part9_commercial'

/** Days of operating history the demo dataset covers. */
const HISTORY_DAYS = 180

/**
 * Builds a complete, internally consistent demo operation: four sites,
 * six mines across gold, coal, copper and iron ore, six months of shift
 * level history, and every downstream record that hangs off it.
 */
export async function seedDatabase(db: MineDb, progress: Progress): Promise<void> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const ctx: SeedContext = {
    db,
    rng: new Rng(20260907),
    today,
    historyDays: HISTORY_DAYS,
    orgId: 1,
    sites: [],
    mines: [],
    areasByMine: new Map(),
    departmentIds: [],
    costCenterIds: [],
    contractorIds: [],
    employees: [],
    crewIds: [],
    shiftIndex: new Map(),
    shiftIds: [],
    assets: [],
    workOrderIds: [],
    plants: [],
    stockpileIds: [],
    itemIds: [],
    itemCosts: [],
    supplierIds: [],
    warehouseIds: [],
    customerIds: [],
    incidentIds: [],
    hazardIds: [],
    productSpecIds: [],
  }

  const steps: [string, (c: SeedContext) => Promise<void>][] = [
    ['Creating sites, mines and organisation structure', seedOrganisation],
    ['Building the workforce, crews and shift roster', seedPeople],
    ['Registering the fleet and maintenance history', seedAssets],
    ['Loading drilling, sampling and the resource model', seedGeology],
    ['Generating six months of production', seedOperations],
    ['Running the processing plants', seedProcessing],
    ['Stocking the warehouses and purchasing pipeline', seedSupplyChain],
    ['Recording safety, health and environment data', seedHse],
    ['Closing out sales, finance and compliance', seedCommercial],
  ]

  for (const [index, [message, run]] of steps.entries()) {
    progress(message, index / steps.length)
    await run(ctx)
  }

  progress('Optimising query plans', 0.97)
  await db.exec('analyze;')
  progress('Ready', 1)
}

import type { MineDb } from '../client'
import type { Rng } from './rng'

export interface MineSeed {
  id: number
  siteId: number
  code: string
  name: string
  commodity: string
  mineType: string
  /** Nominal daily ore/coal tonnes used to shape the production series. */
  oreTpd: number
  stripRatio: number
  gradeMean: number
  gradeUnit: string
  ashMean?: number
  cvMean?: number
}

export interface SiteSeed {
  id: number
  code: string
  name: string
  country: string
}

export interface EmployeeSeed {
  id: number
  siteId: number
  name: string
  title: string
  group: string
  location: string
  underground: boolean
  contractorId: number | null
  rate: number
}

export interface AssetSeed {
  id: number
  siteId: number
  mineId: number | null
  assetNo: string
  name: string
  type: string
  meter: number
  critical: string
  status: string
}

export interface PlantSeed {
  id: number
  siteId: number
  code: string
  name: string
  plantType: string
  commodity: string
  tph: number
  recovery: number
}

export interface SeedContext {
  db: MineDb
  rng: Rng
  today: Date
  /** Number of days of operating history to generate. */
  historyDays: number
  orgId: number
  sites: SiteSeed[]
  mines: MineSeed[]
  areasByMine: Map<number, number[]>
  departmentIds: number[]
  costCenterIds: number[]
  contractorIds: number[]
  employees: EmployeeSeed[]
  crewIds: number[]
  /** `${mineId}|${yyyy-mm-dd}|${shiftType}` -> shift id */
  shiftIndex: Map<string, number>
  shiftIds: number[]
  assets: AssetSeed[]
  workOrderIds: number[]
  plants: PlantSeed[]
  stockpileIds: number[]
  itemIds: number[]
  itemCosts: number[]
  supplierIds: number[]
  warehouseIds: number[]
  customerIds: number[]
  incidentIds: number[]
  hazardIds: number[]
  productSpecIds: number[]
}

export type Progress = (message: string, pct: number) => void

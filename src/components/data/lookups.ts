import { useMemo } from 'react'
import { useSql } from '@/db/hooks'
import { useReferenceLabels } from '@/db/introspect'

export interface LookupOption {
  id: number
  label: string
}

export type LookupMap = Map<string, LookupOption[]>

/**
 * Loads display values for every foreign key a screen touches, in one
 * round trip. Reference columns then render as "Sundowner Main Pit"
 * instead of "3", and edit forms get a real picker.
 */
export function useLookups(tables: string[]): { lookups: LookupMap; byId: Map<string, Map<number, string>> } {
  const unique = useMemo(() => [...new Set(tables)].filter(Boolean).sort(), [tables])
  const labelColumns = useReferenceLabels(unique)

  const sql = useMemo(() => {
    if (unique.length === 0 || labelColumns.size === 0) return null
    const parts = unique
      .filter((t) => labelColumns.has(t))
      .map((t) => {
        const col = labelColumns.get(t)!
        return `select '${t}' as src, id, coalesce(${col}::text, '#' || id::text) as label from ${t} order by 3 limit 1200`
      })
    return parts.length > 0 ? parts.map((p) => `(${p})`).join(' union all ') : null
  }, [unique, labelColumns])

  const { rows } = useSql<{ src: string; id: number; label: string }>(sql, [])

  return useMemo(() => {
    const lookups: LookupMap = new Map()
    const byId = new Map<string, Map<number, string>>()
    for (const row of rows) {
      const list = lookups.get(row.src) ?? []
      list.push({ id: row.id, label: row.label })
      lookups.set(row.src, list)
      const ids = byId.get(row.src) ?? new Map<number, string>()
      ids.set(row.id, row.label)
      byId.set(row.src, ids)
    }
    return { lookups, byId }
  }, [rows])
}

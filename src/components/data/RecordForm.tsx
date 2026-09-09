import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { columnLabel, isoDay, label as toLabel } from '@/lib/format'
import type { ColumnMeta } from '@/db/introspect'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import type { LookupMap } from './lookups'

/** Columns the user never edits directly. */
const SYSTEM_COLUMNS = new Set(['id', 'org_id', 'created_at', 'updated_at'])

export interface FormState {
  values: Record<string, unknown>
  setValue: (name: string, value: unknown) => void
  errors: Record<string, string>
  validate: () => boolean
  payload: () => Record<string, unknown>
}

export function useRecordForm(columns: ColumnMeta[], initial?: Record<string, unknown> | null): FormState {
  const editable = useMemo(() => columns.filter((c) => !SYSTEM_COLUMNS.has(c.name) && !c.isGenerated), [columns])

  const [values, setValues] = useState<Record<string, unknown>>(() => seedValues(editable, initial))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setValue = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev))
  }

  const validate = () => {
    const next: Record<string, string> = {}
    for (const col of editable) {
      const value = values[col.name]
      if (!col.nullable && !col.hasDefault && (value == null || value === '')) {
        next[col.name] = 'Required'
      }
      if ((col.kind === 'integer' || col.kind === 'decimal') && value !== '' && value != null) {
        if (Number.isNaN(Number(value))) next[col.name] = 'Must be a number'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const payload = () => {
    const out: Record<string, unknown> = {}
    for (const col of editable) {
      const value = values[col.name]
      if (value === '' || value == null) {
        if (initial) out[col.name] = null
        continue
      }
      out[col.name] =
        col.kind === 'integer' || col.kind === 'decimal' || col.kind === 'reference'
          ? Number(value)
          : col.kind === 'boolean'
            ? Boolean(value)
            : value
    }
    return out
  }

  return { values, setValue, errors, validate, payload }
}

function seedValues(columns: ColumnMeta[], initial?: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of columns) {
    const raw = initial?.[col.name]
    if (raw == null) {
      out[col.name] = col.kind === 'boolean' ? false : ''
      continue
    }
    if (col.kind === 'date') out[col.name] = isoDay(raw)
    else if (col.kind === 'timestamp') out[col.name] = new Date(String(raw)).toISOString().slice(0, 16)
    else if (col.kind === 'json') out[col.name] = JSON.stringify(raw)
    else out[col.name] = raw
  }
  return out
}

export function RecordFields({
  columns,
  form,
  lookups,
  className,
}: {
  columns: ColumnMeta[]
  form: FormState
  lookups: LookupMap
  className?: string
}) {
  const editable = columns.filter((c) => !SYSTEM_COLUMNS.has(c.name) && !c.isGenerated)

  return (
    <div className={cn('grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2', className)}>
      {editable.map((col) => {
        const value = form.values[col.name]
        const required = !col.nullable && !col.hasDefault
        const wide = col.kind === 'longtext' || col.kind === 'json'
        return (
          <Field
            key={col.name}
            label={columnLabel(col.name)}
            required={required}
            error={form.errors[col.name] || undefined}
            className={wide ? 'sm:col-span-2' : undefined}
          >
            {col.kind === 'enum' ? (
              <Select value={String(value ?? '')} onChange={(e) => form.setValue(col.name, e.target.value)}>
                <option value="">—</option>
                {(col.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {toLabel(o)}
                  </option>
                ))}
              </Select>
            ) : col.kind === 'reference' ? (
              <Select value={String(value ?? '')} onChange={(e) => form.setValue(col.name, e.target.value)}>
                <option value="">—</option>
                {(lookups.get(col.refTable ?? '') ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : col.kind === 'boolean' ? (
              <label className="flex h-8 items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => form.setValue(col.name, e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {value ? 'Yes' : 'No'}
              </label>
            ) : col.kind === 'longtext' || col.kind === 'json' ? (
              <Textarea
                value={String(value ?? '')}
                onChange={(e) => form.setValue(col.name, e.target.value)}
                placeholder={col.kind === 'json' ? '{ }' : undefined}
              />
            ) : (
              <Input
                type={
                  col.kind === 'date'
                    ? 'date'
                    : col.kind === 'timestamp'
                      ? 'datetime-local'
                      : col.kind === 'integer' || col.kind === 'decimal'
                        ? 'number'
                        : 'text'
                }
                step={col.kind === 'decimal' ? 'any' : undefined}
                value={String(value ?? '')}
                onChange={(e) => form.setValue(col.name, e.target.value)}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}

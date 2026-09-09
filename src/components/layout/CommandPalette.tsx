import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ALL_NAV_ITEMS } from '@/registry/navigation'

/**
 * Ctrl/Cmd-K navigation. With ninety screens, search is the primary way
 * people move around; the sidebar is for orientation.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_NAV_ITEMS.slice(0, 12)
    const terms = q.split(/\s+/)
    return ALL_NAV_ITEMS.map((item) => {
      const haystack = `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase()
      let score = 0
      for (const term of terms) {
        const idx = haystack.indexOf(term)
        if (idx === -1) return null
        score += idx === 0 ? 3 : item.label.toLowerCase().includes(term) ? 2 : 1
      }
      return { item, score }
    })
      .filter((r): r is { item: (typeof ALL_NAV_ITEMS)[number]; score: number } => r != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.item)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (to: string) => {
    navigate(to)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-xl bg-elevated ring-1 ring-line shadow-2xl animate-in-up"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          }
          if (e.key === 'Enter' && results[active]) go(results[active].to)
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a screen — try gas, TSF, work orders, payroll…"
            className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-2xs text-subtle">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-subtle">No screens match “{query}”.</p>
          )}
          {results.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.to}
                type="button"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.to)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition',
                  i === active ? 'bg-accent-soft' : 'hover:bg-inset',
                )}
              >
                <Icon className={cn('size-4 shrink-0', i === active ? 'text-accent' : 'text-subtle')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-ink">{item.label}</span>
                  <span className="block truncate text-2xs text-subtle">{item.group}</span>
                </span>
                {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-subtle" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

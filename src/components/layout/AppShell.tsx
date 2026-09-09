import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, ChevronDown, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTheme } from '@/lib/theme'
import { relative } from '@/lib/format'
import { useSql } from '@/db/hooks'
import { NAV } from '@/registry/navigation'
import { Badge, Button } from '@/components/ui/primitives'
import { CommandPalette } from './CommandPalette'

const STORAGE_KEY = 'tmos.sidebar.open-groups'

function readOpenGroups(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

export function AppShell() {
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const activeGroup = useMemo(
    () => NAV.find((g) => g.items.some((i) => i.to === location.pathname))?.id,
    [location.pathname],
  )

  const [openGroups, setOpenGroups] = useState<string[]>(
    () => readOpenGroups() ?? ['overview', 'operations'],
  )

  useEffect(() => {
    if (activeGroup && !openGroups.includes(activeGroup)) {
      setOpenGroups((prev) => [...prev, activeGroup])
    }
    // Only react to route changes, not to the user collapsing a group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups))
    } catch {
      /* storage unavailable — groups just reset next session */
    }
  }, [openGroups])

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const unread = useSql<{ n: number }>(
    'select count(*)::int as n from notifications where read_at is null',
  )
  const unreadCount = unread.rows[0]?.n ?? 0

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[var(--sidebar)] transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
            ⛏
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Terra Mine OS</p>
            <p className="truncate text-2xs text-[var(--sidebar-muted)]">Aurelia Resources Group</p>
          </div>
          <button
            type="button"
            className="text-[var(--sidebar-muted)] hover:text-white lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-2 flex items-center gap-2 rounded-md bg-[var(--sidebar-active)] px-2.5 py-1.5 text-2xs text-[var(--sidebar-muted)] transition hover:text-white"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search screens</span>
          <kbd className="rounded border border-white/10 px-1 py-0.5 text-[10px]">⌘K</kbd>
        </button>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((group) => {
            const open = openGroups.includes(group.id)
            const GroupIcon = group.icon
            return (
              <div key={group.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) =>
                      prev.includes(group.id) ? prev.filter((g) => g !== group.id) : [...prev, group.id],
                    )
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide transition',
                    activeGroup === group.id
                      ? 'text-white'
                      : 'text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]',
                  )}
                >
                  <GroupIcon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate text-left">{group.label}</span>
                  <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="mb-1 ml-2 border-l border-white/10 pl-2">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) =>
                            cn(
                              'group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition',
                              isActive
                                ? 'bg-[var(--sidebar-active)] font-medium text-white'
                                : 'text-[var(--sidebar-fg)] hover:bg-white/5 hover:text-white',
                            )
                          }
                        >
                          <Icon className="size-3.5 shrink-0 opacity-70" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge === 'alerts' && unreadCount > 0 && (
                            <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white tnum">
                              {unreadCount}
                            </span>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-elevated/90 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            className="text-muted hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4.5" />
          </button>

          <Breadcrumbs />

          <div className="ml-auto flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              icon={<Search className="size-3.5" />}
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex"
            >
              Search
            </Button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                className="relative grid size-8 place-items-center rounded-md text-muted transition hover:bg-sunken hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-danger" />
                )}
              </button>
              {notificationsOpen && <NotificationsMenu onClose={() => setNotificationsOpen(false)} />}
            </div>
            <button
              type="button"
              onClick={toggle}
              className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-sunken hover:text-ink"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <span className="ml-1 grid size-7 place-items-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
              SH
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

function Breadcrumbs() {
  const location = useLocation()
  const entry = useMemo(() => {
    for (const group of NAV) {
      const item = group.items.find((i) => i.to === location.pathname)
      if (item) return { group: group.label, item: item.label }
    }
    return null
  }, [location.pathname])

  if (!entry) return <span className="text-xs text-subtle">Terra Mine OS</span>
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className="hidden truncate text-subtle sm:inline">{entry.group}</span>
      <span className="hidden text-subtle sm:inline">/</span>
      <span className="truncate font-medium text-ink">{entry.item}</span>
    </nav>
  )
}

function NotificationsMenu({ onClose }: { onClose: () => void }) {
  const { rows } = useSql<{
    id: number
    severity: string
    title: string
    body: string
    link: string | null
    created_at: string
    read_at: string | null
  }>('select id, severity, title, body, link, created_at, read_at from notifications order by created_at desc limit 8')

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-9 z-40 w-80 overflow-hidden rounded-lg bg-elevated ring-1 ring-line shadow-xl animate-in-up">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-xs font-semibold text-ink">Alerts</p>
          <Link to="/alerts" onClick={onClose} className="text-2xs text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 && <p className="px-3 py-6 text-center text-xs text-subtle">Nothing to report.</p>}
          {rows.map((n) => (
            <Link
              key={n.id}
              to={n.link ?? '/alerts'}
              onClick={onClose}
              className={cn(
                'block border-b border-line/60 px-3 py-2.5 transition hover:bg-inset',
                !n.read_at && 'bg-accent-soft/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-ink">{n.title}</p>
                <Badge
                  tone={
                    n.severity === 'critical'
                      ? 'danger'
                      : n.severity === 'warning'
                        ? 'warn'
                        : n.severity === 'success'
                          ? 'ok'
                          : 'info'
                  }
                >
                  {n.severity}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-2xs text-muted">{n.body}</p>
              <p className="mt-1 text-2xs text-subtle">{relative(n.created_at)}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

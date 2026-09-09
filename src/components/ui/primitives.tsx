import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ChevronDown, Search, Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TONE_CLASS, toneFor, type Tone } from '@/lib/status'
import { label as toLabel } from '@/lib/format'

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'xs' | 'sm' | 'md'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-elevated text-ink ring-1 ring-line hover:bg-inset',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-110',
  subtle: 'bg-sunken text-ink hover:bg-line',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-2xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition',
        'disabled:opacity-45 disabled:pointer-events-none',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string
  children: ReactNode
  padded?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-elevated ring-1 ring-line shadow-[var(--shadow-card)]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0 flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-subtle shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink truncate">{title}</h3>
          {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------- Badge */

export function Badge({
  children,
  tone,
  status,
  className,
  dot,
}: {
  children?: ReactNode
  tone?: Tone
  status?: unknown
  className?: string
  dot?: boolean
}) {
  const resolved = tone ?? toneFor(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONE_CLASS[resolved],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children ?? toLabel(status)}
    </span>
  )
}

/* ------------------------------------------------------------------ Inputs */

const FIELD_BASE =
  'w-full rounded-md bg-elevated text-ink ring-1 ring-line px-2.5 py-1.5 text-sm placeholder:text-subtle transition ' +
  'focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50 disabled:bg-sunken'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_BASE, className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-20 resize-y', className)} {...rest} />
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select className={cn(FIELD_BASE, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-subtle" />
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(FIELD_BASE, 'pl-8')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <div id={id}>{children}</div>
      {error ? (
        <p className="text-2xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-2xs text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full rounded-xl bg-elevated ring-1 ring-line shadow-2xl animate-in-up my-auto',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-subtle hover:text-ink -mr-1"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------- Tabs */

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}
const TabsContext = createContext<TabsContextValue | null>(null)

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <TabsContext.Provider value={{ value, setValue: onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-line overflow-x-auto', className)}>
      {children}
    </div>
  )
}

export function Tab({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  const ctx = useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <button
      type="button"
      onClick={() => ctx?.setValue(value)}
      className={cn(
        'relative px-3 py-2 text-xs font-medium whitespace-nowrap transition -mb-px border-b-2',
        active ? 'text-ink border-accent' : 'text-subtle border-transparent hover:text-ink',
      )}
    >
      {children}
      {count != null && (
        <span className="ml-1.5 rounded-full bg-sunken px-1.5 py-0.5 text-2xs text-muted tnum">{count}</span>
      )}
    </button>
  )
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (ctx?.value !== value) return null
  return <div className="pt-4">{children}</div>
}

/* ------------------------------------------------------- Segmented control */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { readonly value: T; readonly label: string }[]
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-md bg-sunken p-0.5 ring-1 ring-line', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 py-1 text-2xs font-medium transition whitespace-nowrap',
            value === o.value ? 'bg-elevated text-ink shadow-sm' : 'text-subtle hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ State blocks */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-subtle', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-sunken', className)} />
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-subtle">{icon ?? <Inbox className="size-7" />}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-subtle">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md bg-danger-soft px-3 py-2.5 text-xs text-danger ring-1 ring-danger/20">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-0.5 font-mono text-2xs opacity-80 break-words">{message}</p>
      {onRetry && (
        <Button size="xs" variant="ghost" className="mt-2 text-danger" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Meters */

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  className,
  showLabel,
}: {
  value: number
  max?: number
  tone?: Tone
  className?: string
  showLabel?: boolean
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const bg = {
    neutral: 'bg-subtle', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info', accent: 'bg-accent',
  }[tone]
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
        <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-2xs text-muted tnum w-9 text-right">{pct.toFixed(0)}%</span>}
    </div>
  )
}

/* ----------------------------------------------------------------- Tooltip */

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-2xs text-white shadow-lg dark:bg-slate-700">
          {content}
        </span>
      )}
    </span>
  )
}

/**
 * Small, admin-only building blocks so every admin page shares one rhythm: white 20px cards on
 * the soft canvas, one header pattern, one input style, one skeleton and one error treatment.
 */
import type { ReactNode } from 'react'
import { AlertCircle, RotateCcw, X } from 'lucide-react'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'

export const inputClass =
  'block min-h-11 w-full min-w-0 rounded-control border border-hairline bg-canvas px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted hover:border-neutral-400 focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)] focus-visible:outline-none disabled:opacity-50'

/** Small text-style action (Edit, Details…) with a 44px hit area on touch screens. */
export const linkButtonClass =
  'ui-press relative inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""] [&_svg]:size-4 [&_svg]:shrink-0'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6', className)}>{children}</div>
}

export function Panel({
  title,
  description,
  icon,
  count,
  actions,
  children,
  className,
  bodyClassName,
  flush,
  id,
  tour,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  count?: number
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** No body padding: for tables and lists that run edge to edge. */
  flush?: boolean
  id?: string
  tour?: string
}) {
  return (
    <section
      id={id}
      data-tour={tour}
      className={cn('min-w-0 rounded-lg border border-hairline-soft bg-canvas shadow-card', className)}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-hairline-soft px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-ink [&_svg]:size-4">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold leading-8 text-ink">
                {title}
                {count !== undefined ? (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-strong px-2 text-xs font-semibold tabular-nums text-body">
                    {count}
                  </span>
                ) : null}
              </h2>
              {description ? <p className="max-w-[62ch] text-sm leading-relaxed text-muted text-pretty">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? '' : 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded-md bg-surface-strong', className)} />
}

/** Loading placeholder shaped like a panel with a header and a few rows. */
export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-hairline-soft bg-canvas shadow-card', className)} aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-hairline-soft px-5 py-4">
        <Bone className="size-8 rounded-full" />
        <Bone className="h-4 w-40" />
      </div>
      <div className="flex flex-col gap-4 p-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-3.5 w-1/3" />
              <Bone className="h-3 w-1/5" />
            </div>
            <Bone className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-800">
      <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={cn(linkButtonClass, 'text-danger-800 hover:bg-danger-100')}>
          <RotateCcw aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  )
}

/** Inline, dismissible outcome message after an action. */
export function Notice({ message, tone = 'success', onClose }: { message: string; tone?: 'success' | 'error'; onClose: () => void }) {
  if (!message) return null
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-reveal flex items-center gap-3 rounded-lg border py-2 pl-4 pr-2 text-sm font-medium',
        tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800',
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="ui-press flex size-9 shrink-0 items-center justify-center rounded-control hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Segmented filter (2–5 options) with counts. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 max-sm:w-max sm:flex-wrap">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'ui-press inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              'relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
              active ? 'border-ink bg-ink text-white' : 'border-hairline bg-canvas text-ink hover:border-neutral-400',
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn('tabular-nums', active ? 'text-white/75' : 'text-muted')}>{o.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

const AVATAR_TONES = [
  'bg-primary-50 text-accent-accessible',
  'bg-success-50 text-success-800',
  'bg-surface-strong text-body',
  'bg-warning-50 text-warning-800',
]

const TITLES = /^(dr|mr|mrs|ms|miss|mx|prof|sr|sister|nurse)\.?$/i

export function initials(name: string) {
  const all = name.trim().split(/\s+/).filter(Boolean)
  const parts = all.length > 1 ? all.filter((p, i) => i > 0 || !TITLES.test(p)) : all
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function StaffAvatar({ name, size = 'md', muted }: { name: string; size?: 'sm' | 'md'; muted?: boolean }) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm',
        muted ? 'bg-surface-strong text-muted' : AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length],
      )}
    >
      {initials(name)}
    </span>
  )
}

/** "6 h 49 m" for a completed session. */
export function duration(startIso: string, endIso: string) {
  const mins = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`
}

export function errorText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

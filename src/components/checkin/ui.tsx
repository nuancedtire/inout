import { forwardRef, useEffect, useRef, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { AlertTriangle, ArrowLeft, Check, Info, CircleAlert, X } from 'lucide-react'
import { Wordmark } from '#/components/brand/Wordmark'
import { initials } from './copy'
import { CHECKIN_CSS } from './styles'

// ── Page frame ────────────────────────────────────────────────────────────────

/**
 * The staff page frame: one 440px column on phones. `wide` screens (Home, location, working,
 * result) open into two columns from 640px — inner foldable screens, landscape, tablets — and,
 * on a dual-screen or half-folded device, line those columns up with the two screen segments so
 * nothing sits across the hinge. Side padding includes the safe-area insets (landscape notches).
 */
export function Shell({ children, right, left, wide = false }: { children: ReactNode; right?: ReactNode; left?: ReactNode; wide?: boolean }) {
  return (
    <main className="checkin min-h-svh overflow-x-clip bg-surface-soft">
      <style href="inout-checkin" precedence="default">{CHECKIN_CSS}</style>
      <div className={`ck-frame mx-auto flex min-h-svh w-full flex-col pt-safe pb-[max(1.5rem,env(safe-area-inset-bottom))] ${wide ? 'ck-wide max-w-[440px] min-[640px]:max-w-[960px]' : 'max-w-[440px]'}`}>
        <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3">
          {left ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
          ) : (
            <Wordmark size="sm" label="InOut" animate="ambient" />
          )}
          {right ? <div className="flex min-w-0 items-center">{right}</div> : null}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </main>
  )
}

/**
 * Screen heading. Receives focus when a screen appears so screen-reader and keyboard users land
 * on the new step (focus is programmatic only; it never shows a ring for touch users).
 */
export function ScreenTitle({ children, eyebrow, sub, className = '' }: {
  children: ReactNode
  eyebrow?: ReactNode
  sub?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className={className}>
      {eyebrow ? <p className="mb-2 text-sm font-semibold text-accent-accessible">{eyebrow}</p> : null}
      <h1
        ref={ref}
        tabIndex={-1}
        className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-ink text-balance outline-none"
      >
        {children}
      </h1>
      {sub ? <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted text-pretty">{sub}</p> : null}
    </div>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ui-press -ml-2.5 flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-strong"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </button>
  )
}

// ── Step progress ─────────────────────────────────────────────────────────────

export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5" aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`} role="group">
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
            <span
              className="block h-full rounded-full bg-ink transition-[width] duration-500 ease-[var(--ease-standard)]"
              style={{ width: i < current ? '100%' : i === current ? '50%' : '0%' }}
            />
          </span>
        ))}
      </div>
      <div className="flex justify-between text-xs font-medium text-muted" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s} className={i === current ? 'text-ink' : i < current ? 'text-body' : ''}>{s}</span>
        ))}
      </div>
    </div>
  )
}

// ── Notices ───────────────────────────────────────────────────────────────────

type NoticeTone = 'neutral' | 'warning' | 'danger' | 'success'

const NOTICE_TONE: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  neutral: { box: 'bg-canvas ring-hairline-soft', icon: 'text-muted', Icon: Info },
  warning: { box: 'bg-warning-50 ring-warning-200/70', icon: 'text-warning-700', Icon: AlertTriangle },
  danger: { box: 'bg-danger-50 ring-danger-200/70', icon: 'text-danger-700', Icon: CircleAlert },
  success: { box: 'bg-success-50 ring-success-200/70', icon: 'text-success-accessible', Icon: Check },
}

export function Notice({ tone = 'neutral', title, children, action, icon, role, className = '' }: {
  tone?: NoticeTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  role?: 'alert' | 'status'
  className?: string
}) {
  const t = NOTICE_TONE[tone]
  return (
    <div role={role} className={`animate-reveal flex gap-3 rounded-card p-4 ring-1 ring-inset ${t.box} ${className}`}>
      <span className={`mt-px shrink-0 ${t.icon}`} aria-hidden="true">
        {icon ?? <t.Icon className="size-5" strokeWidth={2} />}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-body' : 'text-body'}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────

type BigButtonProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ink' | 'secondary' | 'quiet'
  icon?: ReactNode
  busy?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  describedBy?: string
}

const BIG_VARIANT = {
  primary: 'bg-accent-accessible text-white hover:bg-accent-accessible-hover shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(213,11,64,0.55)]',
  ink: 'bg-ink text-white hover:bg-neutral-800 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)]',
  secondary: 'bg-canvas text-ink ring-1 ring-inset ring-hairline hover:ring-ink/30 hover:bg-surface-soft',
  quiet: 'bg-transparent text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink',
}

/** 56px full-width action, the main control on each screen. */
export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(function BigButton(
  { children, onClick, variant = 'primary', icon, busy, disabled, type = 'button', className = '', describedBy },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-describedby={describedBy}
      className={[
        'ui-press relative inline-flex w-full items-center justify-center gap-2.5 rounded-control font-semibold select-none',
        variant === 'quiet' ? 'min-h-11 text-[0.9375rem]' : 'min-h-14 px-5 text-base',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed',
        busy ? 'cursor-progress' : 'disabled:opacity-45',
        BIG_VARIANT[variant],
        className,
      ].join(' ')}
    >
      {busy ? <span className="spinner size-5 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
})

export function TextLink({ children, onClick, className = '' }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-[0.9375rem] font-semibold text-accent-accessible hover:bg-primary-50 ${className}`}
    >
      {children}
    </button>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_TINTS = [
  'bg-[#fff1f4] text-[#c2003a]',
  'bg-[#eef6ff] text-[#1f5fae]',
  'bg-[#effaf1] text-[#1d7a35]',
  'bg-[#fff6e8] text-[#9a5300]',
  'bg-[#f4f0ff] text-[#5b3cc4]',
  'bg-[#ecfaf9] text-[#0f7470]',
]

export function Avatar({ name, size = 40, className = '' }: { name: string; size?: number; className?: string }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const tint = AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ${tint} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  )
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────

export function Sheet({ open, onOpenChange, title, description, children, dismissible = true }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  dismissible?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (dismissible || o) && onOpenChange(o)}>
      <Dialog.Portal>
        <style href="inout-checkin" precedence="default">{CHECKIN_CSS}</style>
        <Dialog.Overlay className="animate-scrim fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="checkin-sheet fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[440px] rounded-t-card bg-canvas px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-overlay outline-none sm:bottom-6 sm:rounded-card"
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline" aria-hidden="true" />
          {dismissible ? (
            <Dialog.Close
              aria-label="Close"
              className="ui-press absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-strong hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          ) : null}
          <Dialog.Title className="pr-10 text-xl font-semibold leading-snug tracking-[-0.01em] text-ink text-balance">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted text-pretty">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
          )}
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Text field ────────────────────────────────────────────────────────────────

export const TextField = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: ReactNode
}>(function TextField({ label, hint, error, id, className = '', ...rest }, ref) {
  const fieldId = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className="h-13 w-full rounded-control border border-hairline bg-canvas px-4 text-base text-ink placeholder:text-muted outline-none transition-[border-color,box-shadow] hover:border-neutral-400 focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)] aria-invalid:border-danger-600"
        {...rest}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-sm text-danger-700">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
})

// ── Toggle ────────────────────────────────────────────────────────────────────

/** iOS-style switch labelled by visible text elsewhere (`labelledBy`). 51×31 with a 44px hit area. */
export function Toggle({ checked, onChange, labelledBy, describedBy, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  labelledBy: string
  describedBy?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 after:absolute after:-inset-2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45 ${checked ? 'bg-success-accessible' : 'bg-neutral-300'}`}
    >
      <span
        aria-hidden="true"
        className="size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
        style={{ transform: checked ? 'translateX(20px)' : 'none' }}
      />
    </button>
  )
}

// ── Live announcer ────────────────────────────────────────────────────────────

/** Polite live region for results that should be read out even when focus does not move. */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}

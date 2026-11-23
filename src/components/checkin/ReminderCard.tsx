import { BellOff, BellRing, Check, Settings, X } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { isStandalone, type Platform } from '#/lib/platform'
import { notificationSettingsSteps } from '#/lib/pushClient'
import type { RemindersState } from './useReminders'

/** "20:00" → "20:15": when the reminder would arrive. */
function reminderClock(shiftEnd: string | null): string | null {
  const m = shiftEnd ? /^(\d{1,2}):(\d{2})/.exec(shiftEnd) : null
  if (!m) return null
  const total = (Number(m[1]) * 60 + Number(m[2]) + 15) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function settingsFlavor(): 'samsung' | 'standalone' | 'browser' {
  if (isStandalone()) return 'standalone'
  return typeof navigator !== 'undefined' && /SamsungBrowser/i.test(navigator.userAgent) ? 'samsung' : 'browser'
}

/** A miniature of the notification itself, so it's clear what "a reminder" means. */
function NotificationPreview({ shiftEnd }: { shiftEnd: string | null }) {
  const at = reminderClock(shiftEnd)
  return (
    <figure className="ck-notify mt-3.5 flex gap-2.5 rounded-[1rem] bg-surface-soft p-3 ring-1 ring-inset ring-hairline-soft" aria-label="Example reminder">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-canvas shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.18)]" aria-hidden="true">
        <RunnerMark size={24} />
      </span>
      <figcaption className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-ink">Still at work?</span>
          <span className="shrink-0 text-xs tabular-nums text-muted">{at ?? 'now'}</span>
        </span>
        <span className="block text-body">
          {shiftEnd ? `Your shift ended at ${shiftEnd.slice(0, 5)}. ` : ''}Tap to check out.
        </span>
      </figcaption>
    </figure>
  )
}

const CARD = 'animate-reveal relative overflow-hidden rounded-card bg-canvas p-4 shadow-card'
const CLOSE = 'ui-press absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-strong hover:text-ink'
const SECONDARY = 'ui-press mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-surface-strong px-5 font-semibold text-ink hover:bg-neutral-200 disabled:cursor-progress disabled:opacity-70'

function Tile({ tone, children }: { tone: 'brand' | 'warning' | 'success'; children: React.ReactNode }) {
  const cls = tone === 'success'
    ? 'bg-success-50 text-success-accessible'
    : tone === 'warning'
      ? 'bg-warning-50 text-warning-700'
      : 'bg-primary-50 text-accent-accessible'
  return <span className={`flex size-12 shrink-0 items-center justify-center rounded-control ${cls}`} aria-hidden="true">{children}</span>
}

/**
 * "Remind me to check out": the opt-in card on Home and after a check-in, the "notifications are
 * blocked" help, and the brief "Reminders are on" confirmation. Renders nothing otherwise.
 */
export function ReminderCard({ reminders, platform, shiftEnd }: {
  reminders: RemindersState
  platform: Platform
  /** "20:00" when the rota has this person's end time, for the example notification. */
  shiftEnd: string | null
}) {
  const { card, busy, error, enable, snooze } = reminders
  if (!card) return null

  if (card === 'on') {
    return (
      <section aria-labelledby="ck-remind-title" className={CARD} role="status">
        <div className="flex items-center gap-3.5">
          <Tile tone="success"><Check className="size-6" strokeWidth={2.75} /></Tile>
          <div className="min-w-0">
            <h2 id="ck-remind-title" className="font-semibold leading-snug text-ink">Reminders are on</h2>
            <p className="text-sm leading-snug text-muted text-pretty">
              {reminderClock(shiftEnd)
                ? `One nudge at ${reminderClock(shiftEnd)} if you’re still checked in.`
                : 'One nudge after your shift if you’re still checked in.'}
              {' '}Change it in the menu under your name.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (card === 'denied') {
    return (
      <section aria-labelledby="ck-remind-title" className={CARD}>
        <button type="button" onClick={snooze} aria-label="Not now" className={CLOSE}>
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3 pr-9">
          <Tile tone="warning"><BellOff className="size-6" /></Tile>
          <h2 id="ck-remind-title" className="min-w-0 text-[1.0625rem] font-semibold leading-snug text-ink text-balance">Notifications are blocked</h2>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-snug text-body text-pretty">Allow them to get a reminder to check out:</p>
        <p className="mt-2.5 flex gap-2.5 rounded-control bg-surface-soft px-3 py-2.5 text-sm leading-snug text-body">
          <Settings className="mt-px size-4 shrink-0 text-muted" aria-hidden="true" />
          <span>{notificationSettingsSteps(platform, settingsFlavor())}</span>
        </p>
        <button type="button" onClick={enable} disabled={busy} className={SECONDARY}>
          {busy ? <span className="spinner size-5 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : null}
          I’ve allowed them
        </button>
        <div role="status" aria-live="polite">
          {error ? <p key={error + String(busy)} className="ck-nudge mt-2.5 text-center text-sm leading-snug text-warning-800 text-pretty">{error}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="ck-remind-title" aria-describedby="ck-remind-desc" className={CARD}>
      <button type="button" onClick={snooze} aria-label="Not now" className={CLOSE}>
        <X className="size-5" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-3 pr-9">
        <Tile tone="brand"><BellRing className="ck-bell size-6" /></Tile>
        <div className="min-w-0">
          <h2 id="ck-remind-title" className="text-[1.0625rem] font-semibold leading-snug text-ink text-balance">Remind me to check out</h2>
          <p id="ck-remind-desc" className="text-sm leading-snug text-muted text-pretty">Only if you forget.</p>
        </div>
      </div>
      <NotificationPreview shiftEnd={shiftEnd} />
      <button type="button" onClick={enable} disabled={busy} aria-busy={busy || undefined} className={SECONDARY}>
        {busy
          ? <span className="spinner size-5 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          : <BellRing className="size-5" aria-hidden="true" />}
        Turn on reminders
      </button>
      <div role="status" aria-live="polite">
        {error ? <p className="mt-2.5 text-center text-sm leading-snug text-warning-800 text-pretty">{error}</p> : null}
      </div>
    </section>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DropdownMenu } from 'radix-ui'
import { Link } from '@tanstack/react-router'
import { BellRing, ChevronDown, ChevronRight, History, LogOut, MapPin, UserRoundX } from 'lucide-react'
import { SlideToAction } from '#/components/SlideToAction'
import { formatTime } from '#/utils/dateTime'
import { unlockCopy, type Platform } from '#/lib/platform'
import { capitalise, firstName, formatElapsed } from './copy'
import { londonMinutes, shiftStatus, type ShiftTone } from './shiftStatus'
import { UnlockIcon } from './Illustrations'
import { InstallCard } from './InstallCard'
import { Avatar, Notice } from './ui'

export type HomeStatus = { checkedIn: boolean; checkInAt: string | null } | null

/** Identity chip in the header, with a small menu: history, without Face ID, sign out. */
export function IdentityMenu({ name, role, pending, historyToken, onWithout, onSignOut, withoutLabel, reminders }: {
  name: string
  role: string | null
  pending: boolean
  historyToken: string | null
  onWithout?: () => void
  onSignOut: () => void
  withoutLabel?: string
  /** Shift-end reminders switch; `needsInstall` (iPhone tab) opens the Home Screen steps instead. */
  reminders?: { on: boolean; busy: boolean; needsInstall: boolean; onToggle: () => void } | null
}) {
  const item = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-inner px-3 py-1.5 text-[0.9375rem] font-medium text-ink outline-none select-none data-[highlighted]:bg-surface-strong data-[disabled]:cursor-progress data-[disabled]:opacity-60'
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="ui-press -mr-1 flex min-h-11 min-w-0 max-w-[220px] items-center gap-2 rounded-full bg-canvas py-1 pr-2.5 pl-1 shadow-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label={`${name}, account menu`}
      >
        <Avatar name={name} size={32} />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{firstName(name)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="animate-pop z-50 w-[min(18rem,calc(100vw-2.5rem))] rounded-control bg-canvas p-1.5 shadow-overlay outline-none"
        >
          <div className="px-3 pt-2.5 pb-3">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">{role ?? 'On this phone'}</p>
            {pending ? <p className="mt-1.5 text-xs font-medium text-warning-800">Phone awaiting coordinator approval</p> : null}
          </div>
          <div className="mx-1.5 mb-1 h-px bg-hairline-soft" />
          {historyToken ? (
            <DropdownMenu.Item asChild className={item}>
              <Link to="/history" search={{ token: historyToken }}>
                <History className="size-[18px] text-muted" aria-hidden="true" />My sessions
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {reminders ? (
            reminders.needsInstall ? (
              <DropdownMenu.Item className={item} onSelect={reminders.onToggle}>
                <BellRing className="size-[18px] text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 leading-tight">
                  Shift-end reminders
                  <span className="block text-xs font-normal text-muted">Add InOut to your Home Screen first</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.CheckboxItem
                className={item}
                checked={reminders.on}
                disabled={reminders.busy}
                onSelect={reminders.onToggle}
              >
                <BellRing className="size-[18px] text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">Shift-end reminders</span>
                <span className="text-sm font-normal text-muted" aria-hidden="true">{reminders.on ? 'On' : 'Off'}</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-[22px] w-[36px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${reminders.on ? 'bg-success-accessible' : 'bg-neutral-300'}`}
                >
                  <span
                    className="size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 motion-reduce:transition-none"
                    style={{ transform: reminders.on ? 'translateX(14px)' : 'none' }}
                  />
                </span>
              </DropdownMenu.CheckboxItem>
            )
          ) : null}
          {onWithout ? (
            <DropdownMenu.Item className={item} onSelect={onWithout}>
              <UserRoundX className="size-[18px] text-muted" aria-hidden="true" />{withoutLabel}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className={item} onSelect={onSignOut}>
            <LogOut className="size-[18px] text-muted" aria-hidden="true" />Not you? Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/** Today's roster entry times; `null` = not on today's rota; `undefined` = not known yet. */
export type HomeShift = { start: string | null; end: string | null } | null | undefined

const PILL: Record<ShiftTone, string> = {
  neutral: 'bg-canvas text-ink ring-1 ring-inset ring-hairline',
  success: 'bg-success-50 text-success-800',
  warning: 'bg-warning-100 text-warning-800',
}

/**
 * The top of Home: today's date, the shift times as the main line, and how the shift relates to
 * now. The heading takes focus when Home appears (as `ScreenTitle` does elsewhere).
 */
function ShiftHeader({ shift, inNow, now }: { shift: HomeShift; inNow: boolean; now: number }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(now)
  const st = shift ? shiftStatus({ start: shift.start, end: shift.end, checkedIn: inNow, nowMinutes: londonMinutes(now) }) : null
  const heading = 'text-[1.875rem] font-semibold leading-tight tracking-[-0.035em] text-ink tabular-nums outline-none min-[380px]:text-[2rem]'

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-muted">
        {date}{st?.times ? <span aria-hidden="true"> · your shift</span> : null}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {/* One heading element throughout, so the focus it takes on arrival survives loading. */}
        <h1 ref={ref} tabIndex={-1} className={`${heading} ${st?.times ? 'whitespace-nowrap' : ''}`}>
          {shift === undefined ? (
            <>
              <span className="sr-only">Today</span>
              <span aria-hidden="true" className="inline-block h-8 w-44 animate-pulse rounded-inner bg-surface-strong align-middle motion-reduce:animate-none" />
            </>
          ) : st?.times ? (
            <>
              <span className="sr-only">Your shift: </span>
              {st.times.replace('–', '\u2009–\u2009')}
            </>
          ) : shift === null ? 'Not on today’s rota' : 'On today’s rota'}
        </h1>
        {st?.label ? (
          <span className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[0.8125rem] font-semibold tabular-nums ${PILL[st.tone]}`}>
            {st.label}
          </span>
        ) : null}
      </div>
      {shift === null ? (
        <p className="mt-1 text-[0.9375rem] text-muted">{inNow ? 'Added for today.' : 'Checking in adds you for today.'}</p>
      ) : null}
      {st?.progress != null ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
          <div className="h-full rounded-full bg-success-accessible transition-[width] duration-700" style={{ width: `${Math.round(st.progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function HomeScreen({
  status,
  shift,
  platform,
  locationCheck,
  viaFaceId,
  notice,
  onArm,
  onDisarm,
  onSlide,
  location,
  footer,
  reminder,
  installReminders = false,
}: {
  status: HomeStatus
  shift: HomeShift
  platform: Platform
  locationCheck: boolean
  /** false in "without Face ID" mode. */
  viaFaceId: boolean
  notice: ReactNode
  onArm: () => void
  onDisarm: () => void
  onSlide: (mode: 'in' | 'out') => void
  /** Live "are you in the department?" map and result, at the top of the main card. */
  location?: (opts: { compact: boolean }) => ReactNode
  footer?: ReactNode
  /** Shift-end reminder card (opt-in, blocked help or confirmation). */
  reminder?: ReactNode
  /** iPhone tab: the Home Screen card also explains it's needed for reminders. */
  installReminders?: boolean
}) {
  const now = useNow(30_000)
  const unlock = unlockCopy(platform)
  const inNow = !!status?.checkedIn
  const mode = inNow ? 'out' : 'in'
  const loc = location?.({ compact: inNow })

  return (
    <div className="ck-screen ck-home flex flex-1 flex-col pt-2">
      <ShiftHeader shift={shift} inNow={inNow} now={now} />
      {notice ? <div className="mt-5">{notice}</div> : null}

      <section
        aria-labelledby="ck-status"
        className={`ck-main mt-5 overflow-hidden rounded-card bg-canvas shadow-card ${loc && !inNow ? 'min-[640px]:grid min-[640px]:grid-cols-2' : ''}`}
      >
        {loc ? <div className="min-w-0 min-[640px]:border-r min-[640px]:border-hairline-soft">{loc}</div> : null}
        <div className="flex min-w-0 flex-col justify-center p-5 min-[640px]:p-6">
          {status === null ? (
            <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
              <div className="h-5 w-32 rounded-full bg-surface-strong" />
              <div className="mt-4 h-16 rounded-full bg-surface-strong" />
            </div>
          ) : (
            <>
              {inNow && status.checkInAt ? (
                <div className="mb-5">
                  <p className="flex items-center gap-2 text-sm font-medium text-muted">
                    <span className="ck-live size-2 rounded-full bg-success-accessible text-success-accessible" aria-hidden="true" />
                    On shift since {formatTime(status.checkInAt)}
                  </p>
                  <h2 id="ck-status" className="mt-1.5 text-[2.75rem] font-semibold leading-none tracking-[-0.045em] text-ink tabular-nums">
                    <span className="sr-only">On shift for </span>{formatElapsed(status.checkInAt, now)}
                  </h2>
                </div>
              ) : (
                <h2 id="ck-status" className="sr-only">{inNow ? 'On shift' : 'Not checked in'}</h2>
              )}
              <SlideToAction
                key={mode}
                mode={mode}
                onArm={onArm}
                onDisarm={onDisarm}
                onComplete={() => onSlide(mode)}
                actionLabel={inNow ? `Check out${viaFaceId ? ` with ${unlock.name}` : ''}` : `Check in${viaFaceId ? ` with ${unlock.name}` : ''}`}
              />
              {/* Without Face ID, the notice below says so; the line only mentions location. */}
              {viaFaceId || locationCheck ? (
                <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-[0.8125rem] text-muted">
                  {viaFaceId ? <><UnlockIcon platform={platform} className="size-3.5" />{capitalise(unlock.name)}</> : null}
                  {viaFaceId && locationCheck ? <span aria-hidden="true">·</span> : null}
                  {locationCheck ? <><MapPin className="size-3.5" aria-hidden="true" />location check</> : null}
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-4 pb-2 min-[640px]:grid min-[640px]:grid-cols-2 min-[640px]:items-start">
        {!viaFaceId ? (
          <Notice tone="warning" title={`Without ${unlock.name}`}>
            These are marked for the coordinator. Set up {unlock.name} to skip that.
          </Notice>
        ) : null}
        {reminder}
        <InstallCard reminders={installReminders} />
        {footer}
      </div>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { DropdownMenu } from 'radix-ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown, History, LogOut, MapPin, UserRoundX, UserRound } from 'lucide-react'
import { SlideToAction } from '#/components/SlideToAction'
import { formatTime } from '#/utils/dateTime'
import { unlockCopy, type Platform } from '#/lib/platform'
import { firstName, formatElapsed, greeting } from './copy'
import { UnlockIcon } from './Illustrations'
import { InstallCard } from './InstallCard'
import { Avatar, Notice, ScreenTitle } from './ui'

export type HomeStatus = { checkedIn: boolean; checkInAt: string | null } | null

/** Identity chip in the header, with a small menu: history, without Face ID, sign out. */
export function IdentityMenu({ name, role, pending, historyToken, onWithout, onSignOut, withoutLabel }: {
  name: string
  role: string | null
  pending: boolean
  historyToken: string | null
  onWithout?: () => void
  onSignOut: () => void
  withoutLabel?: string
}) {
  const item = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium text-ink outline-none select-none data-[highlighted]:bg-surface-strong'
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="ui-press -mr-1 flex min-h-11 max-w-[220px] items-center gap-2 rounded-full bg-canvas py-1 pr-2.5 pl-1 shadow-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
          className="animate-pop z-50 w-[min(18rem,calc(100vw-2.5rem))] rounded-[18px] bg-canvas p-1.5 shadow-overlay outline-none"
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

export function HomeScreen({
  name,
  status,
  shift,
  platform,
  locationCheck,
  viaFaceId,
  notice,
  onArm,
  onDisarm,
  onSlide,
  footer,
}: {
  name: string
  status: HomeStatus
  shift: string | null
  platform: Platform
  locationCheck: boolean
  /** false in "without Face ID" mode. */
  viaFaceId: boolean
  notice: ReactNode
  onArm: () => void
  onDisarm: () => void
  onSlide: (mode: 'in' | 'out') => void
  footer?: ReactNode
}) {
  const now = useNow(30_000)
  const unlock = unlockCopy(platform)
  const inNow = !!status?.checkedIn
  const mode = inNow ? 'out' : 'in'
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(now))

  return (
    <div className="ck-screen flex flex-1 flex-col pt-3">
      <ScreenTitle sub={shift ? `Your shift today · ${shift}` : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(now)}>
        {greeting(hour)}, {firstName(name)}
      </ScreenTitle>

      {notice ? <div className="mt-5">{notice}</div> : null}

      <section aria-labelledby="ck-status" className="mt-6 rounded-[28px] bg-canvas p-5 shadow-card">
        {status === null ? (
          <div className="animate-pulse" aria-hidden="true">
            <div className="h-6 w-28 rounded-full bg-surface-strong" />
            <div className="mt-4 h-10 w-44 rounded-[10px] bg-surface-strong" />
            <div className="mt-6 h-16 rounded-full bg-surface-strong" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span
                className={`inline-flex h-7 items-center gap-2 rounded-full px-3 text-sm font-semibold ${inNow ? 'bg-success-50 text-success-800' : 'bg-surface-strong text-body'}`}
              >
                <span className={`size-2 rounded-full ${inNow ? 'ck-live bg-success-accessible text-success-accessible' : 'bg-neutral-500'}`} aria-hidden="true" />
                {inNow ? 'On shift' : 'Not checked in'}
              </span>
              {inNow && status.checkInAt ? (
                <span className="text-sm font-medium tabular-nums text-muted">since {formatTime(status.checkInAt)}</span>
              ) : null}
            </div>
            <h2 id="ck-status" className="mt-4 text-[2.5rem] font-semibold leading-none tracking-[-0.035em] text-ink tabular-nums">
              {inNow && status.checkInAt ? formatElapsed(status.checkInAt, now) : 'You’re out'}
            </h2>
            <p className="mt-2 text-[0.9375rem] text-muted">
              {inNow ? 'You’re checked in. Slide when you leave.' : 'Slide when you arrive to start your shift.'}
            </p>

            <div className="mt-6">
              <SlideToAction
                key={mode}
                mode={mode}
                onArm={onArm}
                onDisarm={onDisarm}
                onComplete={() => onSlide(mode)}
                actionLabel={inNow ? `Check out${viaFaceId ? ` with ${unlock.name}` : ''}` : `Check in${viaFaceId ? ` with ${unlock.name}` : ''}`}
              />
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.8125rem] text-muted">
              {viaFaceId ? (
                <>
                  <UnlockIcon platform={platform} className="size-3.5" />
                  Confirms with {unlock.name}
                  {locationCheck ? <><span aria-hidden="true">·</span><MapPin className="size-3.5" aria-hidden="true" />checks location</> : null}
                </>
              ) : (
                <>
                  <UserRound className="size-3.5" aria-hidden="true" />
                  Without {unlock.name}
                  {locationCheck ? <><span aria-hidden="true">·</span><MapPin className="size-3.5" aria-hidden="true" />checks location</> : null}
                </>
              )}
            </p>
          </>
        )}
      </section>

      <div className="mt-4 flex flex-col gap-4 pb-2">
        {!viaFaceId ? (
          <Notice tone="warning" title={`Checking in without ${unlock.name}`}>
            These check-ins are marked for the coordinator to look at. Set up {unlock.name} to skip that.
          </Notice>
        ) : null}
        <InstallCard />
        {footer}
      </div>
    </div>
  )
}

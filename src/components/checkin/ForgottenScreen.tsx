import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Info } from 'lucide-react'
import type { ForgottenCheckout } from '#/utils/reminders.functions'
import { ukClock } from '#/utils/shiftEnd'
import { unlockCopy, type Platform } from '#/lib/platform'
import {
  checkLeftAt,
  clampTime,
  dayLabel,
  dayOptions,
  dayPhrase,
  initialPick,
  leftAtBounds,
  leftAtFrom,
  londonDate,
  suggestedLeftAt,
} from '#/lib/leftAt'
import { SuccessMark, UnlockIcon } from './Illustrations'
import { BigButton, LiveAnnouncer, Notice, ScreenTitle, TextLink } from './ui'

export type ForgottenNotice = { tone: 'neutral' | 'warning'; title: string; message: string } | null

/** A clock face whose hands settle on the time the shift ended. */
function EndClock({ at }: { at: Date }) {
  const [h, m] = ukClock(at).split(':').map(Number)
  const hour = ((h % 12) + m / 60) * 30
  const minute = m * 6
  return (
    <div
      aria-hidden="true"
      className="relative flex size-[112px] items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.22)]"
      style={{ background: 'radial-gradient(circle at 30% 25%, #ffffff 0%, #f7f7f7 60%, #ececec 100%)' }}
    >
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="#fff" stroke="#222" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="40" y1="8.5" x2="40" y2={i % 3 === 0 ? 14 : 11.5} stroke={i % 3 === 0 ? '#222' : '#c1c1c1'} strokeWidth="2.25" strokeLinecap="round" transform={`rotate(${i * 30} 40 40)`} />
        ))}
        <line className="ck-hand" x1="40" y1="40" x2="40" y2="22" stroke="#222" strokeWidth="4" strokeLinecap="round" style={{ transform: `rotate(${hour}deg)`, ['--ck-from' as string]: `${hour - 90}deg` }} />
        <line className="ck-hand" x1="40" y1="40" x2="40" y2="15" stroke="#d50b40" strokeWidth="3" strokeLinecap="round" style={{ transform: `rotate(${minute}deg)`, ['--ck-from' as string]: `${minute - 300}deg` }} />
        <circle cx="40" cy="40" r="3.5" fill="#d50b40" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

/** "07:30 yesterday", "10:15 today", "07:31 on Thu 19 Nov". */
const timeOnDay = (at: number, now: number) => {
  const label = dayLabel(londonDate(at), now)
  return `${ukClock(new Date(at))} ${/^(Today|Yesterday)$/.test(label) ? label.toLowerCase() : `on ${label}`}`
}

/**
 * "You didn't check out": shown before Home when the person's last shift is still open well past
 * its end. One tap saves the expected end; or pick the time they left (between check-in and
 * now, at most 24 hours later). Either way it's confirmed with Face ID and marked for the
 * coordinator. "I'm still here" appears only while an ordinary check-out would still work.
 */
export function ForgottenScreen({ session, platform, busy, notice, saved, onReport, onStillHere, onDone }: {
  session: ForgottenCheckout
  platform: Platform
  busy: boolean
  notice: ForgottenNotice
  /** Set once the check-out is saved. */
  saved: { at: string } | null
  /** Called straight from the tap (it opens Face ID). */
  onReport: (leftAt: Date) => void
  onStillHere?: () => void
  onDone: () => void
}) {
  const unlock = unlockCopy(platform)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const bounds = useMemo(() => leftAtBounds(session.checkInAt, now), [session.checkInAt, now])
  const days = useMemo(() => dayOptions(bounds, now), [bounds, now])
  const suggested = suggestedLeftAt(session.expectedEndAt, bounds)
  const checkIn = Date.parse(session.checkInAt)
  const end = new Date(session.expectedEndAt)
  const endClock = ukClock(end)

  const [picking, setPicking] = useState(suggested === null)
  const [pick, setPick] = useState(() => initialPick(session.expectedEndAt, bounds))
  const [problem, setProblem] = useState<string | null>(null)
  const timeRef = useRef<HTMLInputElement>(null)
  const pickerHeading = useRef<HTMLHeadingElement>(null)
  const ids = useId()

  const day = days.find((d) => d.date === pick.date) ?? days[days.length - 1]
  const picked = day ? leftAtFrom(day.date, pick.time) : null
  const pickedClock = picked ? ukClock(picked) : pick.time

  const openPicker = () => {
    setPicking(true)
    setProblem(null)
    requestAnimationFrame(() => pickerHeading.current?.focus({ preventScroll: false }))
  }

  const savePicked = () => {
    if (!picked) {
      setProblem('Enter the time you left, like 20:00.')
      timeRef.current?.focus()
      return
    }
    const check = checkLeftAt(picked.getTime(), leftAtBounds(session.checkInAt, Date.now()))
    if (check !== 'ok') {
      setProblem(check === 'too_early'
        ? `Choose a time after you checked in (${ukClock(new Date(checkIn))}).`
        : bounds.max < checkIn + 24 * 3600_000
          ? 'That time hasn’t happened yet.'
          : `Choose a time within 24 hours of checking in (by ${timeOnDay(bounds.max, now)}).`)
      timeRef.current?.focus()
      return
    }
    setProblem(null)
    onReport(picked)
  }

  if (saved) {
    const at = Date.parse(saved.at)
    const message = `Check-out saved · ${ukClock(new Date(at))}`
    return (
      <div className="ck-screen flex flex-1 flex-col">
        <LiveAnnouncer message={`${message}. Marked for your coordinator to confirm.`} />
        <div className="flex flex-1 flex-col items-center pt-6 text-center">
          <SuccessMark />
          <ScreenTitle className="mt-5" sub={`You left ${dayPhrase(at, now)} at ${ukClock(new Date(at))}. It’s marked for your coordinator to confirm — there’s nothing else you need to do.`}>
            {message}
          </ScreenTitle>
        </div>
        <div className="mx-auto mt-8 w-full max-w-[440px]">
          <BigButton variant="ink" onClick={onDone}>Done</BigButton>
        </div>
      </div>
    )
  }

  const endSentence = session.shiftLabel
    ? `Your shift ended at ${endClock}.`
    : `You checked in at ${ukClock(new Date(checkIn))}, so we expected you to leave around ${endClock}.`

  return (
    <div className="ck-screen ck-split flex flex-1 flex-col gap-x-10 min-[640px]:grid min-[640px]:grid-cols-2 min-[640px]:items-start">
      <div className="flex flex-col min-[640px]:sticky min-[640px]:top-4">
        <div className="pt-2 [@media(max-height:720px)]:hidden min-[640px]:pt-6">
          <EndClock at={end} />
        </div>
        <ScreenTitle className="mt-5 [@media(max-height:720px)]:mt-1" sub={endSentence}>
          You didn’t check out after your shift {dayPhrase(checkIn, now)}
        </ScreenTitle>

        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-card bg-canvas shadow-card">
          <div className="min-w-0 px-4 py-3.5">
            <dt className="text-xs font-semibold text-muted">Checked in</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-tight text-ink">{ukClock(new Date(checkIn))}</dd>
            <dd className="text-sm text-muted">{dayLabel(londonDate(checkIn), now)}</dd>
          </div>
          <div className="min-w-0 border-l border-hairline-soft px-4 py-3.5">
            <dt className="text-xs font-semibold text-muted">{session.shiftLabel ? 'Shift' : 'Expected end'}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-tight text-ink">{session.shiftLabel ?? endClock}</dd>
            <dd className="text-sm text-muted">{session.shiftLabel ? `Ended ${dayLabel(londonDate(end.getTime()), now).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())}` : `${dayLabel(londonDate(end.getTime()), now)}`}</dd>
          </div>
        </dl>
      </div>

      <div className="ck-seg-end flex flex-1 flex-col min-[640px]:pt-6">
        {notice ? (
          <Notice tone={notice.tone} role="alert" title={notice.title} className="mt-5 min-[640px]:mt-0">{notice.message}</Notice>
        ) : null}

        {!picking && suggested !== null ? (
          <section aria-labelledby={`${ids}-q`} className="mt-6 flex flex-col min-[640px]:mt-0 min-[640px]:[&:not(:first-child)]:mt-5">
            <h2 id={`${ids}-q`} className="text-lg font-semibold tracking-[-0.01em] text-ink">When did you leave?</h2>
            <div className="mt-3 grid gap-2.5">
              <BigButton
                variant="primary"
                busy={busy}
                icon={<UnlockIcon platform={platform} />}
                describedBy={`${ids}-hint`}
                onClick={() => onReport(new Date(suggested))}
              >
                I left at {ukClock(new Date(suggested))}
              </BigButton>
              <BigButton variant="secondary" disabled={busy} icon={<Clock3 className="size-5" aria-hidden="true" />} onClick={openPicker}>
                I left at a different time
              </BigButton>
            </div>
            <p id={`${ids}-hint`} className="mt-2.5 text-center text-[0.8125rem] text-muted">Confirm with {unlock.name}</p>
          </section>
        ) : (
          <section aria-labelledby={`${ids}-pick`} className="mt-6 flex flex-col min-[640px]:mt-0 min-[640px]:[&:not(:first-child)]:mt-5">
            <div className="flex items-center gap-1">
              {suggested !== null ? (
                <button
                  type="button"
                  onClick={() => { setPicking(false); setProblem(null) }}
                  aria-label="Back to the suggested time"
                  disabled={busy}
                  className="ui-press -ml-2.5 flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-strong"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </button>
              ) : null}
              <h2 id={`${ids}-pick`} ref={pickerHeading} tabIndex={-1} className="text-lg font-semibold tracking-[-0.01em] text-ink outline-none">
                What time did you leave?
              </h2>
            </div>

            <div className="mt-3 rounded-card bg-canvas p-4 shadow-card">
              {days.length > 1 ? (
                <div role="radiogroup" aria-label="Day you left" className="mb-3 grid gap-1 rounded-control bg-surface-strong p-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                  {days.map((d) => {
                    const on = d.date === day?.date
                    return (
                      <button
                        key={d.date}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={busy}
                        onClick={() => { setPick((p) => ({ date: d.date, time: clampTime(p.time, d) })); setProblem(null) }}
                        className={`ui-press min-h-11 rounded-inner px-2 text-[0.9375rem] font-semibold transition-colors ${on ? 'bg-canvas text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-muted hover:text-ink'}`}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <label htmlFor={`${ids}-time`} className="block text-sm font-semibold text-ink">
                Time you left{day && days.length === 1 ? <span className="font-normal text-muted"> · {day.label}</span> : null}
              </label>
              <input
                ref={timeRef}
                id={`${ids}-time`}
                type="time"
                step={60}
                required
                value={pick.time}
                min={day?.minTime}
                max={day?.maxTime}
                disabled={busy}
                aria-invalid={problem ? true : undefined}
                aria-describedby={`${ids}-range${problem ? ` ${ids}-err` : ''}`}
                onChange={(e) => { setPick((p) => ({ ...p, time: e.target.value })); setProblem(null) }}
                className="ck-time mt-1.5 h-[4.5rem] w-full rounded-control border border-hairline bg-canvas px-4 text-center text-[2.25rem] font-semibold tracking-[-0.02em] text-ink tabular-nums outline-none transition-[border-color,box-shadow] hover:border-neutral-400 focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)] aria-invalid:border-danger-600"
              />
              <p id={`${ids}-range`} className="mt-2 text-[0.8125rem] leading-snug text-muted">
                Any time from {timeOnDay(bounds.min, now)} to {timeOnDay(bounds.max, now)}
              </p>
              {problem ? <p id={`${ids}-err`} role="alert" className="mt-1.5 text-sm font-medium text-danger-700">{problem}</p> : null}
            </div>

            <BigButton
              className="mt-3"
              variant="primary"
              busy={busy}
              icon={<UnlockIcon platform={platform} />}
              describedBy={`${ids}-hint`}
              onClick={savePicked}
            >
              Save {pickedClock}{day && days.length > 1 ? ` ${/^(Today|Yesterday)$/.test(day.label) ? day.label.toLowerCase() : `on ${day.label}`}` : ''}
            </BigButton>
            <p id={`${ids}-hint`} className="mt-2.5 text-center text-[0.8125rem] text-muted">Confirm with {unlock.name}</p>
          </section>
        )}

        {onStillHere ? (
          <div className="mt-4 flex justify-center">
            <TextLink onClick={onStillHere}>I’m still at work</TextLink>
          </div>
        ) : null}

        <p className="mt-auto flex gap-2 pt-6 text-[0.8125rem] leading-relaxed text-muted text-pretty">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your coordinator will see this time was entered later and confirm it.
        </p>
      </div>
    </div>
  )
}

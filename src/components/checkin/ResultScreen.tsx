import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Clock3, LocateFixed, MapPinOff, Undo2 } from 'lucide-react'
import { formatTime } from '#/utils/dateTime'
import { unlockCopy, type Platform } from '#/lib/platform'
import { actionHeadline, evidenceItems, flagNotes, type ActionLike } from './copy'
import { SuccessMark } from './Illustrations'
import { InstallCard } from './InstallCard'
import { BigButton, LiveAnnouncer, Notice, ScreenTitle } from './ui'

export type ShownResult = ActionLike & { at: string }

export const UNDO_WINDOW_MS = 30_000

export function ResultScreen({
  result,
  enrolledOnly,
  name,
  platform,
  locationCheck,
  pending,
  approximate,
  undo,
  showInstall,
  onDone,
}: {
  /** null when the phone was set up without checking in. */
  result: ShownResult | null
  enrolledOnly?: { alreadyIn: boolean }
  name: string
  platform: Platform
  locationCheck: boolean
  pending: boolean
  approximate: boolean
  undo: { until: number; busy: boolean; onUndo: () => void; viaFaceId: boolean } | null
  showInstall: boolean
  onDone: () => void
}) {
  const unlock = unlockCopy(platform)
  const undone = result?.action === 'checkin_undone' || result?.action === 'checkout_undone'
  const items = result ? evidenceItems(result, unlock, locationCheck) : []
  const notes = result ? flagNotes(result, unlock, locationCheck) : []
  const time = result ? formatTime(result.at) : ''
  const headline = result ? actionHeadline(result.action) : 'Your phone is set up'
  const sub = result
    ? undone
      ? result.action === 'checkout_undone' ? 'You’re still checked in.' : 'You’re not checked in.'
      : `${name} · ${time}`
    : enrolledOnly?.alreadyIn
      ? `${name} · you were already checked in`
      : `${name} · next time, just slide to check in`
  const locationNote = result?.location === 'denied' || result?.location === 'unavailable' || result?.location === 'outside'

  return (
    <div className="ck-screen flex flex-1 flex-col">
      <LiveAnnouncer message={result ? `${headline}${undone ? '' : ` at ${time}`}` : headline} />
      <div className="flex flex-col items-center pt-6 text-center">
        <SuccessMark tone={undone ? 'neutral' : 'success'} />
        <ScreenTitle className="mt-5" sub={sub}>{headline}</ScreenTitle>
      </div>

      {items.length > 0 ? (
        <ul className="ck-stagger mt-5 flex flex-wrap justify-center gap-2" aria-label="How this was confirmed">
          {items.map((item) => (
            <li
              key={item.key}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset ${item.ok ? 'bg-success-50 text-success-800 ring-success-200' : 'bg-warning-50 text-warning-800 ring-warning-200'}`}
            >
              {item.ok
                ? <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                : <AlertTriangle className="size-4" strokeWidth={2.25} aria-hidden="true" />}
              <span className="sr-only">{item.ok ? 'Confirmed: ' : 'Not confirmed: '}</span>
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      {pending && !undone ? (
        <p className="mx-auto mt-4 max-w-[19rem] text-center text-sm leading-relaxed text-muted text-balance">
          <Clock3 className="mr-1.5 -mt-0.5 inline size-4 align-middle" aria-hidden="true" />
          New phone — the coordinator will confirm it’s yours. Nothing you need to do.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {notes.length > 0 ? (
          <Notice tone="warning" title={undone ? undefined : result?.action === 'check_out' ? 'You’re still checked out' : 'You’re still checked in'}>
            {notes.join(' ')} The coordinator may look at it — there’s nothing you need to do.
          </Notice>
        ) : null}
        {approximate ? (
          <Notice tone="neutral" icon={<LocateFixed className="size-5" />} title="Turn on Precise Location for InOut">
            {platform === 'ios'
              ? 'Your phone is only sharing an approximate location. Settings › Privacy & Security › Location Services › Safari Websites › turn on Precise Location.'
              : 'Your phone is only sharing an approximate location. Allow precise location for this site in your browser’s site settings.'}
          </Notice>
        ) : result?.location === 'denied' && locationNote ? (
          <Notice tone="neutral" icon={<MapPinOff className="size-5" />} title="To allow location next time">
            {platform === 'ios'
              ? 'Settings › Privacy & Security › Location Services: make sure it’s on, and Safari Websites is set to “While Using”.'
              : platform === 'android'
                ? 'Tap the icon beside the address bar › Permissions › Location › Allow.'
                : 'Allow location for this site in your browser’s settings.'}
          </Notice>
        ) : null}
        {showInstall ? <InstallCard /> : null}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 bg-gradient-to-t from-surface-soft from-70% to-surface-soft/0 px-5 pt-8 pb-1">
        {undo ? <UndoButton {...undo} unlockName={unlock.name} /> : null}
        <BigButton variant={undo ? 'secondary' : 'ink'} onClick={onDone}>Done</BigButton>
      </div>
    </div>
  )
}

function UndoButton({ until, busy, onUndo, viaFaceId, unlockName }: {
  until: number
  busy: boolean
  onUndo: () => void
  viaFaceId: boolean
  unlockName: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  if (left === 0 && !busy) return null
  const fraction = left / (UNDO_WINDOW_MS / 1000)
  const C = 2 * Math.PI * 9
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        className="ui-press inline-flex min-h-12 items-center justify-center gap-2.5 rounded-control px-5 text-[0.9375rem] font-semibold text-ink hover:bg-surface-strong disabled:opacity-60"
        aria-describedby="ck-undo-hint"
      >
        {busy ? (
          <span className="spinner size-5 rounded-full border-2 border-ink border-r-transparent" aria-hidden="true" />
        ) : (
          <span className="relative flex size-6 items-center justify-center" aria-hidden="true">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="#dddddd" strokeWidth="2" />
              <circle className="ck-countdown" cx="12" cy="12" r="9" fill="none" stroke="#222222" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} />
            </svg>
            <Undo2 className="size-3" strokeWidth={2.5} />
          </span>
        )}
        Undo
        <span className="tabular-nums text-muted" aria-hidden="true">{left}s</span>
      </button>
      <p id="ck-undo-hint" className="text-xs text-muted">
        {viaFaceId ? `Confirm with ${unlockName} to undo` : `${left} seconds to undo`}
      </p>
    </div>
  )
}

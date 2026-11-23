import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LocateFixed, MapPin, MapPinOff, Navigation, RefreshCw, Settings2 } from 'lucide-react'
import { previewLocation, type PublicArea } from '#/utils/passkeys.functions'
import type { LocationPreview } from '#/utils/location'
import { startLocationSampler, type LocationPermission, type SampleResult } from '#/lib/geolocation'
import { locationExplained, locationWorked, markLocationExplained, markLocationWorked } from '#/lib/checkinStorage'
import type { Platform } from '#/lib/platform'
import { MapChip, StaffMap, type StaffMapTone } from './StaffMap'

export type LocationFix = { sample: SampleResult; at: number }

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; preview: LocationPreview; sample: SampleResult; at: number }
  | { kind: 'blocked' }
  | { kind: 'error' }

const STALE_MS = 2 * 60 * 1000

/**
 * "Are you in the department?" — a live, on-screen location check before anyone slides: a small
 * map of the department with the person's own dot, and a plain-words verdict. Same rule as
 * check-in, evaluated on the server, nothing stored. Starts by itself only when the phone has
 * already granted location to InOut; when the phone has blocked it, offers the "Turn on
 * location" steps instead of asking again.
 */
export function LocationStatus({ token, platform, area, permission, onFix, onArea, onBlocked, onTurnOn, compact = false }: {
  token: string | null
  platform: Platform
  /** The department, for the map. `undefined` while loading. */
  area: PublicArea | null | undefined
  permission: LocationPermission
  /** A fresh reading the check-in can reuse instead of asking again. */
  onFix?: (fix: LocationFix) => void
  onArea?: (area: PublicArea | null) => void
  /** The phone refused location just now. */
  onBlocked?: () => void
  /** Open the "Turn on location" steps. */
  onTurnOn: () => void
  /** On shift: a settled, in-the-department result folds into one line, and notes talk about checking out. */
  compact?: boolean
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const stopRef = useRef<(() => void) | null>(null)
  const runId = useRef(0)

  const check = useCallback(() => {
    if (!token) return
    markLocationExplained()
    stopRef.current?.()
    const id = ++runId.current
    setState({ kind: 'checking' })
    const sampler = startLocationSampler()
    stopRef.current = sampler.stop
    void sampler.result.then(async (sample) => {
      if (id !== runId.current) return
      if (sample.reading.status === 'denied') {
        setState({ kind: 'blocked' })
        onBlocked?.()
        return
      }
      try {
        const res = await previewLocation({ data: { token, location: sample.reading } })
        if (id !== runId.current) return
        const at = Date.now()
        if (sample.reading.status === 'ok') markLocationWorked()
        const { area: a, ...preview } = res
        onArea?.(a)
        setState({ kind: 'done', preview, sample, at })
        onFix?.({ sample, at })
      } catch {
        if (id === runId.current) setState({ kind: 'error' })
      }
    })
  }, [onArea, onBlocked, onFix, token])

  // Start by itself only when location is already allowed (no surprise first-time prompt); show
  // the blocked state straight away when the phone has refused it.
  const started = useRef(false)
  useEffect(() => {
    if (permission === 'denied') {
      runId.current++
      stopRef.current?.()
      setState({ kind: 'blocked' })
      return
    }
    // Allowed, or (iOS, which says "prompt" until asked) this phone has shared location with InOut before.
    const allowed = permission === 'granted' || (platform === 'ios' && locationWorked())
    if (allowed && locationExplained() && token) {
      // First mount, or location was just turned back on.
      if (!started.current || state.kind === 'blocked') {
        started.current = true
        check()
      }
    }
    // Only permission changes start a check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, platform, token])

  useEffect(() => () => {
    runId.current++
    stopRef.current?.()
    // A remount (React's development double-mount, or Home coming back) starts its own check.
    started.current = false
  }, [])

  // Coming back to the app after a while: refresh a result that has gone stale.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && state.kind === 'done' && Date.now() - state.at > STALE_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check, state])

  const view = describe(state, platform, compact ? 'out' : 'in')
  const position = state.kind === 'done' && state.sample.reading.status === 'ok' && (state.preview.outcome === 'inside' || state.preview.outcome === 'outside')
    ? { latitude: state.sample.reading.latitude, longitude: state.sample.reading.longitude, accuracy: state.sample.reading.accuracy }
    : null
  const canRecheck = state.kind !== 'checking' && state.kind !== 'blocked' && state.kind !== 'idle' && !!token
  const outside = state.kind === 'done' && state.preview.outcome === 'outside'
  // On shift, a settled result folds into one line; anything to act on keeps the map.
  const folded = compact && (state.kind === 'idle' || state.kind === 'checking' || (state.kind === 'done' && state.preview.outcome === 'inside'))

  const recheck = canRecheck ? (
    <button
      type="button"
      onClick={check}
      aria-label="Check my location again"
      className="ui-press pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full bg-canvas/95 text-ink shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)] backdrop-blur-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <RefreshCw className="size-[18px]" aria-hidden="true" />
    </button>
  ) : null

  // Announced once per change; the visible chip and note carry the same words.
  const live = (
    <p id="ck-loc-title" className="sr-only" aria-live="polite" aria-busy={state.kind === 'checking' || undefined}>
      {view.title}. {view.sub}
    </p>
  )

  if (folded || area === null) {
    return (
      <div className="flex items-center gap-3 border-b border-hairline-soft px-4 py-3">
        {live}
        <Badge tone={view.tone} active={state.kind === 'checking'} icon={view.icon} small={folded} />
        <div className="min-w-0 flex-1" aria-hidden="true">
          <p className="text-[0.9375rem] font-semibold leading-snug text-ink text-pretty">{folded ? (view.chip ?? view.title) : view.title}</p>
          {!folded && view.note ? <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted text-pretty">{view.note}</p> : null}
        </div>
        {state.kind === 'idle' ? <CheckButton onClick={check} disabled={!token} /> : null}
        {canRecheck ? (
          <button type="button" onClick={check} aria-label="Check my location again" className="ui-press grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <RefreshCw className="size-[18px]" aria-hidden="true" />
          </button>
        ) : null}
        {state.kind === 'blocked' ? <TurnOnButton onClick={onTurnOn} small /> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {live}
      <StaffMap
        area={area}
        position={position}
        tone={view.mapTone}
        scanning={state.kind === 'checking'}
        label={view.mapLabel}
        height={outside ? 'var(--ck-map-lg)' : 'var(--ck-map-h)'}
        overlay={view.chip ? <MapChip tone={view.chipTone} icon={view.chipIcon}>{view.chip}</MapChip> : null}
        action={recheck}
        className={state.kind === 'blocked' ? 'shrink-0 [&_.leaflet-tile-pane]:opacity-60' : 'shrink-0'}
      />
      {state.kind === 'idle' ? (
        <div className="flex items-center gap-3 border-b border-hairline-soft px-4 py-3 min-[640px]:border-b-0">
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted text-pretty" aria-hidden="true">{view.note}</p>
          <CheckButton onClick={check} disabled={!token} />
        </div>
      ) : state.kind === 'blocked' ? (
        <div className="flex flex-col gap-2.5 border-b border-hairline-soft px-4 py-3.5 min-[640px]:border-b-0">
          <p className="text-[0.8125rem] leading-snug text-muted text-pretty" aria-hidden="true">{view.note}</p>
          <TurnOnButton onClick={onTurnOn} />
        </div>
      ) : view.note ? (
        <p className="border-b border-hairline-soft px-4 py-3 text-[0.8125rem] leading-snug text-muted text-pretty min-[640px]:border-b-0" aria-hidden="true">{view.note}</p>
      ) : null}
    </div>
  )
}

function CheckButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Check my location"
      className="ui-press inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45"
    >
      <LocateFixed className="size-4" aria-hidden="true" />
      Check
    </button>
  )
}

function TurnOnButton({ onClick, small = false }: { onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-press inline-flex shrink-0 items-center justify-center gap-2 bg-ink font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${small ? 'min-h-11 rounded-full px-4 text-sm' : 'min-h-12 w-full rounded-control px-4 text-[0.9375rem]'}`}
    >
      <Settings2 className={small ? 'size-4' : 'size-[18px]'} aria-hidden="true" />
      Turn on location
    </button>
  )
}

type Tone = 'neutral' | 'success' | 'warning'
type Icon = 'pin' | 'check' | 'away' | 'off'
type View = {
  /** Spoken summary, and the visible line when there's no map. */
  title: string
  sub: string
  /** Short visible text under the map, only when there's something to know or do. */
  note?: string
  tone: Tone
  icon: Icon
  mapTone: StaffMapTone
  mapLabel: string
  chip?: string
  chipTone?: StaffMapTone
  chipIcon?: React.ReactNode
}

function describe(state: State, platform: Platform, next: 'in' | 'out'): View {
  const areaLabel = 'Map of the department area.'
  if (state.kind === 'idle') {
    return {
      tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: `${areaLabel} Your location hasn’t been checked yet.`,
      title: 'Are you in the department?', sub: 'Checks your location once. Where you are is never stored.',
      note: 'Checked once, never stored.',
      chip: 'Check-in area', chipTone: 'brand', chipIcon: <MapPin className="text-accent-accessible" />,
    }
  }
  if (state.kind === 'checking') {
    return {
      tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: `${areaLabel} Finding your location.`,
      title: 'Checking your location', sub: 'This takes a few seconds.',
      chip: 'Checking location…', chipTone: 'brand', chipIcon: <LocateFixed className="text-accent-accessible" />,
    }
  }
  if (state.kind === 'blocked') {
    return {
      tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: `${areaLabel} Location is turned off, so your position isn’t shown.`,
      title: 'Location is off for InOut', sub: `It’s needed to check ${next}.`,
      note: `Needed to check ${next}. It takes a few taps.`,
      chip: 'Location off', chipTone: 'warning', chipIcon: <MapPinOff />,
    }
  }
  if (state.kind === 'error') {
    return {
      tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: areaLabel,
      title: 'Couldn’t check your location', sub: 'No connection right now. Try again in a moment.',
      note: 'No connection. Try again in a moment.',
      chip: 'Not checked', chipTone: 'warning', chipIcon: <MapPinOff />,
    }
  }
  const { preview, sample } = state
  const accuracy = preview.accuracyM ? `, to within ${preview.accuracyM} m` : ''
  switch (preview.outcome) {
    case 'inside':
      return {
        tone: 'success', icon: 'check', mapTone: 'success', mapLabel: `${areaLabel} Your position is inside the area.`,
        title: 'You’re in the department', sub: `Location confirmed${accuracy}.`,
        chip: 'In the department', chipTone: 'success', chipIcon: <Check strokeWidth={3} />,
      }
    case 'outside': {
      const away = preview.awayM ? `About ${formatDistance(preview.awayM)} away` : 'Outside the area'
      return {
        tone: 'warning', icon: 'away', mapTone: 'warning', mapLabel: `${areaLabel} Your position is outside the area${preview.awayM ? `, about ${formatDistance(preview.awayM)} from its edge` : ''}.`,
        title: preview.awayM ? `About ${formatDistance(preview.awayM)} from the department` : 'You’re outside the department',
        sub: `You can still check ${next}. It’ll be marked for the coordinator.`,
        note: `You can still check ${next}. It’ll be marked for the coordinator.`,
        chip: away, chipTone: 'warning', chipIcon: <Navigation />,
      }
    }
    case 'denied':
      return {
        tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: areaLabel,
        title: 'Location is off for InOut', sub: `It’s needed to check ${next}.`,
        note: `Needed to check ${next}. Turn it on in your phone’s settings.`,
        chip: 'Location off', chipTone: 'warning', chipIcon: <MapPinOff />,
      }
    case 'unavailable': {
      const tip = sample.approximate
        ? platform === 'ios'
          ? 'Turn on Precise Location: Settings › Privacy & Security › Location Services › Safari Websites.'
          : 'Turn on “Use precise location” for your browser in Settings › Apps › Permissions.'
        : platform === 'android'
          ? 'Check Location is on in quick settings, or move near a window.'
          : 'Indoor signal is weak. Move near a window and try again.'
      return {
        tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: `${areaLabel} Your phone couldn’t get a precise position.`,
        title: sample.approximate ? 'Only approximate location is on' : 'Couldn’t get a precise fix',
        sub: tip, note: tip,
        chip: sample.approximate ? 'Approximate only' : 'Not precise enough', chipTone: 'warning', chipIcon: <LocateFixed />,
      }
    }
    default:
      return {
        tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: areaLabel,
        title: 'Location check isn’t set up', sub: `You can still check ${next}.`, note: `Location check isn’t set up. You can still check ${next}.`,
      }
  }
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${m} m`
}

/** Status icon in a soft disc; while checking, rings pulse outwards like a radar sweep. */
function Badge({ tone, active, icon, small = false }: { tone: Tone; active: boolean; icon: Icon; small?: boolean }) {
  const disc = tone === 'success' ? 'bg-success-accessible text-white' : tone === 'warning' ? 'bg-warning-100 text-warning-800' : 'bg-primary-50 text-accent-accessible'
  const I = icon === 'check' ? Check : icon === 'away' ? Navigation : icon === 'off' ? MapPinOff : MapPin
  return (
    <span className={`relative grid shrink-0 place-items-center ${small ? 'size-8' : 'size-11'}`} aria-hidden="true">
      {active ? (
        <>
          <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/25" />
          <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/25 [animation-delay:700ms]" />
        </>
      ) : null}
      <span className={`relative grid place-items-center rounded-full ${small ? 'size-8' : 'size-11'} ${disc} ${tone === 'success' ? 'animate-pop' : ''}`}>
        <I className={small ? 'size-4' : 'size-5'} strokeWidth={2.25} />
      </span>
    </span>
  )
}

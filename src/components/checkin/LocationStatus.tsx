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
export function LocationStatus({ token, platform, area, permission, onFix, onArea, onBlocked, onTurnOn }: {
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
  }, [])

  // Coming back to the app after a while: refresh a result that has gone stale.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && state.kind === 'done' && Date.now() - state.at > STALE_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check, state])

  const view = describe(state, platform)
  const position = state.kind === 'done' && state.sample.reading.status === 'ok' && (state.preview.outcome === 'inside' || state.preview.outcome === 'outside')
    ? { latitude: state.sample.reading.latitude, longitude: state.sample.reading.longitude, accuracy: state.sample.reading.accuracy }
    : null

  return (
    <section aria-labelledby="ck-loc-title" className="overflow-hidden rounded-card bg-canvas shadow-card">
      {area !== null ? (
        <StaffMap
          area={area}
          position={position}
          tone={view.mapTone}
          scanning={state.kind === 'checking'}
          label={view.mapLabel}
          overlay={view.chip ? <MapChip tone={view.chipTone} icon={view.chipIcon}>{view.chip}</MapChip> : null}
          className={state.kind === 'blocked' ? '[&_.leaflet-tile-pane]:opacity-60 [&_.leaflet-tile-pane]:grayscale' : undefined}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3.5 p-4">
        {/* With the map, its chip already carries the status icon. */}
        {area === null ? <Badge tone={view.tone} active={state.kind === 'checking'} icon={view.icon} /> : null}
        <div className="min-w-[min(9.5rem,100%)] flex-1" aria-live="polite" aria-busy={state.kind === 'checking' || undefined}>
          <h2 id="ck-loc-title" className="text-[0.9375rem] font-semibold leading-snug text-ink text-pretty">{view.title}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted text-pretty">{view.sub}</p>
        </div>
        {state.kind === 'checking' || state.kind === 'blocked' ? null : (
          <button
            type="button"
            onClick={check}
            disabled={!token}
            aria-label={state.kind === 'idle' ? 'Check my location' : 'Check my location again'}
            className="ui-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold text-ink ring-1 ring-inset ring-hairline hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45"
          >
            {state.kind === 'idle' ? <LocateFixed className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            <span aria-hidden="true" className={state.kind === 'idle' ? '' : 'max-[380px]:hidden'}>{state.kind === 'idle' ? 'Check' : 'Again'}</span>
          </button>
        )}
      </div>
      {state.kind === 'blocked' ? (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onTurnOn}
            className="ui-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ink px-4 text-[0.9375rem] font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Settings2 className="size-[18px]" aria-hidden="true" />
            Turn on location
          </button>
        </div>
      ) : null}
    </section>
  )
}

type Tone = 'neutral' | 'success' | 'warning'
type Icon = 'pin' | 'check' | 'away' | 'off'
type View = {
  title: string
  sub: string
  tone: Tone
  icon: Icon
  mapTone: StaffMapTone
  mapLabel: string
  chip?: string
  chipTone?: StaffMapTone
  chipIcon?: React.ReactNode
}

function describe(state: State, platform: Platform): View {
  const areaLabel = 'Map of the department area.'
  if (state.kind === 'idle') {
    return {
      tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: `${areaLabel} Your location hasn’t been checked yet.`,
      title: 'Are you in the department?', sub: 'Checks your location once. Where you are is never stored.',
      chip: 'Check-in area', chipTone: 'brand', chipIcon: <MapPin className="text-accent-accessible" />,
    }
  }
  if (state.kind === 'checking') {
    return {
      tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: `${areaLabel} Finding your location.`,
      title: 'Finding your location…', sub: 'Getting the most accurate fix — a few seconds.',
      chip: 'Locating…', chipTone: 'brand', chipIcon: <LocateFixed className="text-accent-accessible" />,
    }
  }
  if (state.kind === 'blocked') {
    return {
      tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: `${areaLabel} Location is turned off, so your position isn’t shown.`,
      title: 'Location is off for InOut',
      sub: 'It’s needed to check in. Turn it on — it takes a few taps.',
      chip: 'Location off', chipTone: 'warning', chipIcon: <MapPinOff />,
    }
  }
  if (state.kind === 'error') {
    return {
      tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: areaLabel,
      title: 'Couldn’t check your location', sub: 'No connection right now. Try again in a moment.',
    }
  }
  const { preview, sample } = state
  const accuracy = preview.accuracyM ? ` · ±${preview.accuracyM} m` : ''
  switch (preview.outcome) {
    case 'inside':
      return {
        tone: 'success', icon: 'check', mapTone: 'success', mapLabel: `${areaLabel} Your position is inside the area.`,
        title: 'You’re in the department', sub: `Your check-in will be confirmed${accuracy}`,
        chip: 'In the department', chipTone: 'success', chipIcon: <Check strokeWidth={3} />,
      }
    case 'outside': {
      const away = preview.awayM ? `About ${formatDistance(preview.awayM)} away` : 'Outside the area'
      return {
        tone: 'warning', icon: 'away', mapTone: 'warning', mapLabel: `${areaLabel} Your position is outside the area${preview.awayM ? `, about ${formatDistance(preview.awayM)} from its edge` : ''}.`,
        title: preview.awayM ? `About ${formatDistance(preview.awayM)} from the department` : 'You’re outside the department',
        sub: 'You can still check in — it’ll be marked for the coordinator.',
        chip: away, chipTone: 'warning', chipIcon: <Navigation />,
      }
    }
    case 'denied':
      return {
        tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: areaLabel,
        title: 'Location is off for InOut', sub: 'It’s needed to check in. Turn it on — it takes a few taps.',
        chip: 'Location off', chipTone: 'warning', chipIcon: <MapPinOff />,
      }
    case 'unavailable':
      return {
        tone: 'warning', icon: 'off', mapTone: 'neutral', mapLabel: `${areaLabel} Your phone couldn’t get a precise position.`,
        title: sample.approximate ? 'Only approximate location is on' : 'Couldn’t get a precise fix',
        sub: sample.approximate
          ? platform === 'ios'
            ? 'Turn on Precise Location for Safari Websites in Settings › Privacy & Security › Location Services.'
            : 'Turn on “Use precise location” for your browser in Settings › Apps › Permissions.'
          : platform === 'android'
            ? 'Check Location is on in your quick settings, or move near a window and try again.'
            : 'Indoor signal is weak. Move near a window and try again.',
        chip: 'Not precise enough', chipTone: 'warning', chipIcon: <LocateFixed />,
      }
    default:
      return { tone: 'neutral', icon: 'pin', mapTone: 'brand', mapLabel: areaLabel, title: 'Location check isn’t set up', sub: 'Nothing to compare against yet. You can still check in.' }
  }
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${m} m`
}

/** Status icon in a soft disc; while checking, rings pulse outwards like a radar sweep. */
function Badge({ tone, active, icon }: { tone: Tone; active: boolean; icon: Icon }) {
  const disc = tone === 'success' ? 'bg-success-accessible text-white' : tone === 'warning' ? 'bg-warning-100 text-warning-800' : 'bg-primary-50 text-accent-accessible'
  const I = icon === 'check' ? Check : icon === 'away' ? Navigation : icon === 'off' ? MapPinOff : MapPin
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden="true">
      {active ? (
        <>
          <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/25" />
          <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/25 [animation-delay:700ms]" />
        </>
      ) : null}
      <span className={`relative grid size-11 place-items-center rounded-full ${disc} ${tone === 'success' ? 'animate-pop' : ''}`}>
        <I className="size-5" strokeWidth={2.25} />
      </span>
    </span>
  )
}

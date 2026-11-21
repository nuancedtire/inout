import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Crosshair,
  LocateFixed,
  LocateOff,
  Lock,
  MapPin,
  MapPinOff,
  MapPinned,
  Plus,
  Radar,
  ShieldCheck,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { AreaMap, type AreaMapHandle } from '#/components/maps/AreaMap'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { adminGetSiteSettings, adminSetSiteSettings } from '#/utils/staff.functions'
import { evaluateLocation, haversineMetres } from '#/utils/location'
import { LOCATION_LABEL, type LocationOutcome } from '#/utils/verification'
import { formatDateTime, formatTime, relativeTime } from '#/utils/dateTime'
import { useAdminContext } from '#/routes/admin/-context'
import type { SiteSettingsView } from '#/routes/admin/-types'
import { errorText, LoadError, Notice, Panel, PanelSkeleton, linkButtonClass } from './kit'
import { PlaceSearch, SUGGESTED_SITE } from './PlaceSearch'
import { geolocationProblem, useBestPosition, type Fix, type SamplerState } from './useBestPosition'
import { isAuthError } from './useDashboard'

const RADIUS = { min: 25, max: 2000, step: 5, fallback: 150 }
const CEILING = { min: 10, max: 500, step: 5, fallback: 100 }
const MAX_READINGS = 6

/** Native range input, restyled: ink fill up to the value, 24px thumb, 44px-tall hit area. */
const rangeClass = [
  'h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-offset-4 rounded-full',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--range-pct),var(--color-hairline)_var(--range-pct))]',
  '[&::-webkit-slider-thumb]:-mt-[9px] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-canvas [&::-webkit-slider-thumb]:shadow-card',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-hairline',
  '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-ink',
  '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-canvas',
].join(' ')

type Point = { latitude: number; longitude: number }

/** Precision-weighted centre of several readings: a ±5 m fix counts 16× more than a ±20 m one. */
export function weightedCentre(readings: Fix[]): Point | null {
  if (readings.length === 0) return null
  let w = 0
  let lat = 0
  let lng = 0
  for (const r of readings) {
    const weight = 1 / (r.accuracy * r.accuracy)
    w += weight
    lat += r.latitude * weight
    lng += r.longitude * weight
  }
  return { latitude: lat / w, longitude: lng / w }
}

function roundTo(value: number, step: number) {
  return Math.ceil(value / step) * step
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Local east/north offset in metres, for drawing only (outcomes use the haversine rule). */
function offsetMetres(from: Point, to: Point) {
  const north = haversineMetres(from, { latitude: to.latitude, longitude: from.longitude }) * Math.sign(to.latitude - from.latitude)
  const east = haversineMetres(from, { latitude: from.latitude, longitude: to.longitude }) * Math.sign(to.longitude - from.longitude)
  return { east, north }
}

const OUTCOME_UI: Record<LocationOutcome, { icon: LucideIcon; tone: string; title: string }> = {
  inside: { icon: MapPin, tone: 'border-success-200 bg-success-50 text-success-800', title: 'Location check would pass' },
  outside: { icon: MapPinOff, tone: 'border-warning-200 bg-warning-50 text-warning-800', title: 'Would be flagged: outside the area' },
  unavailable: { icon: LocateOff, tone: 'border-warning-200 bg-warning-50 text-warning-800', title: "Would be flagged: location couldn't be confirmed" },
  denied: { icon: LocateOff, tone: 'border-warning-200 bg-warning-50 text-warning-800', title: 'Would be flagged: permission refused' },
  not_requested: { icon: MapPinned, tone: 'border-hairline bg-surface-soft text-body', title: 'Set the centre first' },
}

export function LocationSetup() {
  const { authToken, logout } = useAdminContext()
  const [saved, setSaved] = useState<SiteSettingsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [readings, setReadings] = useState<Fix[]>([])
  const [radius, setRadius] = useState(RADIUS.fallback)
  const [ceiling, setCeiling] = useState(CEILING.fallback)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const [test, setTest] = useState<Fix | null>(null)
  /** A centre placed on the map (drag, tap, search or suggestion). Takes precedence over readings. */
  const [placed, setPlaced] = useState<{ point: Point; via: 'map' | 'search' } | null>(null)
  const [view, setView] = useState<'map' | 'diagram'>('map')
  const [mapProblem, setMapProblem] = useState<string | null>(null)
  const mapRef = useRef<AreaMapHandle>(null)
  const reading = useBestPosition()
  const tester = useBestPosition()
  const logoutRef = useRef(logout)
  logoutRef.current = logout
  const problem = useMemo(() => geolocationProblem(), [])

  const load = async () => {
    setLoadError(null)
    try {
      const site = await adminGetSiteSettings({ data: { authToken } })
      setSaved(site)
      setRadius(site.radiusM)
      setCeiling(site.accuracyCeilingM)
    } catch (e) {
      if (isAuthError(e)) logoutRef.current()
      setLoadError(errorText(e, 'Could not load the department area'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const savedCentre: Point | null =
    saved?.configured && saved.latitude !== null && saved.longitude !== null ? { latitude: saved.latitude, longitude: saved.longitude } : null
  const newCentre = weightedCentre(readings)
  const centre = placed?.point ?? newCentre ?? savedCentre
  const centreSource = placed ? (placed.via === 'search' ? 'from search' : 'placed on the map') : newCentre ? 'from your readings' : savedCentre ? 'saved' : null
  const spread = newCentre ? Math.max(0, ...readings.map((r) => haversineMetres(newCentre, r))) : 0
  const suggested = readings.length >= 2 && !placed ? clamp(roundTo(spread + 50, 25), 75, RADIUS.max) : null
  const dirty = !!saved && (!!placed || readings.length > 0 || radius !== saved.radiusM || ceiling !== saved.accuracyCeilingM)
  const busy = reading.state.status === 'sampling' || tester.state.status === 'sampling'

  const area = centre ? { ...centre, radiusM: radius, accuracyCeilingM: ceiling } : null
  const testResult = test ? evaluateLocation({ status: 'ok', ...test }, area) : null
  const testDistance = test && centre ? haversineMetres(centre, test) : null
  const liveFix = reading.state.status === 'sampling' ? reading.state.live : tester.state.status === 'sampling' ? tester.state.live : null

  const takeReading = async () => {
    setNotice(null)
    const fix = await reading.sample()
    if (fix) {
      setReadings((r) => [...r, fix].slice(-MAX_READINGS))
      setPlaced(null)
    }
  }

  const placeCentre = (point: Point, via: 'map' | 'search' = 'map') => {
    setNotice(null)
    setPlaced({ point, via })
  }

  const useSuggestion = () => {
    placeCentre(SUGGESTED_SITE.point, 'search')
    setRadius(SUGGESTED_SITE.radiusM)
    mapRef.current?.flyTo(SUGGESTED_SITE.point, 17)
  }

  const discard = () => {
    if (!saved) return
    setPlaced(null)
    setReadings([])
    reading.reset()
    setTest(null)
    setRadius(saved.radiusM)
    setCeiling(saved.accuracyCeilingM)
    setNotice(null)
    if (savedCentre) setTimeout(() => mapRef.current?.fitArea(), 0)
  }

  const runTest = async () => {
    setNotice(null)
    setTest(null)
    const fix = await tester.sample()
    if (fix) setTest(fix)
  }

  const save = async () => {
    if (!centre) return
    setSaving(true)
    setNotice(null)
    try {
      const site = await adminSetSiteSettings({
        data: {
          authToken,
          latitude: Number(centre.latitude.toFixed(6)),
          longitude: Number(centre.longitude.toFixed(6)),
          radiusM: radius,
          accuracyCeilingM: ceiling,
        },
      })
      setSaved(site)
      setReadings([])
      setPlaced(null)
      reading.reset()
      setNotice({ text: 'Department area saved. New check-ins use it straight away.', tone: 'success' })
    } catch (e) {
      if (isAuthError(e)) logoutRef.current()
      setNotice({ text: errorText(e, 'Could not save the area. Please try again.'), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <LoadError title="Could not load the department area" message={loadError} onRetry={load} />
  if (!saved) return <PanelSkeleton rows={3} />

  return (
    <div className="flex flex-col gap-5">
      {notice ? <Notice message={notice.text} tone={notice.tone} onClose={() => setNotice(null)} /> : null}

      <Panel
        tour="location-setup"
        title="Department area"
        icon={<MapPinned />}
        description="At each check-in and checkout the phone shares its position once. InOut compares it with this area, keeps only the outcome, and throws the position away."
        actions={
          <span
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset',
              saved.configured ? 'bg-success-50 text-success-800 ring-success-200' : 'bg-warning-50 text-warning-800 ring-warning-200',
            )}
          >
            {saved.configured ? <LocateFixed className="size-3.5" aria-hidden="true" /> : <LocateOff className="size-3.5" aria-hidden="true" />}
            {saved.configured ? 'Set up' : 'Not set up'}
          </span>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-x-8">
          <div className="flex min-w-0 flex-col gap-6">
            {!saved.configured ? (
              <p className="rounded-control bg-warning-50 px-4 py-3 text-sm text-warning-800">
                No area yet, so every check-in shows <strong className="font-semibold">“Location not checked”</strong>. Find the
                department on the map, or stand in it and take a reading.
              </p>
            ) : (
              <p className="text-sm text-muted">
                Last saved {relativeTime(saved.updatedAt)}
                {saved.updatedAt ? ` (${formatDateTime(saved.updatedAt)})` : ''}.
              </p>
            )}

            {/* Step 1 */}
            <Step
              n={1}
              title="Place the centre"
              hint="Search for the hospital, tap the map or drag the pin onto the department. This works from anywhere, so you don’t need to be on site."
            >
              <div className="flex flex-col gap-3 rounded-control border border-hairline-soft p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Or use your phone, inside the department</p>
                  <p className="text-sm leading-relaxed text-muted text-pretty">
                    Readings give the most precise centre. Take 2–4 at different spots, such as the entrance, majors and resus. InOut
                    averages them and trusts the most precise readings most.
                  </p>
                </div>
                {problem ? <p className="rounded-control bg-danger-50 px-4 py-3 text-sm text-danger-800">{problem}</p> : null}
                <SamplerCard state={reading.state} onStop={reading.stop} label="Taking a reading" />
                {readings.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-hairline-soft rounded-control border border-hairline-soft">
                    {readings.map((r, i) => (
                      <li key={r.at + i} className="flex items-center gap-3 px-4 py-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white tabular-nums" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm text-ink">
                          Reading {i + 1} <span className="text-muted">· ±{Math.round(r.accuracy)} m · {formatTime(new Date(r.at).toISOString())}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setReadings((list) => list.filter((_, j) => j !== i))}
                          aria-label={`Remove reading ${i + 1}`}
                          className={linkButtonClass}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={takeReading}
                    disabled={busy || !!problem || readings.length >= MAX_READINGS}
                    loading={reading.state.status === 'sampling'}
                  >
                    {reading.state.status === 'sampling' ? null : readings.length ? <Plus className="size-4" aria-hidden="true" /> : <Crosshair className="size-4" aria-hidden="true" />}
                    {readings.length ? 'Add another reading' : 'Use my current position'}
                  </Button>
                  {newCentre && !placed ? (
                    <p className="text-sm text-muted">
                      {readings.length === 1 ? 'Centre from 1 reading.' : `Centre from ${readings.length} readings, ${Math.round(spread)} m apart at most.`}
                    </p>
                  ) : null}
                  {newCentre && placed ? (
                    <button type="button" onClick={() => setPlaced(null)} className={cn(linkButtonClass, 'text-accent-accessible')}>
                      Use the centre from your readings
                    </button>
                  ) : null}
                </div>
              </div>
            </Step>
          </div>

          <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <PlaceSearch
              onPick={(point) => {
                placeCentre(point, 'search')
                setView('map')
                mapRef.current?.flyTo(point, 18)
              }}
              onSuggest={useSuggestion}
            />
            {mapProblem && view === 'map' ? (
              <p role="status" className="flex items-start gap-2 rounded-control bg-surface-soft px-3.5 py-2.5 text-sm text-body">
                <MapPinOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span>
                  {mapProblem} Showing a scale diagram instead. Search, readings and saving still work.
                </span>
              </p>
            ) : null}
            {view === 'map' && !mapProblem ? (
              <AreaMap
                ref={mapRef}
                interactive
                centre={centre}
                radiusM={radius}
                readings={readings}
                position={liveFix ?? test}
                positionTone={liveFix ? 'live' : testResult?.outcome === 'inside' ? 'success' : 'warning'}
                fitTo="area+position"
                onCentreChange={(p) => placeCentre(p)}
                onUnavailable={setMapProblem}
                label={mapLabel(centre, radius, readings.length)}
              />
            ) : (
              <AreaDiagram centre={centre} radius={radius} readings={readings} live={liveFix} test={test} testOutcome={testResult?.outcome ?? null} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 text-xs text-muted tabular-nums">
                {centre ? (
                  <>
                    Centre {centre.latitude.toFixed(5)}, {centre.longitude.toFixed(5)}
                    <span className={cn('ml-1.5 font-semibold', placed || newCentre ? 'text-accent-accessible' : 'text-muted')}>
                      · {centreSource}
                      {placed || newCentre ? ', not saved yet' : ''}
                    </span>
                  </>
                ) : (
                  'Tap the map or search to place the centre.'
                )}
              </p>
              {!mapProblem ? (
                <div role="group" aria-label="Preview" className="inline-flex shrink-0 rounded-full bg-surface-strong p-1">
                  {(['map', 'diagram'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        'relative inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold capitalize after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                        view === v ? 'bg-canvas text-ink shadow-card' : 'text-muted hover:text-ink',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="flex items-start gap-2 rounded-control bg-surface-soft px-3.5 py-2.5 text-xs leading-relaxed text-body">
              <ShieldCheck className="mt-px size-4 shrink-0 text-success-accessible" aria-hidden="true" />
              <span>
                This map only sets the department area. Staff positions are never stored or shown on any map. Your own readings and
                tests appear here on this screen only, and aren’t saved.
              </span>
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {/* Step 2 */}
            <Step n={2} title="Set the size" hint="The phone’s reported accuracy is given in the person’s favour, so a reading counts as inside when it could be inside.">
              <RangeField
                label="Radius"
                unit="m"
                value={radius}
                onChange={setRadius}
                {...RADIUS}
                help="How far from the centre still counts as the department. The circle on the map follows this."
                extra={
                  suggested && suggested !== radius ? (
                    <button type="button" onClick={() => setRadius(suggested)} className={cn(linkButtonClass, 'text-accent-accessible')}>
                      Use {suggested} m (from your readings)
                    </button>
                  ) : null
                }
              />
              <RangeField
                label="Accuracy limit"
                unit="m"
                value={ceiling}
                onChange={setCeiling}
                {...CEILING}
                help="Readings vaguer than this show as “couldn’t be confirmed” instead of “outside”, so a weak indoor signal is never mistaken for being elsewhere."
              />
            </Step>

            {/* Step 3 */}
            <Step n={3} title="Test from here" hint="On site, walk to a corner or an entrance and test. This uses the settings above, even before you save them.">
              <SamplerCard state={tester.state} onStop={tester.stop} label="Testing" />
              {testResult && test ? (
                <TestResult outcome={testResult.outcome} accuracy={Math.round(test.accuracy)} distance={testDistance} radius={radius} ceiling={ceiling} />
              ) : null}
              <div>
                <Button variant="secondary" onClick={runTest} disabled={busy || !!problem || !centre} loading={tester.state.status === 'sampling'}>
                  {tester.state.status === 'sampling' ? null : <Radar className="size-4" aria-hidden="true" />}
                  Test from here
                </Button>
                {!centre ? <p className="mt-2 text-sm text-muted">Place the centre first.</p> : null}
              </div>
            </Step>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-hairline-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex max-w-[60ch] items-start gap-2 text-sm text-muted">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Only the department’s centre point, radius and accuracy limit are stored. Staff positions are never stored or logged — just
            “inside”, “outside” or “couldn’t be confirmed”, and how accurate the phone said it was.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {dirty ? (
              <button type="button" onClick={discard} disabled={saving || busy} className={linkButtonClass}>
                <Undo2 aria-hidden="true" />
                Discard changes
              </button>
            ) : null}
            <Button onClick={save} loading={saving} disabled={!dirty || !centre || busy} className="sm:min-w-36">
              Save area
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-4" aria-labelledby={`step-${n}`}>
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline text-sm font-semibold text-ink">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h3 id={`step-${n}`} className="text-base font-semibold leading-8 text-ink">
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-muted text-pretty">{hint}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function SamplerCard({ state, onStop, label }: { state: SamplerState; onStop: () => void; label: string }) {
  if (state.status === 'error') {
    return <p role="alert" className="rounded-control bg-danger-50 px-4 py-3 text-sm text-danger-800">{state.message}</p>
  }
  if (state.status !== 'sampling') return null
  const pct = Math.round((state.elapsedMs / state.maxMs) * 100)
  const secondsLeft = Math.max(0, Math.ceil((state.maxMs - state.elapsedMs) / 1000))
  const quality = state.best ? accuracyQuality(state.best.accuracy) : null
  return (
    <div className="rounded-control border border-hairline-soft bg-surface-soft p-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary-500" />
          </span>
          {label}… hold still
        </p>
        <button type="button" onClick={onStop} disabled={!state.best} className={linkButtonClass}>
          {state.best ? 'Keep best now' : `${secondsLeft}s`}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Right now</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">{state.live ? `±${Math.round(state.live.accuracy)} m` : '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Best so far</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {state.best ? `±${Math.round(state.best.accuracy)} m` : '—'}
            {quality ? <span className={cn('ml-2 align-middle text-xs font-semibold', quality.className)}>{quality.label}</span> : null}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline-soft" aria-hidden="true">
        <div className="h-full rounded-full bg-ink transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {state.updates === 0 ? 'Waiting for the first position… allow location if your browser asks.' : `Up to ${secondsLeft}s more — readings usually sharpen as GPS locks on.`}
      </p>
    </div>
  )
}

function accuracyQuality(m: number) {
  if (m <= 10) return { label: 'Excellent', className: 'text-success-accessible' }
  if (m <= 25) return { label: 'Good', className: 'text-success-accessible' }
  if (m <= 60) return { label: 'Fair', className: 'text-warning-700' }
  return { label: 'Weak', className: 'text-danger-700' }
}

function RangeField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  help,
  extra,
}: {
  label: string
  unit: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  help: string
  extra?: React.ReactNode
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const pct = ((value - min) / (max - min)) * 100
  const commit = () => {
    const n = Math.round(Number(text))
    if (Number.isFinite(n)) onChange(clamp(n, min, max))
    else setText(String(value))
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            aria-label={`${label} in metres`}
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="h-10 w-20 rounded-control border border-hairline bg-canvas px-3 text-right text-[15px] font-semibold tabular-nums text-ink outline-none hover:border-neutral-400 focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)] focus-visible:outline-none"
          />
          <span className="text-sm text-muted">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-help`}
        aria-valuetext={`${value} metres`}
        className={rangeClass}
        style={{ '--range-pct': `${pct}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-xs tabular-nums text-muted" aria-hidden="true">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
      <p id={`${id}-help`} className="text-sm text-muted text-pretty">
        {help}
      </p>
      {extra ? <div>{extra}</div> : null}
    </div>
  )
}

function TestResult({
  outcome,
  accuracy,
  distance,
  radius,
  ceiling,
}: {
  outcome: LocationOutcome
  accuracy: number
  distance: number | null
  radius: number
  ceiling: number
}) {
  const ui = OUTCOME_UI[outcome]
  const Glyph = ui.icon
  const d = distance === null ? null : Math.round(distance)
  const body =
    outcome === 'inside'
      ? `${d} m from the centre, accurate to ±${accuracy} m — within the ${radius} m area. A check-in here shows “${LOCATION_LABEL.inside}”.`
      : outcome === 'outside'
        ? `${d} m from the centre. Even allowing ±${accuracy} m, that’s beyond the ${radius} m area. Make the radius bigger if this spot is part of the department.`
        : outcome === 'unavailable'
          ? `The phone reported ±${accuracy} m, vaguer than your ${ceiling} m limit. Raise the accuracy limit if readings here are always this weak.`
          : 'Take a reading to set the centre, then test again.'
  return (
    <div role="status" className={cn('animate-reveal flex items-start gap-3 rounded-control border px-4 py-3', ui.tone)}>
      <Glyph className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{ui.title}</p>
        <p className="mt-0.5 text-sm text-body">{body}</p>
      </div>
    </div>
  )
}

/**
 * Scale drawing of the area (north up): the radius circle, the readings, and the live or test
 * position with its accuracy halo. Uses no map tiles or external services.
 */
function AreaDiagram({
  centre,
  radius,
  readings,
  live,
  test,
  testOutcome,
}: {
  centre: Point | null
  radius: number
  readings: Fix[]
  live: Fix | null
  test: Fix | null
  testOutcome: LocationOutcome | null
}) {
  const origin = centre ?? live ?? null
  const points = [...readings, ...(live ? [live] : []), ...(test ? [test] : [])]
  const extent = origin
    ? Math.max(
        centre ? radius : 0,
        ...points.map((p) => {
          const o = offsetMetres(origin, p)
          return Math.hypot(o.east, o.north) + p.accuracy
        }),
        30,
      ) * 1.18
    : radius * 1.18
  const scale = 100 / extent
  const at = (p: Point) => {
    const o = origin ? offsetMetres(origin, p) : { east: 0, north: 0 }
    return { x: o.east * scale, y: -o.north * scale }
  }
  const halo = (p: Fix, tone: string, key: string) => {
    const { x, y } = at(p)
    return (
      <g key={key}>
        <circle cx={x} cy={y} r={Math.max(1.5, p.accuracy * scale)} className={cn(tone, 'opacity-20')} fill="currentColor" />
        <circle cx={x} cy={y} r={Math.max(1.5, p.accuracy * scale)} className={tone} fill="none" stroke="currentColor" strokeWidth={0.6} strokeDasharray="2 1.5" />
        <circle cx={x} cy={y} r={2.6} className={tone} fill="currentColor" stroke="white" strokeWidth={1} />
      </g>
    )
  }
  const testTone = testOutcome === 'inside' ? 'text-success-accessible' : 'text-warning-600'
  const ringStep = niceStep(extent)

  return (
    <figure className="rounded-control border border-hairline-soft bg-surface-soft p-3">
      <svg viewBox="-110 -110 220 220" role="img" aria-label={diagramLabel(centre, radius, readings.length, test, testOutcome)} className="block aspect-square w-full">
        <defs>
          <pattern id="area-grid" width="20" height="20" patternUnits="userSpaceOnUse" x="-110" y="-110">
            <path d="M 20 0 L 0 0 0 20" fill="none" className="text-hairline-soft" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x="-110" y="-110" width="220" height="220" fill="url(#area-grid)" />
        {centre ? (
          <>
            <circle r={radius * scale} className="text-primary-500" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={1.2} />
            <line x1={0} y1={0} x2={radius * scale} y2={0} className="text-primary-600" stroke="currentColor" strokeWidth={0.8} strokeDasharray="3 2" />
            {radius * scale >= 28 ? (
              <text x={(radius * scale) / 2} y={-4} textAnchor="middle" className="fill-accent-accessible text-[8px] font-semibold">
                {radius} m
              </text>
            ) : (
              <text x={0} y={-(radius * scale) - 4} textAnchor="middle" className="fill-accent-accessible text-[8px] font-semibold">
                {radius} m
              </text>
            )}
            <g className="text-ink">
              <line x1={-5} y1={0} x2={5} y2={0} stroke="currentColor" strokeWidth={1} />
              <line x1={0} y1={-5} x2={0} y2={5} stroke="currentColor" strokeWidth={1} />
            </g>
          </>
        ) : (
          <text x={0} y={4} textAnchor="middle" className="fill-muted text-[8px] font-medium">
            Place the centre to see the area
          </text>
        )}
        {readings.map((r, i) => {
          const { x, y } = at(r)
          return (
            <g key={`r${i}`} className="text-ink">
              <circle cx={x} cy={y} r={Math.max(1.5, r.accuracy * scale)} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.5} />
              <circle cx={x} cy={y} r={5} fill="currentColor" />
              <text x={x} y={y + 2.4} textAnchor="middle" className="fill-white text-[6.5px] font-bold">
                {i + 1}
              </text>
            </g>
          )
        })}
        {test ? halo(test, testTone, 'test') : null}
        {live ? halo(live, 'text-primary-500', 'live') : null}
        <g className="text-muted">
          <text x={-102} y={-98} className="fill-current text-[7px] font-semibold">N ↑</text>
        </g>
        <g transform="translate(60 100)" className="text-body">
          <line x1={0} y1={0} x2={ringStep * scale} y2={0} stroke="currentColor" strokeWidth={1.2} />
          <line x1={0} y1={-2} x2={0} y2={2} stroke="currentColor" strokeWidth={1} />
          <line x1={ringStep * scale} y1={-2} x2={ringStep * scale} y2={2} stroke="currentColor" strokeWidth={1} />
          <text x={(ringStep * scale) / 2} y={-4} textAnchor="middle" className="fill-current text-[7px]">
            {ringStep} m
          </text>
        </g>
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-primary-500 bg-primary-100" aria-hidden="true" /> Department area
        </span>
        {readings.length ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ink" aria-hidden="true" /> Your readings
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-dashed border-body" aria-hidden="true" /> Reported accuracy
        </span>
      </figcaption>
    </figure>
  )
}

function mapLabel(centre: Point | null, radius: number, readings: number) {
  if (!centre) return 'Map of the area around Whipps Cross Hospital. No department centre yet: click the map to place it.'
  return `Map of the department area: a ${radius} metre circle around the pin${readings ? `, with ${readings} ${readings === 1 ? 'reading' : 'readings'}` : ''}. Arrow keys pan the map; tab to the pin and use the arrow keys to move the centre.`
}

function niceStep(extent: number) {
  const target = extent / 3
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (s >= target) return s
  return 1000
}

function diagramLabel(centre: Point | null, radius: number, readings: number, test: Fix | null, outcome: LocationOutcome | null) {
  if (!centre) return 'Diagram of the department area. No centre set yet.'
  const parts = [`Diagram of the department area: a ${radius} metre circle around the centre`]
  if (readings) parts.push(`${readings} new ${readings === 1 ? 'reading' : 'readings'}`)
  if (test && outcome) parts.push(`test position ${LOCATION_LABEL[outcome].toLowerCase()}, accuracy ${Math.round(test.accuracy)} metres`)
  return `${parts.join('; ')}.`
}

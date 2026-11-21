import type { LocationReading } from '#/utils/location'

/**
 * Best-reading location sampler for one check-in or checkout.
 *
 * Phones usually report a coarse Wi-Fi/cell fix first and a tighter GPS fix a few seconds later,
 * so a single `getCurrentPosition` often under-reports accuracy. Instead we watch for a short
 * window and keep the most accurate reading:
 *   - resolve early once a reading is at or under `targetAccuracyM` (default 20 m);
 *   - otherwise stop at `maxWaitMs` (default 8 s) with the best reading so far;
 *   - permission refused (code 1) resolves immediately as `denied`;
 *   - position unavailable (code 2) before any reading resolves as `unavailable`;
 *   - no reading by the deadline (or code 3) resolves as `timeout`;
 *   - no Geolocation API resolves as `unsupported`.
 * The watch is always cleared. Nothing here is stored or logged.
 */

export type SampleResult = {
  reading: LocationReading
  /** Accuracy so coarse that the phone is probably sharing approximate location only (iOS Precise Location off). */
  approximate: boolean
}

export type SamplerOptions = {
  geolocation?: Geolocation | null
  targetAccuracyM?: number
  maxWaitMs?: number
  /** Per-fix timeout handed to the browser. */
  timeoutMs?: number
  /** Readings coarser than this are treated as "approximate location" for the tip. */
  approximateAboveM?: number
  /** Ignore cached fixes older than this (some browsers ignore maximumAge: 0). */
  maxFixAgeMs?: number
  now?: () => number
}

export type LocationSampler = {
  result: Promise<SampleResult>
  /** Stop early. Resolves `result` with the best reading so far (or `timeout`). */
  stop: () => void
}

export const TARGET_ACCURACY_M = 20
export const MAX_WAIT_MS = 8_000
export const APPROXIMATE_ABOVE_M = 1_000

function browserGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null
  return 'geolocation' in navigator && navigator.geolocation ? navigator.geolocation : null
}

export function startLocationSampler(options: SamplerOptions = {}): LocationSampler {
  const geolocation = options.geolocation === undefined ? browserGeolocation() : options.geolocation
  const target = options.targetAccuracyM ?? TARGET_ACCURACY_M
  const maxWait = options.maxWaitMs ?? MAX_WAIT_MS
  const approximateAbove = options.approximateAboveM ?? APPROXIMATE_ABOVE_M
  const maxFixAge = options.maxFixAgeMs ?? 30_000
  const now = options.now ?? (() => Date.now())

  if (!geolocation) {
    return { result: Promise.resolve({ reading: { status: 'unsupported' }, approximate: false }), stop: () => {} }
  }

  let settle!: (r: SampleResult) => void
  const result = new Promise<SampleResult>((resolve) => { settle = resolve })
  let done = false
  let best: { latitude: number; longitude: number; accuracy: number } | null = null
  let watchId: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const startedAt = now()

  const finish = (fallback: 'denied' | 'unavailable' | 'timeout') => {
    if (done) return
    done = true
    if (timer !== null) clearTimeout(timer)
    if (watchId !== null) geolocation.clearWatch(watchId)
    if (best && fallback !== 'denied') {
      settle({ reading: { status: 'ok', ...best }, approximate: best.accuracy > approximateAbove })
    } else {
      settle({ reading: { status: fallback }, approximate: false })
    }
  }

  const onPosition = (position: GeolocationPosition) => {
    if (done) return
    const { latitude, longitude, accuracy } = position.coords
    if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy <= 0) return
    if (position.timestamp && startedAt - position.timestamp > maxFixAge) return
    if (!best || accuracy < best.accuracy) best = { latitude, longitude, accuracy }
    if (best.accuracy <= target) finish('timeout')
  }

  const onError = (error: GeolocationPositionError) => {
    if (done) return
    if (error.code === 1) return finish('denied')
    // A later fix can still arrive while watching; give up early only if we have nothing at all.
    if (error.code === 2 && !best) return finish('unavailable')
    if (error.code === 3 && !best) return finish('timeout')
  }

  timer = setTimeout(() => finish('timeout'), maxWait)
  try {
    watchId = geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: options.timeoutMs ?? 10_000,
    })
    // A synchronous callback may already have finished the sample before the ID was assigned.
    if (done && watchId !== null) geolocation.clearWatch(watchId)
  } catch {
    finish('unavailable')
  }

  return { result, stop: () => finish('timeout') }
}

/** Current permission state where the Permissions API is available (`unknown` elsewhere, e.g. older Safari). */
export async function locationPermission(): Promise<PermissionState | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

export type LocationPermission = PermissionState | 'unknown'

/**
 * Follow the location permission: the Permissions API `change` event where supported, plus a
 * re-check whenever the page becomes visible again (returning from Settings, where some browsers
 * don't fire `change`). Calls `onState` with the current state straight away. Never prompts.
 */
export function watchLocationPermission(onState: (state: LocationPermission) => void): () => void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return () => {}
  let stopped = false
  let status: PermissionStatus | null = null
  let last: LocationPermission | null = null
  const emit = (s: LocationPermission) => {
    if (stopped || s === last) return
    last = s
    onState(s)
  }
  const onChange = () => status && emit(status.state)
  const recheck = () => {
    if (document.visibilityState !== 'visible') return
    void locationPermission().then(emit)
  }
  try {
    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((s) => {
        if (stopped) return
        status = s
        s.addEventListener?.('change', onChange)
        emit(s.state)
      }, () => emit('unknown'))
    } else {
      emit('unknown')
    }
  } catch {
    emit('unknown')
  }
  document.addEventListener('visibilitychange', recheck)
  window.addEventListener('focus', recheck)
  window.addEventListener('pageshow', recheck)
  return () => {
    stopped = true
    status?.removeEventListener?.('change', onChange)
    document.removeEventListener('visibilitychange', recheck)
    window.removeEventListener('focus', recheck)
    window.removeEventListener('pageshow', recheck)
  }
}

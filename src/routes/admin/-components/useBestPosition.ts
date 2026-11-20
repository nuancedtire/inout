import { useCallback, useEffect, useRef, useState } from 'react'

export type Fix = { latitude: number; longitude: number; accuracy: number; at: number }

export type SamplerState =
  | { status: 'idle' }
  | { status: 'sampling'; live: Fix | null; best: Fix | null; elapsedMs: number; maxMs: number; updates: number }
  | { status: 'done'; best: Fix; updates: number }
  | { status: 'error'; message: string }

export const SAMPLE_MS = 15_000
/** Stop early once a reading is this good and the receiver has had a moment to settle. */
const GOOD_ENOUGH_M = 5
const SETTLE_MS = 4_000

export function geolocationProblem(): string | null {
  if (typeof window === 'undefined') return null
  if (!window.isSecureContext) return 'Location needs a secure (https) connection. Open the admin page over https and try again.'
  if (!('geolocation' in navigator)) return 'This browser cannot share its location.'
  return null
}

/**
 * Best-accuracy position sampler: watches high-accuracy fixes (no cached positions) for up to
 * `maxMs`, keeps the most precise one, and reports live progress. Phones usually start with a
 * coarse network fix and tighten as GPS locks, so waiting a few seconds gives a much better centre.
 */
export function useBestPosition() {
  const [state, setState] = useState<SamplerState>({ status: 'idle' })
  const watchId = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    if (timer.current) clearInterval(timer.current)
    watchId.current = null
    timer.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const sample = useCallback(
    (maxMs = SAMPLE_MS) =>
      new Promise<Fix | null>((resolve) => {
        const problem = geolocationProblem()
        if (problem) {
          setState({ status: 'error', message: problem })
          resolve(null)
          return
        }
        cleanup()
        const started = Date.now()
        let best: Fix | null = null
        let live: Fix | null = null
        let updates = 0
        let settled = false

        const finish = (error?: string) => {
          if (settled) return
          settled = true
          cleanup()
          finishRef.current = null
          if (best) {
            setState({ status: 'done', best, updates })
            resolve(best)
          } else {
            setState({
              status: 'error',
              message: error ?? 'No position came through. Move nearer a window or doorway and try again.',
            })
            resolve(null)
          }
        }
        finishRef.current = () => finish()

        const publish = () =>
          setState({ status: 'sampling', live, best, elapsedMs: Math.min(maxMs, Date.now() - started), maxMs, updates })

        publish()
        timer.current = setInterval(() => {
          const elapsed = Date.now() - started
          if (elapsed >= maxMs || (best && best.accuracy <= GOOD_ENOUGH_M && elapsed >= SETTLE_MS)) finish()
          else publish()
        }, 200)

        watchId.current = navigator.geolocation.watchPosition(
          (pos) => {
            const fix: Fix = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: Math.max(1, pos.coords.accuracy),
              at: pos.timestamp || Date.now(),
            }
            updates++
            live = fix
            if (!best || fix.accuracy < best.accuracy) best = fix
            publish()
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              finish('Location permission is blocked for this site. Allow location in your browser settings, then try again.')
            }
            // Timeouts and temporary unavailability: keep listening until the window ends.
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
        )
      }),
    [cleanup],
  )

  /** End the current sample now and keep the best reading so far. */
  const stop = useCallback(() => finishRef.current?.(), [])
  const reset = useCallback(() => {
    cleanup()
    finishRef.current = null
    setState({ status: 'idle' })
  }, [cleanup])

  return { state, sample, stop, reset }
}

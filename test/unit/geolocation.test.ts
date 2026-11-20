import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLocationSampler } from '#/lib/geolocation'

type Success = (p: GeolocationPosition) => void
type Failure = (e: GeolocationPositionError) => void

/** A controllable navigator.geolocation stand-in. */
function fakeGeolocation() {
  let success: Success | null = null
  let failure: Failure | null = null
  const watch = vi.fn((s: Success, f: Failure, _options?: PositionOptions) => {
    success = s
    failure = f
    return 7
  })
  const clearWatch = vi.fn()
  const geolocation = { watchPosition: watch, clearWatch, getCurrentPosition: vi.fn() } as unknown as Geolocation
  return {
    geolocation,
    watch,
    clearWatch,
    fix(accuracy: number, latitude = 51.4, longitude = -0.2, timestamp = Date.now()) {
      success?.({ coords: { latitude, longitude, accuracy }, timestamp } as GeolocationPosition)
    },
    fail(code: 1 | 2 | 3) {
      failure?.({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('best-reading location sampler', () => {
  it('asks for a fresh high-accuracy fix and keeps the most accurate reading until the deadline', async () => {
    const g = fakeGeolocation()
    const sampler = startLocationSampler({ geolocation: g.geolocation })
    expect(g.watch.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 })
    g.fix(65, 1, 1)
    g.fix(30, 2, 2)
    g.fix(48, 3, 3)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await sampler.result).toEqual({ reading: { status: 'ok', latitude: 2, longitude: 2, accuracy: 30 }, approximate: false })
    expect(g.clearWatch).toHaveBeenCalledWith(7)
  })

  it('resolves early at 20 m or better', async () => {
    const g = fakeGeolocation()
    const sampler = startLocationSampler({ geolocation: g.geolocation })
    g.fix(120)
    g.fix(18)
    const result = await sampler.result
    expect(result.reading).toMatchObject({ status: 'ok', accuracy: 18 })
    expect(g.clearWatch).toHaveBeenCalledOnce()
    g.fix(5) // ignored after finishing
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps errors: denied immediately, unavailable before any reading, timeout with nothing at the deadline', async () => {
    const denied = fakeGeolocation()
    const a = startLocationSampler({ geolocation: denied.geolocation })
    denied.fail(1)
    expect((await a.result).reading).toEqual({ status: 'denied' })
    expect(denied.clearWatch).toHaveBeenCalled()

    const unavailable = fakeGeolocation()
    const b = startLocationSampler({ geolocation: unavailable.geolocation })
    unavailable.fail(2)
    expect((await b.result).reading).toEqual({ status: 'unavailable' })

    const silent = fakeGeolocation()
    const c = startLocationSampler({ geolocation: silent.geolocation })
    await vi.advanceTimersByTimeAsync(8_000)
    expect((await c.result).reading).toEqual({ status: 'timeout' })
    expect(silent.clearWatch).toHaveBeenCalled()

    const timeout = fakeGeolocation()
    const d = startLocationSampler({ geolocation: timeout.geolocation })
    timeout.fail(3)
    expect((await d.result).reading).toEqual({ status: 'timeout' })
  })

  it('keeps a reading through a transient error', async () => {
    const g = fakeGeolocation()
    const sampler = startLocationSampler({ geolocation: g.geolocation })
    g.fix(40)
    g.fail(2)
    await vi.advanceTimersByTimeAsync(8_000)
    expect((await sampler.result).reading).toMatchObject({ status: 'ok', accuracy: 40 })
  })

  it('reports unsupported without an API, flags approximate fixes, and ignores stale or invalid fixes', async () => {
    expect((await startLocationSampler({ geolocation: null }).result).reading).toEqual({ status: 'unsupported' })

    const g = fakeGeolocation()
    const sampler = startLocationSampler({ geolocation: g.geolocation })
    g.fix(Number.NaN)
    g.fix(10, 1, 1, Date.now() - 120_000) // cached from two minutes ago
    g.fix(3_000)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await sampler.result).toEqual({ reading: { status: 'ok', latitude: 51.4, longitude: -0.2, accuracy: 3_000 }, approximate: true })
  })

  it('stop() ends the watch with the best reading so far', async () => {
    const g = fakeGeolocation()
    const sampler = startLocationSampler({ geolocation: g.geolocation })
    g.fix(55)
    sampler.stop()
    expect((await sampler.result).reading).toMatchObject({ accuracy: 55 })
    expect(g.clearWatch).toHaveBeenCalledOnce()
  })
})

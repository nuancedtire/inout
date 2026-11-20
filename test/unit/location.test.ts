import { describe, expect, it } from 'vitest'
import { evaluateLocation, haversineMetres, validateLocationReading, type SiteArea } from '#/utils/location'

const site: SiteArea = { latitude: 51.5, longitude: -0.1, radiusM: 100, accuracyCeilingM: 50 }
const R = 6_371_008.8
/** A point `metres` due north of the site centre. */
const north = (metres: number) => site.latitude! + (metres / R) * (180 / Math.PI)
const ok = (metres: number, accuracy: number) => ({ status: 'ok' as const, latitude: north(metres), longitude: site.longitude!, accuracy })

describe('haversine distance', () => {
  it('measures known distances', () => {
    expect(haversineMetres({ latitude: 51.5, longitude: -0.1 }, { latitude: 51.5, longitude: -0.1 })).toBe(0)
    expect(haversineMetres(site as { latitude: number; longitude: number }, { latitude: north(250), longitude: -0.1 })).toBeCloseTo(250, 6)
    // London to Paris, roughly 343 km.
    expect(haversineMetres({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 48.8566, longitude: 2.3522 }) / 1000).toBeCloseTo(343.5, 0)
  })
})

describe('location outcome', () => {
  it('is inside when distance minus accuracy is within the radius, boundary inclusive', () => {
    expect(evaluateLocation(ok(50, 10), site)).toEqual({ outcome: 'inside', accuracyM: 10 })
    expect(evaluateLocation(ok(109.999, 10), site).outcome).toBe('inside')
    expect(evaluateLocation(ok(110.001, 10), site).outcome).toBe('outside')
    expect(evaluateLocation(ok(140, 45), site).outcome).toBe('inside')
    expect(evaluateLocation(ok(5_000, 20), site)).toEqual({ outcome: 'outside', accuracyM: 20 })
  })

  it('treats readings worse than the accuracy ceiling as unavailable, not outside', () => {
    expect(evaluateLocation(ok(5_000, 50), site).outcome).toBe('outside')
    expect(evaluateLocation(ok(5_000, 50.5), site)).toEqual({ outcome: 'unavailable', accuracyM: 51 })
  })

  it('maps browser failures and missing configuration', () => {
    expect(evaluateLocation({ status: 'denied' }, site)).toEqual({ outcome: 'denied', accuracyM: null })
    for (const status of ['unavailable', 'timeout', 'unsupported'] as const) {
      expect(evaluateLocation({ status }, site)).toEqual({ outcome: 'unavailable', accuracyM: null })
    }
    expect(evaluateLocation(undefined, site)).toEqual({ outcome: 'not_requested', accuracyM: null })
    expect(evaluateLocation(ok(0, 12.2), { ...site, latitude: null, longitude: null })).toEqual({ outcome: 'not_requested', accuracyM: 13 })
    expect(evaluateLocation({ status: 'denied' }, null).outcome).toBe('not_requested')
  })

  it('never returns coordinates', () => {
    expect(Object.keys(evaluateLocation(ok(10, 5), site)).sort()).toEqual(['accuracyM', 'outcome'])
  })
})

describe('location reading validation', () => {
  it('accepts well-formed readings and drops unknown fields', () => {
    expect(validateLocationReading({ status: 'ok', latitude: 51.5, longitude: -0.1, accuracy: 12, altitude: 3 }))
      .toEqual({ status: 'ok', latitude: 51.5, longitude: -0.1, accuracy: 12 })
    expect(validateLocationReading({ status: 'timeout', latitude: 1 })).toEqual({ status: 'timeout' })
  })

  it.each([
    null, [], 'ok', {}, { status: 'maybe' },
    { status: 'ok', latitude: 91, longitude: 0, accuracy: 5 },
    { status: 'ok', latitude: 0, longitude: -181, accuracy: 5 },
    { status: 'ok', latitude: 0, longitude: 0, accuracy: 0 },
    { status: 'ok', latitude: 0, longitude: 0, accuracy: 100_001 },
    { status: 'ok', latitude: Number.NaN, longitude: 0, accuracy: 5 },
    { status: 'ok', latitude: '51.5', longitude: 0, accuracy: 5 },
    { status: 'ok', latitude: 0, longitude: Infinity, accuracy: 5 },
  ])('rejects %j without echoing values', (value) => {
    expect(() => validateLocationReading(value)).toThrow(/^Invalid location reading$/)
  })
})

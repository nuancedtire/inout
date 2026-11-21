import type { LocationOutcome } from './verification'

/**
 * One browser Geolocation reading sent with a check-in or checkout. Coordinates are an untrusted
 * client input: they are compared with the department area and then discarded. Never log or
 * persist them, and never echo them in error messages.
 */
export type LocationReading =
  | { status: 'ok'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }

export type SiteArea = {
  latitude: number | null
  longitude: number | null
  radiusM: number
  accuracyCeilingM: number
}

export type LocationEvaluation = { outcome: LocationOutcome; accuracyM: number | null }

const FAILURE_STATUSES = ['denied', 'unavailable', 'timeout', 'unsupported'] as const

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** Runtime validator. Throws a generic message (never containing the submitted values). */
export function validateLocationReading(value: unknown): LocationReading {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid location reading')
  const v = value as Record<string, unknown>
  if (v.status === 'ok') {
    if (!finiteInRange(v.latitude, -90, 90) || !finiteInRange(v.longitude, -180, 180)
      || !finiteInRange(v.accuracy, 0, 100_000) || v.accuracy === 0) {
      throw new Error('Invalid location reading')
    }
    return { status: 'ok', latitude: v.latitude, longitude: v.longitude, accuracy: v.accuracy }
  }
  if ((FAILURE_STATUSES as readonly unknown[]).includes(v.status)) {
    return { status: v.status as (typeof FAILURE_STATUSES)[number] }
  }
  throw new Error('Invalid location reading')
}

const EARTH_RADIUS_M = 6_371_008.8

/** Great-circle distance in metres. */
export function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function isSiteConfigured(site: SiteArea | null | undefined): site is SiteArea & { latitude: number; longitude: number } {
  return !!site && site.latitude !== null && site.longitude !== null
}

/**
 * Outcome for one reading. Without a reading or a configured area the outcome is
 * `not_requested`. A reading worse than the accuracy ceiling is `unavailable`, not `outside`.
 * Inside iff distance − reported accuracy ≤ radius (boundary inclusive).
 * Only the outcome and the rounded-up accuracy are returned; coordinates are not.
 */
export function evaluateLocation(reading: LocationReading | undefined | null, site: SiteArea | null | undefined): LocationEvaluation {
  const accuracyM = reading?.status === 'ok' ? Math.ceil(reading.accuracy) : null
  if (!reading) return { outcome: 'not_requested', accuracyM: null }
  if (!isSiteConfigured(site)) return { outcome: 'not_requested', accuracyM }
  if (reading.status === 'denied') return { outcome: 'denied', accuracyM: null }
  if (reading.status !== 'ok') return { outcome: 'unavailable', accuracyM: null }
  if (reading.accuracy > site.accuracyCeilingM) return { outcome: 'unavailable', accuracyM }
  const distance = haversineMetres(reading, site)
  return { outcome: distance - reading.accuracy <= site.radiusM ? 'inside' : 'outside', accuracyM }
}

/**
 * The department area as shown on staff maps: the public hospital location and its radius.
 * Never includes the accuracy ceiling or anything about staff positions.
 */
export type PublicArea = { latitude: number; longitude: number; radiusM: number }

export function publicArea(site: SiteArea | null | undefined): PublicArea | null {
  if (!isSiteConfigured(site)) return null
  return { latitude: site.latitude, longitude: site.longitude, radiusM: site.radiusM }
}

export type LocationPreview = LocationEvaluation & {
  /** Rounded metres from the edge of the area when outside, else null. Only ever returned to the phone that sent the reading. */
  awayM: number | null
}

export type LocationPreviewWithArea = LocationPreview & { area: PublicArea | null }

/**
 * Same rule as `evaluateLocation`, plus a rounded distance to the edge of the area for the
 * person's own screen ("about 350 m away"). Nothing here is stored.
 */
export function previewLocation(reading: LocationReading | undefined | null, site: SiteArea | null | undefined): LocationPreview {
  const evaluation = evaluateLocation(reading, site)
  if (evaluation.outcome !== 'outside' || reading?.status !== 'ok' || !isSiteConfigured(site)) return { ...evaluation, awayM: null }
  const edge = haversineMetres(reading, site) - site.radiusM
  const awayM = edge < 1000 ? Math.max(10, Math.round(edge / 10) * 10) : Math.round(edge / 100) * 100
  return { ...evaluation, awayM }
}

import { useEffect, useState } from 'react'
import { getCheckInArea, type PublicArea } from '#/utils/passkeys.functions'
import { watchLocationPermission, type LocationPermission } from '#/lib/geolocation'

/** The phone's location permission for InOut, kept current (see `watchLocationPermission`). */
export function useLocationPermission(): LocationPermission {
  const [state, setState] = useState<LocationPermission>('unknown')
  useEffect(() => watchLocationPermission(setState), [])
  return state
}

// One request per QR code per page load; the department doesn't move during a shift.
const areaCache = new Map<string, Promise<PublicArea | null>>()

/**
 * The department area for staff maps (a public hospital location), fetched once per code.
 * `undefined` while loading, `null` when there is no area or it couldn't be fetched.
 */
export function useCheckInArea(token: string | null, enabled: boolean): PublicArea | null | undefined {
  const [area, setArea] = useState<PublicArea | null | undefined>(undefined)
  useEffect(() => {
    if (!token || !enabled) {
      setArea(enabled ? undefined : null)
      return
    }
    let cancelled = false
    let pending = areaCache.get(token)
    if (!pending) {
      pending = getCheckInArea({ data: { token } }).then((r) => r.area, () => {
        areaCache.delete(token)
        return null
      })
      areaCache.set(token, pending)
    }
    void pending.then((a) => { if (!cancelled) setArea(a) })
    return () => { cancelled = true }
  }, [token, enabled])
  return area
}

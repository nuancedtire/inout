/**
 * This browser's random same-phone marker (see src/utils/deviceMarker.ts). Not a fingerprint:
 * nothing is read from the device; it is a random value kept in this site's storage, so clearing
 * site data, private browsing, or the Home Screen app (separate storage on iPhone) starts afresh.
 */
const KEY = 'inout-device-id'
let memory: string | undefined

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getDeviceId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored
    const id = randomId()
    window.localStorage.setItem(KEY, id)
    return id
  } catch {
    // Storage blocked: a marker for this page load is still better than none.
    return (memory ??= randomId())
  }
}

/** `{ deviceId }` to spread into a staff request body, or nothing during SSR. */
export function deviceField(): { deviceId?: string } {
  const id = getDeviceId()
  return id ? { deviceId: id } : {}
}

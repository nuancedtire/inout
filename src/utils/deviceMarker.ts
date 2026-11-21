/**
 * Same-phone marker. Passkeys deliberately hide which device they live on, so the phone keeps a
 * random marker of its own (src/lib/deviceId.ts) and sends it with enrolment and each check-in
 * or check-out. Only a SHA-256 hash is stored. It is a signal for the coordinator, not proof:
 * clearing site data, private browsing, or a Home Screen app (separate storage on iPhone) gives a
 * new marker, and a missing or malformed marker never blocks a shift.
 */

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/

/** The marker from a request body, or undefined when absent or malformed (never throws). */
export function readDeviceId(o: Record<string, unknown>): string | undefined {
  const value = o.deviceId
  return typeof value === 'string' && DEVICE_ID.test(value) ? value : undefined
}

/** 32 hex characters of SHA-256 over a versioned prefix and the marker; null without a marker. */
export async function hashDeviceId(deviceId: string | undefined): Promise<string | null> {
  if (!deviceId) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inout-device-v1:${deviceId}`))
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

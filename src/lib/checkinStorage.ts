/**
 * Browser-side memory for the staff check-in page. Every accessor tolerates storage being
 * unavailable (private browsing, blocked site data) and returns the empty value instead.
 *
 * - Check-in code: localStorage. The department's QR code is permanent, so the phone (and the
 *   Home Screen app, which has its own storage) remembers it after the first scan and staff can
 *   check in without scanning again. Cleared when the server rejects it (code replaced).
 *   The `date` parameters are kept for call-site compatibility and ignored.
 * - Remembered staff: localStorage. The staff token is a display hint only; every attendance
 *   action still needs a fresh passkey assertion.
 * - Legacy `inout-staff-id`: the roster entry ID that /history reads.
 */

export type RememberedStaff = {
  staffToken: string
  staff: { id: number; name: string; role: string | null }
  credentialStatus?: 'pending' | 'approved'
}

const TOKEN_PREFIX = 'inout-qr-token:'
const STAFF_KEY = 'inout-staff-v2'
const ENTRY_KEY = 'inout-staff-id'
const EXPLAINED_KEY = 'inout-location-explained'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

const CODE_KEY = 'inout-check-in-code'

export function readStoredToken(_date?: string): string | null {
  return safe(() => localStorage.getItem(CODE_KEY), null)
}

export function storeToken(_date: string | undefined, token: string) {
  safe(() => {
    localStorage.setItem(CODE_KEY, token)
    // Tidy up the old per-day session copies.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(TOKEN_PREFIX)) sessionStorage.removeItem(key)
    }
  }, undefined)
}

export function clearStoredToken(_date?: string) {
  safe(() => localStorage.removeItem(CODE_KEY), undefined)
}

export function readRememberedStaff(): RememberedStaff | null {
  return safe(() => {
    const raw = localStorage.getItem(STAFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RememberedStaff
    if (typeof parsed?.staffToken !== 'string' || typeof parsed?.staff?.id !== 'number' || typeof parsed.staff.name !== 'string') return null
    return parsed
  }, null)
}

export function rememberStaff(value: RememberedStaff) {
  safe(() => localStorage.setItem(STAFF_KEY, JSON.stringify(value)), undefined)
}

export function forgetStaff() {
  safe(() => {
    localStorage.removeItem(STAFF_KEY)
    localStorage.removeItem(ENTRY_KEY)
  }, undefined)
}

/** Keep /history pointed at today's roster entry for this person. */
export function rememberRosterEntry(entryId: number | null) {
  safe(() => {
    if (entryId) localStorage.setItem(ENTRY_KEY, String(entryId))
  }, undefined)
}

export function readRosterEntry(): number | null {
  return safe(() => {
    const value = Number(localStorage.getItem(ENTRY_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  }, null)
}

export function locationExplained(): boolean {
  return safe(() => localStorage.getItem(EXPLAINED_KEY) === '1', false)
}

export function markLocationExplained() {
  safe(() => localStorage.setItem(EXPLAINED_KEY, '1'), undefined)
}

const WORKED_KEY = 'inout-location-worked'

/**
 * This phone has shared a location reading with InOut before. iOS Safari reports the permission
 * as `prompt` until location is used on the page, so this is how Home knows it can check by
 * itself without surprising anyone with a first-time prompt.
 */
export function locationWorked(): boolean {
  return safe(() => localStorage.getItem(WORKED_KEY) === '1', false)
}

export function markLocationWorked() {
  safe(() => localStorage.setItem(WORKED_KEY, '1'), undefined)
}

/**
 * Browser-side memory for the staff check-in page. Every accessor tolerates storage being
 * unavailable (private browsing, blocked site data) and returns the empty value instead.
 *
 * - Daily QR token: sessionStorage, keyed by the rota date, so a reload keeps working after the
 *   token is stripped from the address bar, and a new day never reuses yesterday's token.
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

export function readStoredToken(date: string): string | null {
  return safe(() => sessionStorage.getItem(TOKEN_PREFIX + date), null)
}

export function storeToken(date: string, token: string) {
  safe(() => {
    // Only ever keep today's token.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(TOKEN_PREFIX) && key !== TOKEN_PREFIX + date) sessionStorage.removeItem(key)
    }
    sessionStorage.setItem(TOKEN_PREFIX + date, token)
  }, undefined)
}

export function clearStoredToken(date: string) {
  safe(() => sessionStorage.removeItem(TOKEN_PREFIX + date), undefined)
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

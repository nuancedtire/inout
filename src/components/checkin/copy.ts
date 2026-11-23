import { firstLastOrder } from '#/utils/staffNames'
import type { FlagReason, Identity, LocationOutcome } from '#/utils/verification'
import type { UnlockCopy } from '#/lib/platform'

/**
 * Staff-facing wording for the evidence behind one check-in or checkout. Deliberately gentle:
 * flags never block attendance, so nothing here is red or reads as a failure.
 */

export type EvidenceItem = { key: string; label: string; ok: boolean }

export type ActionLike = {
  action: 'check_in' | 'check_out' | 'checkin_undone' | 'checkout_undone'
  identity: Identity
  location: LocationOutcome
  reasons: FlagReason[]
}

export function evidenceItems(result: ActionLike, unlock: UnlockCopy, locationCheck: boolean): EvidenceItem[] {
  if (result.action === 'checkin_undone' || result.action === 'checkout_undone') return []
  const items: EvidenceItem[] = []
  if (result.identity === 'passkey' || result.identity === 'passkey_pending') {
    items.push({ key: 'identity', label: capitalise(unlock.name), ok: true })
  } else if (result.identity === 'self_selected') {
    items.push({ key: 'identity', label: `No ${unlock.name}`, ok: false })
  }
  const location = LOCATION_CHIP[result.location]
  if (location && (locationCheck || result.location !== 'not_requested')) {
    items.push({ key: 'location', label: location, ok: result.location === 'inside' })
  }
  return items
}

const LOCATION_CHIP: Record<LocationOutcome, string> = {
  inside: 'In the department',
  outside: 'Outside the area',
  denied: 'Location off',
  unavailable: 'Location unclear',
  not_requested: 'Location not checked',
}

/** One short sentence per reason, written to the staff member. `null` = say nothing. */
export function reasonNote(reason: FlagReason, unlock: UnlockCopy, locationCheck: boolean): string | null {
  switch (reason) {
    case 'identity_pending':
      return null // shown separately as a neutral note, not a flag
    case 'identity_self_selected':
      return `This was recorded without ${unlock.name}, so the coordinator may check it.`
    case 'location_outside':
      return 'Your phone placed you outside the department.'
    case 'location_denied':
      return 'Location was turned off, so it wasn’t checked.'
    case 'location_unavailable':
      return 'Your phone couldn’t pin down your location.'
    case 'location_not_checked':
      return locationCheck ? 'Location wasn’t checked this time.' : null
  }
}

export function flagNotes(result: ActionLike, unlock: UnlockCopy, locationCheck: boolean): string[] {
  return result.reasons.map((r) => reasonNote(r, unlock, locationCheck)).filter((n): n is string => !!n)
}

export function actionHeadline(action: ActionLike['action']): string {
  switch (action) {
    case 'check_in':
      return 'You’re checked in'
    case 'check_out':
      return 'You’re checked out'
    case 'checkin_undone':
      return 'Check-in undone'
    case 'checkout_undone':
      return 'Check-out undone'
  }
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/)
  // Skip a leading title so "Dr Jane Smith" greets "Jane".
  const titled = /^(dr|mr|mrs|ms|miss|mx|prof|sister|nurse)\.?$/i.test(parts[0] ?? '') && parts.length > 1
  return titled ? parts[1] : parts[0] ?? name
}

export function initials(name: string): string {
  const parts = firstLastOrder(name).split(/\s+/).filter((p) => p && !/^(dr|mr|mrs|ms|miss|mx|prof)\.?$/i.test(p))
  const letters = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts).map((p) => p.charAt(0))
  return letters.join('').toUpperCase() || '?'
}

export function greeting(hour: number): string {
  if (hour < 5) return 'Hello'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "4h 12m", "35m", "2h". */
export function formatElapsed(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (minutes < 1) return 'Just now'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function shiftLabel(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start?.slice(0, 5)
  const e = end?.slice(0, 5)
  if (s && e) return `${s}–${e}`
  return s ?? null
}

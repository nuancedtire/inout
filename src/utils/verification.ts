/**
 * Verification derivation for attendance evidence. Pure and isomorphic: the server uses it for
 * dashboard rows and exports, and the UI can import the labels. Reasons are always derived from
 * the stored evidence columns, never stored as free text.
 */

export const IDENTITIES = ['passkey', 'passkey_pending', 'self_selected', 'admin'] as const
export type Identity = (typeof IDENTITIES)[number]

export const LOCATION_OUTCOMES = ['inside', 'outside', 'denied', 'unavailable', 'not_requested'] as const
export type LocationOutcome = (typeof LOCATION_OUTCOMES)[number]

/** Reasons derived from one end's evidence (what a staff action result can carry). */
export type FlagReason =
  | 'identity_pending'
  | 'identity_self_selected'
  | 'location_outside'
  | 'location_denied'
  | 'location_unavailable'
  | 'location_not_checked'

/**
 * Reasons for a whole session (dashboard, export, review). Adds `checkout_reported`: the staff
 * member entered their check-out time later, after forgetting to check out; and `shared_phone`:
 * the same phone checked in or out someone else around the same time.
 */
export type SessionFlagReason = FlagReason | 'checkout_reported' | 'shared_phone'

export const FLAG_REASON_LABEL: Record<SessionFlagReason, string> = {
  identity_pending: 'Phone awaiting approval',
  identity_self_selected: 'Picked name without Face ID',
  location_outside: 'Outside the department',
  location_denied: 'Location permission refused',
  location_unavailable: "Location couldn't be confirmed",
  location_not_checked: 'Location not checked',
  checkout_reported: 'Check-out time entered later',
  shared_phone: 'Same phone used for someone else',
}

export const IDENTITY_LABEL: Record<Identity, string> = {
  passkey: 'Passkey',
  passkey_pending: 'Passkey (awaiting approval)',
  self_selected: 'Name picked',
  admin: 'Admin',
}

/** Wording follows the spec: "location check passed", never "location verified". */
export const LOCATION_LABEL: Record<LocationOutcome, string> = {
  inside: 'Location check passed',
  outside: 'Outside the area',
  denied: 'Permission refused',
  unavailable: 'Unavailable',
  not_requested: 'Not checked',
}

/** Legacy rows have NULL evidence: they read as self_selected. */
export function readIdentity(value: string | null | undefined): Identity {
  return (IDENTITIES as readonly string[]).includes(value ?? '') ? (value as Identity) : 'self_selected'
}

/** Legacy rows have NULL evidence: they read as not_requested. */
export function readLocation(value: string | null | undefined): LocationOutcome {
  return (LOCATION_OUTCOMES as readonly string[]).includes(value ?? '') ? (value as LocationOutcome) : 'not_requested'
}

const LOCATION_REASON: Record<Exclude<LocationOutcome, 'inside'>, FlagReason> = {
  outside: 'location_outside',
  denied: 'location_denied',
  unavailable: 'location_unavailable',
  not_requested: 'location_not_checked',
}

/** Flag reasons for one end (check-in or checkout). Admin actions are never flagged. */
export function deriveEndReasons(identity: Identity, location: LocationOutcome): FlagReason[] {
  if (identity === 'admin') return []
  const reasons: FlagReason[] = []
  if (identity === 'passkey_pending') reasons.push('identity_pending')
  if (identity === 'self_selected') reasons.push('identity_self_selected')
  if (location !== 'inside') reasons.push(LOCATION_REASON[location])
  return reasons
}

export type SessionEvidence = {
  identityIn?: string | null
  identityOut?: string | null
  locationIn?: string | null
  locationOut?: string | null
  checkOutAt?: string | null
  reviewState?: string | null
  /** 'reported' when the check-out time was entered later by the staff member. */
  checkoutSource?: string | null
  /** Other people the same phone checked in or out around this session (src/db/samePhone.ts). */
  samePhoneWith?: readonly string[] | null
}

export type Verification = {
  /** Passkey identity and location inside at check-in, and at checkout once checked out (admin ends count as clean). */
  verified: boolean
  /** An administrator accepted the session. Reasons are still reported; the evidence is unchanged. */
  accepted: boolean
  reasons: SessionFlagReason[]
}

/**
 * Open sessions are evaluated on the check-in end only. A reported check-out is always flagged
 * `checkout_reported`; its end keeps the identity reasons, and the location reason is left out
 * because nobody was asked for a location when the time was entered later.
 */
export function deriveVerification(session: SessionEvidence): Verification {
  const reasons: SessionFlagReason[] = deriveEndReasons(readIdentity(session.identityIn), readLocation(session.locationIn))
  if (session.checkOutAt) {
    const reported = session.checkoutSource === 'reported'
    const outReasons = deriveEndReasons(readIdentity(session.identityOut), readLocation(session.locationOut))
      .filter((r) => !(reported && r.startsWith('location_')))
    for (const reason of outReasons) {
      if (!reasons.includes(reason)) reasons.push(reason)
    }
    if (reported) reasons.push('checkout_reported')
  }
  if (session.samePhoneWith?.length) reasons.push('shared_phone')
  return { verified: reasons.length === 0, accepted: session.reviewState === 'accepted', reasons }
}

export function flagLabels(reasons: readonly SessionFlagReason[]): string {
  return reasons.map((r) => FLAG_REASON_LABEL[r]).join('; ')
}

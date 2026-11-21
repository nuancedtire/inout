/**
 * Staff-facing passkey enrolment and passkey-signed attendance. Every function is gated by
 * today's QR token and validates its input at runtime. Coordinates in `location` are evaluated
 * against the department area and discarded: never logged, audited or stored.
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from '#/db/schema'
import { getDb } from '#/db/client'
import { requireCheckInCode } from '#/db/checkInCode'
import { getEntryStatus, performAttendanceAction, type AttendanceOutcome } from '#/db/attendance'
import {
  consumeChallenge,
  getCredential,
  getSiteSettings,
  listExcludableCredentials,
  pruneExpiredChallenges,
  storeChallenge,
} from '#/db/passkeys'
import { auditLog, rosterEntries, staff, staffCredentials } from '#/db/schema'
import {
  findOrCreateEntryForStaff,
  findRecentEntryForStaff,
  isUniqueViolation,
  resolveStaffForEntry,
  resolveStaffForName,
  toStaffSummary,
  type StaffSummary,
} from '#/db/staff'
import { createStaffToken } from './auth'
import { hashDeviceId } from './deviceMarker'
import { assertActive, resolveStaffToken, verifyStaffAssertion, type CredentialStatus } from './passkeyAssertion'
import { INACTIVE_STAFF_MESSAGE } from './staffMessages'
import { evaluateLocation, previewLocation as previewReading, publicArea, type LocationPreviewWithArea, type LocationReading, type PublicArea } from './location'
import { createManualCheckInLimiter } from './manualCheckIn'
import { passkeyLabel } from './passkeyLabels'
import {
  validateBeginEnrolment,
  validateBeginPasskeyAuth,
  validateCheckInArea,
  validateFinishEnrolment,
  validatePasskeyAction,
  validatePreviewLocation,
  validateStaffStatus,
} from './validation'
import { deriveEndReasons, type FlagReason, type Identity, type LocationOutcome } from './verification'
import {
  authenticationOptions,
  challengeFromClientData,
  getRelyingParty,
  registrationOptions,
  type CreationOptionsJSON,
  type RequestOptionsJSON,
  verifyRegistration,
} from './webauthn'

// Not `ReturnType<typeof getDb>`: that keeps the `getDb` import alive in the client bundle, which
// pulls `cloudflare:workers` into the browser build of every page that calls these functions.
type Db = DrizzleD1Database<typeof schema>

export type { StaffSummary, CreationOptionsJSON, RequestOptionsJSON }
export type { CredentialStatus }

/** `rosterEntryId` is null when the staff member has no entry on today's rota yet. */
export type StaffStatus = {
  checkedIn: boolean
  sessionId: number | null
  checkInAt: string | null
  hasUndoableAction: boolean
  rosterEntryId: number | null
}

/** Evidence for the action just recorded (this end only, not the whole session). */
export type ActionResult = {
  action: 'check_in' | 'check_out' | 'checkin_undone' | 'checkout_undone'
  at: string
  identity: Identity
  location: LocationOutcome
  verified: boolean
  reasons: FlagReason[]
}

// Per-isolate, best-effort burst protection per client IP. Generous because a whole department
// may share one network address at shift change.
const LIMIT_MESSAGE = 'Too many passkey requests. Please wait a minute and try again.'
export { INACTIVE_STAFF_MESSAGE }
const checkBeginLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)
const checkFinishLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)

function clientIp() {
  return getRequestHeader('CF-Connecting-IP')
}

async function requireTodayRota(db: Db, token: string) {
  return requireCheckInCode(db, token)
}

async function statusForStaff(db: Db, rotaId: number, staffId: number): Promise<StaffStatus> {
  // A night shift that began on yesterday's rota is still "in" after midnight.
  const entry = await findRecentEntryForStaff(db, staffId, { openOnly: true })
    ?? await db.select({ id: rosterEntries.id }).from(rosterEntries)
      .where(and(eq(rosterEntries.rotaId, rotaId), eq(rosterEntries.staffId, staffId))).get()
  if (!entry) return { checkedIn: false, sessionId: null, checkInAt: null, hasUndoableAction: false, rosterEntryId: null }
  return { ...(await getEntryStatus(db, entry.id)), rosterEntryId: entry.id }
}

function actionResult(outcome: AttendanceOutcome, identity: Identity, location: LocationOutcome): ActionResult {
  const reasons = outcome.action === 'check_in' || outcome.action === 'check_out' ? deriveEndReasons(identity, location) : []
  return { action: outcome.action, at: outcome.at, identity, location, verified: reasons.length === 0, reasons }
}

async function evaluate(db: Db, reading: LocationReading | undefined) {
  return evaluateLocation(reading, reading ? await getSiteSettings(db) : null)
}

// ═══════════════════════════════════════════════════════════════════
// Enrolment
// ═══════════════════════════════════════════════════════════════════

export const beginEnrolment = createServerFn({ method: 'POST' })
  .validator(validateBeginEnrolment)
  .handler(async ({ data }): Promise<{ optionsJSON: CreationOptionsJSON; staff: StaffSummary }> => {
    checkBeginLimit(clientIp())
    const db = await getDb()
    const rota = await requireTodayRota(db, data.token)
    const rp = await getRelyingParty()
    await pruneExpiredChallenges(db)

    let person
    let entryId: number
    if ('rosterEntryId' in data) {
      const entry = await db.select().from(rosterEntries)
        .where(and(eq(rosterEntries.id, data.rosterEntryId), eq(rosterEntries.rotaId, rota.id))).get()
      if (!entry) throw new Error('Staff not found')
      person = await resolveStaffForEntry(db, entry)
      assertActive(person)
      entryId = entry.id
    } else {
      person = await resolveStaffForName(db, data.name, data.role ?? null)
      entryId = (await findOrCreateEntryForStaff(db, rota.id, person)).id
    }

    const optionsJSON = await registrationOptions(rp, person, await listExcludableCredentials(db, person.id))
    await storeChallenge(db, { challenge: optionsJSON.challenge, purpose: 'register', staffId: person.id, rosterEntryId: entryId })
    return { optionsJSON, staff: toStaffSummary(person) }
  })

export const finishEnrolment = createServerFn({ method: 'POST' })
  .validator(validateFinishEnrolment)
  .handler(async ({ data }): Promise<{
    staff: StaffSummary
    credential: { id: string; status: 'pending' }
    staffToken: string
    status: StaffStatus
    session?: ActionResult
  }> => {
    checkFinishLimit(clientIp())
    const db = await getDb()
    const rota = await requireTodayRota(db, data.token)
    const rp = await getRelyingParty()

    const challenge = await consumeChallenge(db, challengeFromClientData(data.response.response.clientDataJSON), 'register')
    if (!challenge?.staffId) throw new Error('This set-up request has expired. Please start again.')
    const person = await db.select().from(staff).where(eq(staff.id, challenge.staffId)).get()
    if (!person) throw new Error('This set-up request has expired. Please start again.')
    assertActive(person)

    const info = await verifyRegistration(rp, data.response, challenge.challenge)
    const credentialId = info.credential.id
    if (await getCredential(db, credentialId)) throw new Error('This passkey is already set up.')

    // The entry chosen at the start, if still linked to this person on today's rota.
    let entry = challenge.rosterEntryId
      ? await db.select().from(rosterEntries).where(and(
          eq(rosterEntries.id, challenge.rosterEntryId),
          eq(rosterEntries.rotaId, rota.id),
          eq(rosterEntries.staffId, person.id),
        )).get()
      : undefined
    entry ??= await findOrCreateEntryForStaff(db, rota.id, person)

    const label = passkeyLabel(info.aaguid, getRequestHeader('User-Agent'))
    const deviceHash = await hashDeviceId(data.deviceId)
    const transports = data.response.response.transports ?? info.credential.transports
    const enrolStatements = [
      db.insert(staffCredentials).values({
        id: credentialId,
        staffId: person.id,
        publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
        counter: info.credential.counter,
        transports: transports?.length ? JSON.stringify(transports) : null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        label,
        status: 'pending',
        deviceHash,
      }),
      db.insert(auditLog).values({
        event: 'passkey_enrolled',
        details: JSON.stringify({ staffId: person.id, name: person.name, credentialId, label, entryId: entry.id }),
        actor: 'staff',
      }),
    ] as const

    let session: ActionResult | undefined
    const wantsCheckIn = data.checkIn && !(await findRecentEntryForStaff(db, person.id, { openOnly: true }))
      && !(await getEntryStatus(db, entry.id)).checkedIn
    try {
      if (wantsCheckIn) {
        // Registration with user verification counts as identity evidence: one Face ID on the first visit.
        const location = await evaluate(db, data.checkIn?.location)
        try {
          const outcome = await performAttendanceAction(db, {
            entry,
            action: 'check_in',
            token: data.token,
            evidence: { identity: 'passkey_pending', credentialId, location: location.outcome, accuracyM: location.accuracyM, deviceHash },
            auditDetails: { staffId: person.id },
            extra: [...enrolStatements],
          })
          session = actionResult(outcome, 'passkey_pending', location.outcome)
        } catch (e) {
          // Checked in elsewhere in the meantime: still save the passkey.
          if (!(e instanceof Error && e.message === "You're already checked in")) throw e
          await db.batch([...enrolStatements])
        }
      } else {
        await db.batch([...enrolStatements])
      }
    } catch (e) {
      if (isUniqueViolation(e, 'staff_credentials')) throw new Error('This passkey is already set up.')
      throw e
    }

    return {
      staff: toStaffSummary(person),
      credential: { id: credentialId, status: 'pending' },
      staffToken: await createStaffToken(person.id, credentialId),
      status: await statusForStaff(db, rota.id, person.id),
      ...(session ? { session } : {}),
    }
  })

// ═══════════════════════════════════════════════════════════════════
// Passkey-signed actions
// ═══════════════════════════════════════════════════════════════════

export const beginPasskeyAuth = createServerFn({ method: 'POST' })
  .validator(validateBeginPasskeyAuth)
  .handler(async ({ data }): Promise<{ optionsJSON: RequestOptionsJSON }> => {
    checkBeginLimit(clientIp())
    const db = await getDb()
    await requireTodayRota(db, data.token)
    const rp = await getRelyingParty()
    await pruneExpiredChallenges(db)
    const optionsJSON = await authenticationOptions(rp)
    await storeChallenge(db, { challenge: optionsJSON.challenge, purpose: 'authenticate' })
    return { optionsJSON }
  })

export const passkeyAction = createServerFn({ method: 'POST' })
  .validator(validatePasskeyAction)
  .handler(async ({ data }): Promise<{
    staff: StaffSummary
    credentialStatus: CredentialStatus
    staffToken: string
    status: StaffStatus
    result?: ActionResult
  }> => {
    // Order: shape/size (validator); rate limit; QR token; challenge; credential; signature.
    checkFinishLimit(clientIp())
    const db = await getDb()
    const rota = await requireTodayRota(db, data.token)
    const rp = await getRelyingParty()

    const { person, credential, credentialStatus, identity, usage } = await verifyStaffAssertion(db, rp, data.response)

    let result: ActionResult | undefined
    if (data.action === 'identify') {
      await usage
    } else {
      // Check-out and undo follow the person's latest session, even one that began on yesterday's
      // rota (night shifts). Check-in refuses while a recent session is still open anywhere.
      const recent = await findRecentEntryForStaff(db, person.id, { openOnly: data.action !== 'undo' })
      if (data.action === 'check_in' && recent) throw new Error("You're already checked in")
      const entry = data.action === 'check_in'
        ? await findOrCreateEntryForStaff(db, rota.id, person)
        : recent ?? await db.select().from(rosterEntries)
            .where(and(eq(rosterEntries.rotaId, rota.id), eq(rosterEntries.staffId, person.id))).get()
      if (!entry) throw new Error(data.action === 'check_out' ? "You're not checked in" : 'Nothing to undo')
      const location = data.action === 'undo'
        ? { outcome: 'not_requested' as const, accuracyM: null }
        : await evaluate(db, data.location)
      const outcome = await performAttendanceAction(db, {
        entry,
        action: data.action,
        token: data.token,
        evidence: {
          identity,
          credentialId: credential.id,
          location: location.outcome,
          accuracyM: location.accuracyM,
          deviceHash: data.action === 'undo' ? null : await hashDeviceId(data.deviceId),
        },
        auditDetails: { staffId: person.id },
        extra: [usage],
      })
      result = actionResult(outcome, identity, location.outcome)
    }

    return {
      staff: toStaffSummary(person),
      credentialStatus,
      staffToken: await createStaffToken(person.id, credential.id),
      status: await statusForStaff(db, rota.id, person.id),
      ...(result ? { result } : {}),
    }
  })

/**
 * Who this device belongs to, from the remembered staff token. A display hint only: every
 * attendance action still needs a fresh passkey assertion. Returns `staff: null` when the token
 * is invalid or the passkey has been rejected or revoked.
 */
export const getStaffStatus = createServerFn({ method: 'POST' })
  .validator(validateStaffStatus)
  .handler(async ({ data }): Promise<
    | { staff: StaffSummary; credentialStatus: CredentialStatus; status: StaffStatus }
    | { staff: null }
  > => {
    const db = await getDb()
    const rota = await requireTodayRota(db, data.token)
    const resolved = await resolveStaffToken(db, data.staffToken)
    if (!resolved) return { staff: null }
    const { person } = resolved
    return {
      staff: toStaffSummary(person),
      credentialStatus: resolved.credentialStatus,
      status: await statusForStaff(db, rota.id, person.id),
    }
  })

const checkPreviewLimit = createManualCheckInLimiter(60, 60_000, 'Too many location checks. Please wait a minute and try again.')
const checkAreaLimit = createManualCheckInLimiter(60, 60_000, 'Too many requests. Please wait a minute and try again.')

export type { PublicArea }

/**
 * "Am I in the department?" for the staff home screen, before anyone slides. Uses the same rule
 * as check-in and records nothing: no session, no audit row, no coordinates. Also returns the
 * department area (a public hospital location) so the phone can draw it on a map.
 */
export const previewLocation = createServerFn({ method: 'POST' })
  .validator(validatePreviewLocation)
  .handler(async ({ data }): Promise<LocationPreviewWithArea> => {
    checkPreviewLimit(clientIp())
    const db = await getDb()
    await requireTodayRota(db, data.token)
    const site = await getSiteSettings(db)
    return { ...previewReading(data.location, site), area: publicArea(site) }
  })

/**
 * The department area for staff maps, before any reading is taken. Gated by the current QR code
 * like every staff function; returns `null` when no area is configured.
 */
export const getCheckInArea = createServerFn({ method: 'POST' })
  .validator(validateCheckInArea)
  .handler(async ({ data }): Promise<{ area: PublicArea | null }> => {
    checkAreaLimit(clientIp())
    const db = await getDb()
    await requireTodayRota(db, data.token)
    return { area: publicArea(await getSiteSettings(db)) }
  })

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
import { getEntryStatus, performAttendanceAction, type AttendanceOutcome } from '#/db/attendance'
import {
  consumeChallenge,
  getCredential,
  getSiteSettings,
  listExcludableCredentials,
  parseTransports,
  pruneExpiredChallenges,
  storeChallenge,
} from '#/db/passkeys'
import { auditLog, rosterEntries, rotas, staff, staffCredentials } from '#/db/schema'
import {
  findOrCreateEntryForStaff,
  isUniqueViolation,
  resolveStaffForEntry,
  resolveStaffForName,
  toStaffSummary,
  type StaffSummary,
} from '#/db/staff'
import { createStaffToken, verifyStaffToken } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'
import { evaluateLocation, type LocationReading } from './location'
import { createManualCheckInLimiter } from './manualCheckIn'
import { passkeyLabel } from './passkeyLabels'
import {
  validateBeginEnrolment,
  validateBeginPasskeyAuth,
  validateFinishEnrolment,
  validatePasskeyAction,
  validateStaffStatus,
} from './validation'
import { deriveEndReasons, type FlagReason, type Identity, type LocationOutcome } from './verification'
import {
  authenticationOptions,
  challengeFromClientData,
  CounterRegressionError,
  getRelyingParty,
  registrationOptions,
  type CreationOptionsJSON,
  type RequestOptionsJSON,
  userHandleFor,
  verifyAuthentication,
  verifyRegistration,
} from './webauthn'

// Not `ReturnType<typeof getDb>`: that keeps the `getDb` import alive in the client bundle, which
// pulls `cloudflare:workers` into the browser build of every page that calls these functions.
type Db = DrizzleD1Database<typeof schema>

export type { StaffSummary, CreationOptionsJSON, RequestOptionsJSON }
export type CredentialStatus = 'pending' | 'approved'

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
/** A deactivated staff record is treated like a revoked passkey: it cannot enrol or sign actions. */
export const INACTIVE_STAFF_MESSAGE = 'This profile has been turned off. Ask the coordinator.'

function assertActive(person: { active: boolean }) {
  if (!person.active) throw new Error(INACTIVE_STAFF_MESSAGE)
}
const checkBeginLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)
const checkFinishLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)

function clientIp() {
  return getRequestHeader('CF-Connecting-IP')
}

async function requireTodayRota(db: Db, token: string) {
  const rota = await db.select({ id: rotas.id, token: rotas.token }).from(rotas)
    .where(eq(rotas.date, todayDate())).get()
  if (!rota || rota.token !== token) throw new Error('Invalid or expired QR code')
  return rota
}

async function statusForStaff(db: Db, rotaId: number, staffId: number): Promise<StaffStatus> {
  const entry = await db.select({ id: rosterEntries.id }).from(rosterEntries)
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
      }),
      db.insert(auditLog).values({
        event: 'passkey_enrolled',
        details: JSON.stringify({ staffId: person.id, name: person.name, credentialId, label, entryId: entry.id }),
        actor: 'staff',
      }),
    ] as const

    let session: ActionResult | undefined
    const wantsCheckIn = data.checkIn && !(await getEntryStatus(db, entry.id)).checkedIn
    try {
      if (wantsCheckIn) {
        // Registration with user verification counts as identity evidence: one Face ID on the first visit.
        const location = await evaluate(db, data.checkIn?.location)
        try {
          const outcome = await performAttendanceAction(db, {
            entry,
            action: 'check_in',
            token: data.token,
            evidence: { identity: 'passkey_pending', credentialId, location: location.outcome, accuracyM: location.accuracyM },
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
      status: { ...(await getEntryStatus(db, entry.id)), rosterEntryId: entry.id },
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

    const challenge = await consumeChallenge(db, challengeFromClientData(data.response.response.clientDataJSON), 'authenticate')
    if (!challenge) throw new Error('This sign-in request has expired or was already used. Please try again.')

    const credential = await getCredential(db, data.response.id)
    if (!credential) {
      throw new Error("This phone's passkey isn't set up with InOut. Choose \"Set up this phone\" to enrol again.")
    }
    if (credential.status !== 'pending' && credential.status !== 'approved') {
      throw new Error("This phone's passkey has been turned off. Ask the coordinator, or set up this phone again.")
    }
    const handle = data.response.response.userHandle
    if (handle && handle !== userHandleFor(credential.staffId)) {
      throw new Error("Your phone's passkey couldn't be checked. Please try again.")
    }

    let info
    try {
      info = await verifyAuthentication(rp, data.response, challenge.challenge, {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: parseTransports(credential.transports),
      })
    } catch (e) {
      if (e instanceof CounterRegressionError) {
        await logAudit('passkey_counter_regression', { staffId: credential.staffId, credentialId: credential.id }, 'system')
      }
      throw e
    }

    const person = await db.select().from(staff).where(eq(staff.id, credential.staffId)).get()
    if (!person) throw new Error('Staff member not found')
    assertActive(person)
    const credentialStatus: CredentialStatus = credential.status
    const identity: Identity = credentialStatus === 'approved' ? 'passkey' : 'passkey_pending'
    const usage = db.update(staffCredentials)
      .set({ counter: info.newCounter, lastUsedAt: new Date().toISOString(), backedUp: info.credentialBackedUp })
      .where(eq(staffCredentials.id, credential.id))

    let result: ActionResult | undefined
    if (data.action === 'identify') {
      await usage
    } else {
      const entry = data.action === 'check_in'
        ? await findOrCreateEntryForStaff(db, rota.id, person)
        : await db.select().from(rosterEntries)
            .where(and(eq(rosterEntries.rotaId, rota.id), eq(rosterEntries.staffId, person.id))).get()
      if (!entry) throw new Error(data.action === 'check_out' ? "You're not checked in" : 'Nothing to undo')
      const location = data.action === 'undo'
        ? { outcome: 'not_requested' as const, accuracyM: null }
        : await evaluate(db, data.location)
      const outcome = await performAttendanceAction(db, {
        entry,
        action: data.action,
        token: data.token,
        evidence: { identity, credentialId: credential.id, location: location.outcome, accuracyM: location.accuracyM },
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
    const claims = await verifyStaffToken(data.staffToken)
    if (!claims) return { staff: null }
    const credential = await getCredential(db, claims.credentialId)
    if (!credential || credential.staffId !== claims.staffId
      || (credential.status !== 'pending' && credential.status !== 'approved')) {
      return { staff: null }
    }
    const person = await db.select().from(staff).where(eq(staff.id, claims.staffId)).get()
    if (!person?.active) return { staff: null }
    return {
      staff: toStaffSummary(person),
      credentialStatus: credential.status,
      status: await statusForStaff(db, rota.id, person.id),
    }
  })

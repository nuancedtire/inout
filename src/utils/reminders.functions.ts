/**
 * Staff-facing shift-end reminders and reported check-outs.
 *
 * - `getPushConfig`: whether reminders are configured, and the VAPID public key for
 *   `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
 * - `subscribePush` / `unsubscribePush`: bind a browser push subscription to the staff record
 *   named by this phone's staff token.
 * - `getForgottenCheckout`: an open session whose shift is clearly over (expected end + 60 min).
 * - `reportForgottenCheckout`: save the time the person says they left, with a fresh passkey
 *   assertion; flagged `checkout_reported` for coordinator review.
 *
 * Every function except getPushConfig is gated by the check-in code, validates its input at
 * runtime and is rate limited per client IP (best-effort, per isolate).
 */
import { hashDeviceId } from './deviceMarker'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { and, desc, eq, gte, isNull, notInArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from '#/db/schema'
import { getDb } from '#/db/client'
import { requireCheckInCode } from '#/db/checkInCode'
import { auditIfChanged } from '#/db/attendance'
import { pushSubscriptions, rosterEntries, rotas, sessions } from '#/db/schema'
import { CARRY_OVER_MS, toStaffSummary, type StaffSummary } from '#/db/staff'
import { createStaffToken, verifyStaffToken } from './auth'
import { createManualCheckInLimiter } from './manualCheckIn'
import { resolveStaffToken, verifyStaffAssertion, type CredentialStatus } from './passkeyAssertion'
import { deviceLabelFromUserAgent } from './passkeyLabels'
import { getPushConfig as readPushConfig } from './push'
import {
  validateForgottenCheckout,
  validateReportForgottenCheckout,
  validateSubscribePush,
  validateUnsubscribePush,
} from './reminderValidation'
import { expectedShiftEnd, FORGOTTEN_MAX_AGE_MS, isForgottenSession, shiftLabel } from './shiftEnd'
import { deriveVerification, type SessionFlagReason } from './verification'
import { getRelyingParty } from './webauthn'

type Db = DrizzleD1Database<typeof schema>

export type PushConfigResult = { enabled: boolean; publicKey: string | null }

export type ForgottenCheckout = {
  id: number
  checkInAt: string
  /** ISO time the shift was expected to end (rota shift end, or check-in + 12 h). */
  expectedEndAt: string
  /** "08:00–20:00" when the rota has both times, else null. */
  shiftLabel: string | null
  /**
   * True when an ordinary passkey check-out would still close this session (it is the latest
   * open one and began within the 20-hour carry-over) — e.g. someone still at work late.
   */
  canCheckOutNow: boolean
}

export type ReportedCheckoutResult = {
  sessionId: number
  checkInAt: string
  checkOutAt: string
  staff: StaffSummary
  credentialStatus: CredentialStatus
  staffToken: string
  /** Session flags after the report; always includes 'checkout_reported'. */
  reasons: SessionFlagReason[]
}

/** Most subscriptions kept per staff member (one per phone/browser); oldest are dropped. */
export const MAX_SUBSCRIPTIONS_PER_STAFF = 5
/** Reported leaving time must be within this long after check-in. */
export const MAX_REPORTED_SHIFT_MS = 24 * 60 * 60 * 1000
/** Clock skew allowed for a "now" leaving time; later values are refused, earlier ones clamped. */
const FUTURE_SKEW_MS = 2 * 60 * 1000

const NOT_FOUND = "That shift couldn't be found."
const LIMIT_MESSAGE = 'Too many requests. Please wait a minute and try again.'
const checkSubscribeLimit = createManualCheckInLimiter(30, 60_000, LIMIT_MESSAGE)
const checkForgottenLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)
const checkReportLimit = createManualCheckInLimiter(60, 60_000, LIMIT_MESSAGE)

function clientIp() {
  return getRequestHeader('CF-Connecting-IP')
}

// ═══════════════════════════════════════════════════════════════════
// Push subscriptions
// ═══════════════════════════════════════════════════════════════════

/** Public: no secrets. `enabled: false` when VAPID keys are not configured. */
export const getPushConfig = createServerFn({ method: 'GET' })
  .handler(async (): Promise<PushConfigResult> => {
    const config = await readPushConfig()
    return { enabled: config.enabled, publicKey: config.publicKey }
  })

export const subscribePush = createServerFn({ method: 'POST' })
  .validator(validateSubscribePush)
  .handler(async ({ data }): Promise<{ subscribed: true }> => {
    checkSubscribeLimit(clientIp())
    const db = await getDb()
    await requireCheckInCode(db, data.token)
    if (!(await readPushConfig()).enabled) throw new Error('Reminders are not available yet.')
    const resolved = await resolveStaffToken(db, data.staffToken)
    if (!resolved) throw new Error('Set up this phone with InOut again to turn on reminders.')

    const { endpoint, keys } = data.subscription
    const values = {
      staffId: resolved.person.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: deviceLabelFromUserAgent(getRequestHeader('User-Agent')),
      failureCount: 0,
    }
    // The endpoint belongs to this browser: re-subscribing (or a phone handed to someone else
    // who enrols) moves it to the staff member now signed in on it.
    const keep = db.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
      .where(eq(pushSubscriptions.staffId, resolved.person.id))
      .orderBy(desc(pushSubscriptions.id)).limit(MAX_SUBSCRIPTIONS_PER_STAFF)
    await db.batch([
      db.insert(pushSubscriptions).values({ endpoint, ...values })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values }),
      db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.staffId, resolved.person.id),
        notInArray(pushSubscriptions.id, keep),
      )),
    ])
    return { subscribed: true }
  })

/** Removes this browser's subscription if it belongs to the staff member named by the token. */
export const unsubscribePush = createServerFn({ method: 'POST' })
  .validator(validateUnsubscribePush)
  .handler(async ({ data }): Promise<{ removed: boolean }> => {
    checkSubscribeLimit(clientIp())
    const db = await getDb()
    await requireCheckInCode(db, data.token)
    // Signature only: a revoked passkey may still turn its own reminders off.
    const claims = await verifyStaffToken(data.staffToken)
    if (!claims) return { removed: false }
    const removed = await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, data.endpoint), eq(pushSubscriptions.staffId, claims.staffId)))
      .returning({ id: pushSubscriptions.id })
    return { removed: removed.length > 0 }
  })

// ═══════════════════════════════════════════════════════════════════
// Forgotten check-outs
// ═══════════════════════════════════════════════════════════════════

async function openSessionsForStaff(db: Db, staffId: number, now: Date) {
  return db.select({
    id: sessions.id,
    rosterEntryId: sessions.rosterEntryId,
    checkInAt: sessions.checkInAt,
    checkOutAt: sessions.checkOutAt,
    rotaDate: rotas.date,
    shiftStart: rosterEntries.shiftStart,
    shiftEnd: rosterEntries.shiftEnd,
    name: rosterEntries.name,
    staffId: rosterEntries.staffId,
  })
    .from(sessions)
    .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
    .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
    .where(and(
      eq(rosterEntries.staffId, staffId),
      isNull(sessions.checkOutAt),
      gte(sessions.checkInAt, new Date(now.getTime() - FORGOTTEN_MAX_AGE_MS).toISOString()),
    ))
    .orderBy(desc(sessions.checkInAt), desc(sessions.id))
    .limit(20)
    .all()
}

/**
 * The staff member's most recent forgotten session (open, past expected end + 60 min, started
 * within 7 days), or null. Older open sessions are left to the coordinator.
 */
export const getForgottenCheckout = createServerFn({ method: 'POST' })
  .validator(validateForgottenCheckout)
  .handler(async ({ data }): Promise<{ session: ForgottenCheckout | null }> => {
    checkForgottenLimit(clientIp())
    const db = await getDb()
    await requireCheckInCode(db, data.token)
    const resolved = await resolveStaffToken(db, data.staffToken)
    if (!resolved) return { session: null }
    const now = new Date()
    const open = await openSessionsForStaff(db, resolved.person.id, now)
    const forgotten = open.find((s) => isForgottenSession(s, now))
    if (!forgotten) return { session: null }
    return {
      session: {
        id: forgotten.id,
        checkInAt: forgotten.checkInAt,
        expectedEndAt: expectedShiftEnd(forgotten).expectedEndAt.toISOString(),
        shiftLabel: shiftLabel(forgotten.shiftStart, forgotten.shiftEnd),
        canCheckOutNow: open[0]?.id === forgotten.id && now.getTime() - Date.parse(forgotten.checkInAt) <= CARRY_OVER_MS,
      },
    }
  })

/**
 * Close one of the signer's open sessions at the time they say they left. Needs a challenge from
 * `beginPasskeyAuth` and a fresh assertion; `leftAt` must be after check-in, not in the future
 * and within 24 hours of check-in. One D1 batch writes the check-out with its evidence
 * (identity per credential status, location 'not_requested', source 'reported'), the audit row
 * and the credential counter.
 */
export const reportForgottenCheckout = createServerFn({ method: 'POST' })
  .validator(validateReportForgottenCheckout)
  .handler(async ({ data }): Promise<ReportedCheckoutResult> => {
    checkReportLimit(clientIp())
    const db = await getDb()
    await requireCheckInCode(db, data.token)

    // Time checks first, so a mistyped time doesn't spend the person's Face ID.
    const session = await db.select({
      id: sessions.id,
      checkInAt: sessions.checkInAt,
      checkOutAt: sessions.checkOutAt,
      rosterEntryId: sessions.rosterEntryId,
      name: rosterEntries.name,
      staffId: rosterEntries.staffId,
      rotaDate: rotas.date,
      shiftStart: rosterEntries.shiftStart,
      shiftEnd: rosterEntries.shiftEnd,
    })
      .from(sessions)
      .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
      .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
      .where(eq(sessions.id, data.sessionId)).get()
    if (!session || session.staffId === null) throw new Error(NOT_FOUND)
    if (session.checkOutAt) throw new Error("You've already checked out of that shift.")
    const now = Date.now()
    const checkIn = Date.parse(session.checkInAt)
    const left = Date.parse(data.leftAt)
    if (!(left > checkIn)) throw new Error('Choose a time after you checked in.')
    if (left > now + FUTURE_SKEW_MS) throw new Error("That time hasn't happened yet.")
    if (left - checkIn > MAX_REPORTED_SHIFT_MS) throw new Error('Choose a time within 24 hours of checking in.')
    const checkOutAt = new Date(Math.min(left, now)).toISOString()

    const rp = await getRelyingParty()
    const { person, credential, credentialStatus, identity, usage } = await verifyStaffAssertion(db, rp, data.response)
    if (session.staffId !== person.id) throw new Error(NOT_FOUND)

    const [updated] = await db.batch([
      db.update(sessions).set({
        checkOutAt,
        qrTokenOut: data.token,
        identityOut: identity,
        credentialIdOut: credential.id,
        locationOut: 'not_requested',
        accuracyOutM: null,
        checkoutSource: 'reported',
        deviceHashOut: await hashDeviceId(data.deviceId),
      }).where(and(eq(sessions.id, session.id), isNull(sessions.checkOutAt))).returning({ id: sessions.id }),
      auditIfChanged(db, 'checkout_reported', {
        sessionId: session.id,
        entryId: session.rosterEntryId,
        name: session.name,
        staffId: person.id,
        identity,
        credentialId: credential.id,
        checkInAt: session.checkInAt,
        leftAt: checkOutAt,
        expectedEndAt: expectedShiftEnd(session).expectedEndAt.toISOString(),
      }, 'staff'),
      usage,
    ])
    if (!(updated as unknown[]).length) throw new Error("You've already checked out of that shift.")

    const row = await db.select().from(sessions).where(eq(sessions.id, session.id)).get()
    return {
      sessionId: session.id,
      checkInAt: session.checkInAt,
      checkOutAt,
      staff: toStaffSummary(person),
      credentialStatus,
      staffToken: await createStaffToken(person.id, credential.id),
      reasons: row ? deriveVerification(row).reasons : ['checkout_reported'],
    }
  })

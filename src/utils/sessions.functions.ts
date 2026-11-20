import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { getDb } from '#/db/client'
import { updateAttendanceSession, deleteAttendanceEntry, getEntryStatus, performAttendanceAction } from '#/db/attendance'
import { countPendingEnrolments, getSiteSettings } from '#/db/passkeys'
import { rotas, rosterEntries, sessions, auditLog } from '#/db/schema'
import { eq, and, isNull, isNotNull, sql, desc, asc, gte, lte, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from '#/db/schema'
import { verifyAdminPin, createSessionToken, requireAdmin } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'
import { evaluateLocation, type LocationReading } from './location'
import { createManualCheckInLimiter, validateManualCheckIn } from './manualCheckIn'
import {
  validateAdminDate,
  validateAdminAuth,
  validateAdminEntryId,
  validateAdminSessionId,
  validateAdminUpdateSession,
  validateEntryAction,
  validateEntryId,
  validateEntryWithToken,
  validateExportRange,
  validatePin,
  validatePrune,
  validateWeekRange,
} from './validation'
import {
  deriveEndReasons,
  deriveVerification,
  readIdentity,
  readLocation,
  type FlagReason,
  type Identity,
  type LocationOutcome,
} from './verification'

type Db = DrizzleD1Database<typeof schema>

// ═══════════════════════════════════════════════════════════════════
// Shared DB helpers — single source of truth for all queries
// ═══════════════════════════════════════════════════════════════════

/** Simple in-memory rate limiter (per-isolate, best-effort).
 *  Not shared across isolates. For production, use Cloudflare WAF rules. */
const rateLimiters = new Map<string, number>()
const RATE_LIMIT_WINDOW_MS = 3_000 // 3 seconds between requests

function checkRateLimit(key: string): void {
  const last = rateLimiters.get(key)
  const now = Date.now()
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    throw new Error('Too many requests. Please wait a moment.')
  }
  rateLimiters.set(key, now)
}

async function getRotaForDate(date: string) {
  const db = await getDb()
  return db
    .select({ id: rotas.id, token: rotas.token })
    .from(rotas)
    .where(eq(rotas.date, date))
    .get()
}

// ═══════════════════════════════════════════════════════════════════
// Auth endpoint — returns a session token (not the PIN)
// ═══════════════════════════════════════════════════════════════════

export const adminVerifyPin = createServerFn({ method: 'POST' })
  .validator(validatePin)
  .handler(async ({ data }) => {
    if (!(await verifyAdminPin(data.pin))) throw new Error('Invalid admin PIN')
    const token = await createSessionToken()
    return { ok: true, token }
  })

// ═══════════════════════════════════════════════════════════════════
// Staff-facing functions (QR-token gated — no admin auth needed)
// ═══════════════════════════════════════════════════════════════════

/** Evidence-bearing result for a name-picked ("Use without Face ID") action. */
export type FallbackActionResult = {
  action: 'check_in' | 'check_out' | 'checkin_undone' | 'checkout_undone'
  at: string
  identity: Identity
  location: LocationOutcome
  verified: boolean
  reasons: FlagReason[]
}

async function evaluateReading(db: Db, reading: LocationReading | undefined) {
  return evaluateLocation(reading, reading ? await getSiteSettings(db) : null)
}

async function selfSelectedAction(
  data: { rosterEntryId: number; token: string; location?: LocationReading },
  action: 'check_in' | 'check_out' | 'undo',
) {
  const db = await getDb()
  const rota = await getRotaForDate(todayDate())
  if (!rota || rota.token !== data.token) throw new Error('Invalid or expired QR code')
  const entry = await db.select({ id: rosterEntries.id, name: rosterEntries.name }).from(rosterEntries)
    .where(and(eq(rosterEntries.id, data.rosterEntryId), eq(rosterEntries.rotaId, rota.id))).get()
  if (!entry) throw new Error('Staff not found')
  const location = action === 'undo'
    ? { outcome: 'not_requested' as const, accuracyM: null }
    : await evaluateReading(db, data.location)
  const outcome = await performAttendanceAction(db, {
    entry,
    action,
    token: data.token,
    evidence: { identity: 'self_selected', credentialId: null, location: location.outcome, accuracyM: location.accuracyM },
  })
  const reasons = action === 'undo' ? [] : deriveEndReasons('self_selected', location.outcome)
  const result: FallbackActionResult = {
    action: outcome.action, at: outcome.at, identity: 'self_selected', location: location.outcome, verified: reasons.length === 0, reasons,
  }
  return { outcome, result }
}

export const checkIn = createServerFn({ method: 'POST' })
  .validator(validateEntryAction)
  .handler(async ({ data }) => {
    checkRateLimit(`checkin:${data.rosterEntryId}`)
    const { outcome, result } = await selfSelectedAction(data, 'check_in')
    return { ok: true, at: outcome.at, sessionId: outcome.sessionId, result }
  })

export const checkOut = createServerFn({ method: 'POST' })
  .validator(validateEntryAction)
  .handler(async ({ data }) => {
    checkRateLimit(`checkout:${data.rosterEntryId}`)
    const { outcome, result } = await selfSelectedAction(data, 'check_out')
    return { ok: true, at: outcome.at, result }
  })

/** Name-picked undo cannot reverse a passkey action or an administrator change. */
export const undoLastAction = createServerFn({ method: 'POST' })
  .validator(validateEntryWithToken)
  .handler(async ({ data }) => {
    checkRateLimit(`undo:${data.rosterEntryId}`)
    const { outcome } = await selfSelectedAction(data, 'undo')
    return { ok: true, action: outcome.action as 'checkin_undone' | 'checkout_undone' }
  })

export const getStatus = createServerFn({ method: 'GET' })
  .validator(validateEntryId)
  .handler(async ({ data }) => {
    checkRateLimit(`status:${data.rosterEntryId}`)
    return getEntryStatus(await getDb(), data.rosterEntryId)
  })

const checkManualCheckInLimit = createManualCheckInLimiter()

export const manualCheckIn = createServerFn({ method: 'POST' })
  .validator(validateManualCheckIn)
  .handler(async ({ data }) => {
    // Cloudflare supplies this header. Do not trust client-controlled forwarding headers.
    // Count attempts before any database access, including invalid/expired QR tokens.
    checkManualCheckInLimit(getRequestHeader('CF-Connecting-IP'))
    const db = await getDb()
    const date = todayDate()

    // Validate QR token — but do NOT auto-create a rota
    const rota = await getRotaForDate(date)
    if (!rota) {
      throw new Error('No rota for today. Ask an admin to upload the rota first.')
    }

    if (rota.token !== data.token) {
      throw new Error('Invalid or expired QR code')
    }

    const [entryInserted] = await db
      .insert(rosterEntries)
      .values({
        rotaId: rota.id,
        name: data.name,
        role: data.role || null,
        source: 'manual',
      })
      .returning({ id: rosterEntries.id })

    const entryId = entryInserted.id
    const now = new Date().toISOString()
    const location = await evaluateReading(db, data.location)

    const [sessInserted] = await db
      .insert(sessions)
      .values({
        rosterEntryId: entryId,
        checkInAt: now,
        qrTokenIn: data.token,
        identityIn: 'self_selected',
        locationIn: location.outcome,
        accuracyInM: location.accuracyM,
      })
      .returning({ id: sessions.id })

    await logAudit(
      'manual_checkin',
      { entryId, name: data.name, role: data.role, sessionId: sessInserted.id, identity: 'self_selected', location: location.outcome },
      'staff',
    )

    const reasons = deriveEndReasons('self_selected', location.outcome)
    const result: FallbackActionResult = {
      action: 'check_in', at: now, identity: 'self_selected', location: location.outcome, verified: reasons.length === 0, reasons,
    }
    return { ok: true, entryId, sessionId: sessInserted.id, result }
  })

export const getStaffHistory = createServerFn({ method: 'POST' })
  .validator(validateEntryWithToken)
  .handler(async ({ data }) => {
    const db = await getDb()
    const date = todayDate()
    const rota = await getRotaForDate(date)

    if (!rota || rota.token !== data.token) {
      throw new Error('Invalid or expired QR code')
    }

    const result = await db
      .select({
        date: rotas.date,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
        checkInAt: sessions.checkInAt,
        checkOutAt: sessions.checkOutAt,
        hours: sql<number>`(julianday(${sessions.checkOutAt}) - julianday(${sessions.checkInAt})) * 24`.mapWith(Number),
      })
      .from(sessions)
      .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
      .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
      .where(and(
        eq(sessions.rosterEntryId, data.rosterEntryId),
        isNotNull(sessions.checkOutAt),
      ))
      .orderBy(desc(sessions.checkInAt))
      .all()

    // Map Drizzle camelCase back to snake_case for UI compatibility.
    // checkOutAt is non-null because WHERE filters for check_out_at IS NOT NULL.
    return {
      rows: result.map((r) => ({
        date: r.date,
        shift_start: r.shiftStart,
        shift_end: r.shiftEnd,
        check_in_at: r.checkInAt,
        check_out_at: r.checkOutAt as string,
        hours: r.hours,
      })),
    }
  })

// ═══════════════════════════════════════════════════════════════════
// Admin dashboard — single endpoint (was 4 separate queries)
// ═══════════════════════════════════════════════════════════════════

type SerializableValue = string | number | boolean | null | SerializableValue[] | { [key: string]: SerializableValue }

function safeJsonParse(raw: string | null | undefined): Record<string, SerializableValue> | { raw: SerializableValue } | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, SerializableValue>)
      : { raw: parsed as SerializableValue }
  } catch {
    return { raw }
  }
}

export const adminGetDashboard = createServerFn({ method: 'POST' })
  .validator(validateAdminDate)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    const rota = await getRotaForDate(data.date)

    // Build all responses in parallel — they're independent reads
    const [roster, whoIsIn, sessRows, audit, pendingEnrolments] = await Promise.all([
      getRosterWithStatusImpl(db, rota?.id),
      getWhoIsInImpl(db, rota?.id),
      getSessionHistoryImpl(db, rota?.id),
      getAuditLogImpl(db),
      countPendingEnrolments(db),
    ])

    const isToday = data.date === todayDate()
    const now = new Date()
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const ukNow =
      (timeParts.find((p) => p.type === 'hour')?.value.padStart(2, '0') ?? '00') + ':' +
      (timeParts.find((p) => p.type === 'minute')?.value.padStart(2, '0') ?? '00')

    const missingCheckIn = isToday
      ? roster.filter((e) => !e.checkInAt && (!e.shift_start || e.shift_start.slice(0, 5) <= ukNow))
      : []

    const missingCheckOut = isToday
      ? roster.filter((e) => e.checkInAt && !e.checkOutAt && e.shift_end && e.shift_end.slice(0, 5) <= ukNow)
      : []

    return { entries: roster, present: whoIsIn, sessions: sessRows, audit, missingCheckIn, missingCheckOut, pendingEnrolments }
  })

// ═══════════════════════════════════════════════════════════════════
// Admin mutation endpoints
// ═══════════════════════════════════════════════════════════════════

export const adminUpdateSession = createServerFn({ method: 'POST' })
  .validator(validateAdminUpdateSession)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const { authToken: _authToken, ...change } = data
    const result = await updateAttendanceSession(db, change)
    await logAudit('admin_session_updated', {
      ...result,
      rosterEntryId: data.rosterEntryId,
      checkInAt: data.checkInAt,
      checkOutAt: data.checkOutAt,
    }, 'admin')
    return { ok: true }
  })

export const adminDeleteSession = createServerFn({ method: 'POST' })
  .validator(validateAdminSessionId)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    await db.delete(sessions).where(eq(sessions.id, data.sessionId))
    await logAudit('admin_session_deleted', { sessionId: data.sessionId }, 'admin')
    return { ok: true }
  })

export const adminDeleteRosterEntry = createServerFn({ method: 'POST' })
  .validator(validateAdminEntryId)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const entry = await db
      .select({ name: rosterEntries.name })
      .from(rosterEntries)
      .where(eq(rosterEntries.id, data.entryId))
      .get()

    await deleteAttendanceEntry(db, data.entryId)
    await logAudit('roster_entry_deleted', { entryId: data.entryId, name: entry?.name }, 'admin')
    return { ok: true }
  })

/** Evidence columns shared by the export and the weekly rollup. Raw codes plus derived verification. */
export type SessionEvidenceColumns = {
  identity_in: Identity
  location_in: LocationOutcome
  accuracy_in_m: number | null
  identity_out: Identity | null
  location_out: LocationOutcome | null
  accuracy_out_m: number | null
  verified: boolean
  accepted: boolean
  reasons: FlagReason[]
  review_state: 'accepted' | null
  review_note: string | null
}

const evidenceSelection = {
  identityIn: sessions.identityIn,
  identityOut: sessions.identityOut,
  locationIn: sessions.locationIn,
  locationOut: sessions.locationOut,
  accuracyInM: sessions.accuracyInM,
  accuracyOutM: sessions.accuracyOutM,
  reviewState: sessions.reviewState,
  reviewNote: sessions.reviewNote,
}

function evidenceColumns(r: {
  checkOutAt: string | null
  identityIn: string | null
  identityOut: string | null
  locationIn: string | null
  locationOut: string | null
  accuracyInM: number | null
  accuracyOutM: number | null
  reviewState: string | null
  reviewNote: string | null
}): SessionEvidenceColumns {
  const v = deriveVerification(r)
  const closed = r.checkOutAt !== null
  return {
    identity_in: readIdentity(r.identityIn),
    location_in: readLocation(r.locationIn),
    accuracy_in_m: r.accuracyInM,
    identity_out: closed ? readIdentity(r.identityOut) : null,
    location_out: closed ? readLocation(r.locationOut) : null,
    accuracy_out_m: closed ? r.accuracyOutM : null,
    verified: v.verified,
    accepted: v.accepted,
    reasons: v.reasons,
    review_state: r.reviewState === 'accepted' ? 'accepted' : null,
    review_note: r.reviewNote,
  }
}

export const adminExportSessions = createServerFn({ method: 'POST' })
  .validator(validateExportRange)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const result = await db
      .select({
        name: rosterEntries.name,
        role: rosterEntries.role,
        checkInAt: sessions.checkInAt,
        checkOutAt: sessions.checkOutAt,
        hours: sql<number>`(julianday(${sessions.checkOutAt}) - julianday(${sessions.checkInAt})) * 24`.mapWith(Number),
        ...evidenceSelection,
      })
      .from(sessions)
      .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
      .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
      .where(and(
        gte(rotas.date, data.startDate),
        lte(rotas.date, data.endDate),
      ))
      .orderBy(desc(sessions.checkInAt))
      .all()

    // Map Drizzle camelCase back to snake_case for UI compatibility
    return {
      rows: result.map((r) => ({
        name: r.name,
        role: r.role,
        check_in_at: r.checkInAt,
        check_out_at: r.checkOutAt,
        hours: r.hours,
        ...evidenceColumns(r),
      })),
    }
  })

export const adminWeeklyRollup = createServerFn({ method: 'POST' })
  .validator(validateWeekRange)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const result = await db
      .select({
        name: rosterEntries.name,
        date: rotas.date,
        hours: sql<number>`ROUND((julianday(${sessions.checkOutAt}) - julianday(${sessions.checkInAt})) * 24, 2)`.mapWith(Number),
        checkOutAt: sessions.checkOutAt,
        ...evidenceSelection,
      })
      .from(sessions)
      .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
      .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
      .where(and(
        gte(rotas.date, data.weekStart),
        lte(rotas.date, data.weekEnd),
        isNotNull(sessions.checkOutAt),
      ))
      .orderBy(asc(rosterEntries.name), asc(rotas.date))
      .all()

    return {
      rows: result.map(({ name, date, hours, ...r }) => ({ name, date, hours, ...evidenceColumns(r) })),
    }
  })

/**
 * Auto-checkout: close sessions where shift end + 60 min has passed.
 * Uses per-entry shift_end, not a blanket +1h from check-in.
 */
export const runAutoCheckout = createServerFn({ method: 'POST' })
  .validator(validateAdminAuth)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const date = todayDate()
    const rota = await getRotaForDate(date)
    if (!rota) return { closed: 0 }

    const now = new Date().toISOString()

    // Update sessions whose owning entry's shift ended >60 min ago
    const updated = await db
      .update(sessions)
      .set({ checkOutAt: now, qrTokenOut: 'auto', identityOut: 'admin', locationOut: 'not_requested' })
      .where(and(
        isNull(sessions.checkOutAt),
        inArray(
          sessions.rosterEntryId,
          db.select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(and(
              eq(rosterEntries.rotaId, rota.id),
              isNotNull(rosterEntries.shiftEnd),
              sql`datetime(${date} || ' ' || ${rosterEntries.shiftEnd}, '+60 minutes') < datetime(${now})`
            )),
        ),
      ))
      .returning({ id: sessions.id })

    const closed = updated.length
    await logAudit('auto_checkout_run', { date, closed }, 'system')
    return { closed }
  })

/**
 * Prune audit log entries older than `retentionDays` (default 90).
 * Admin-only. Returns count of deleted rows.
 */
export const adminPruneAuditLog = createServerFn({ method: 'POST' })
  .validator(validatePrune)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const days = data.retentionDays ?? 90
    const deleted = await db
      .delete(auditLog)
      .where(sql`${auditLog.createdAt} < datetime('now', ${`-${days} days`})`)
      .returning({ id: auditLog.id })

    const pruned = deleted.length
    if (pruned > 0) {
      await logAudit('audit_pruned', { retentionDays: days, pruned }, 'system')
    }
    return { pruned }
  })

// ═══════════════════════════════════════════════════════════════════
// Internal query implementations (shared, no auth — callers gate)
// ═══════════════════════════════════════════════════════════════════

/** Evidence fields added to dashboard rows (camelCase, alongside the existing snake_case fields). */
export type DashboardEvidence = {
  identityIn: Identity | null
  identityOut: Identity | null
  locationIn: LocationOutcome | null
  locationOut: LocationOutcome | null
  accuracyInM: number | null
  accuracyOutM: number | null
  reviewState: 'accepted' | null
  reviewNote: string | null
  verified: boolean
  accepted: boolean
  reasons: FlagReason[]
  staffId: number | null
}

const dashboardSessionSelection = {
  sessionId: sessions.id,
  rosterEntryId: sessions.rosterEntryId,
  checkInAt: sessions.checkInAt,
  checkOutAt: sessions.checkOutAt,
  identityIn: sessions.identityIn,
  identityOut: sessions.identityOut,
  locationIn: sessions.locationIn,
  locationOut: sessions.locationOut,
  accuracyInM: sessions.accuracyInM,
  accuracyOutM: sessions.accuracyOutM,
  reviewState: sessions.reviewState,
  reviewNote: sessions.reviewNote,
}

type DashboardSessionFields = {
  checkOutAt: string | null
  identityIn: string | null
  identityOut: string | null
  locationIn: string | null
  locationOut: string | null
  accuracyInM: number | null
  accuracyOutM: number | null
  reviewState: string | null
  reviewNote: string | null
}

function dashboardEvidence(s: DashboardSessionFields | undefined, staffId: number | null): DashboardEvidence {
  if (!s) {
    return {
      identityIn: null, identityOut: null, locationIn: null, locationOut: null, accuracyInM: null, accuracyOutM: null,
      reviewState: null, reviewNote: null, verified: false, accepted: false, reasons: [], staffId,
    }
  }
  const v = deriveVerification(s)
  const closed = s.checkOutAt !== null
  return {
    identityIn: readIdentity(s.identityIn),
    identityOut: closed ? readIdentity(s.identityOut) : null,
    locationIn: readLocation(s.locationIn),
    locationOut: closed ? readLocation(s.locationOut) : null,
    accuracyInM: s.accuracyInM,
    accuracyOutM: closed ? s.accuracyOutM : null,
    reviewState: s.reviewState === 'accepted' ? 'accepted' : null,
    reviewNote: s.reviewNote,
    verified: v.verified,
    accepted: v.accepted,
    reasons: v.reasons,
    staffId,
  }
}

async function getRosterWithStatusImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<
  ({
    id: number
    rota_id: number
    name: string
    role: string | null
    shift_start: string | null
    shift_end: string | null
    source: string
    created_at: string
    checkedIn: boolean
    checkInAt: string | null
    checkOutAt: string | null
    /** Latest session for the entry, if any. Evidence fields below describe that session. */
    sessionId: number | null
  } & DashboardEvidence)[]
> {
  if (!rotaId) return []

  const entries = await db
    .select()
    .from(rosterEntries)
    .where(eq(rosterEntries.rotaId, rotaId))
    .orderBy(asc(rosterEntries.name))
    .all()

  if (entries.length === 0) return []

  // Use subquery instead of IN (?,?,?) to avoid binding limits
  const sessionsResult = await db
    .select(dashboardSessionSelection)
    .from(sessions)
    .where(inArray(
      sessions.rosterEntryId,
      db.select({ id: rosterEntries.id }).from(rosterEntries).where(eq(rosterEntries.rotaId, rotaId)),
    ))
    .orderBy(desc(sessions.id))
    .all()

  const latestSessionByEntry = new Map<number, (typeof sessionsResult)[number]>()
  for (const s of sessionsResult) {
    if (!latestSessionByEntry.has(s.rosterEntryId)) {
      latestSessionByEntry.set(s.rosterEntryId, s)
    }
  }

  // Map Drizzle camelCase back to snake_case for UI compatibility
  return entries.map((e) => {
    const latest = latestSessionByEntry.get(e.id)
    return {
      id: e.id,
      rota_id: e.rotaId,
      name: e.name,
      role: e.role,
      shift_start: e.shiftStart,
      shift_end: e.shiftEnd,
      source: e.source,
      created_at: e.createdAt,
      checkedIn: latest ? latest.checkOutAt === null : false,
      checkInAt: latest?.checkInAt ?? null,
      checkOutAt: latest?.checkOutAt ?? null,
      sessionId: latest?.sessionId ?? null,
      ...dashboardEvidence(latest, e.staffId),
    }
  })
}

async function getWhoIsInImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<({ id: number; name: string; role: string | null; check_in_at: string; sessionId: number } & DashboardEvidence)[]> {
  if (!rotaId) return []

  const result = await db
    .select({
      id: rosterEntries.id,
      name: rosterEntries.name,
      role: rosterEntries.role,
      staffId: rosterEntries.staffId,
      ...dashboardSessionSelection,
    })
    .from(rosterEntries)
    .innerJoin(sessions, eq(sessions.rosterEntryId, rosterEntries.id))
    .where(and(
      eq(rosterEntries.rotaId, rotaId),
      isNull(sessions.checkOutAt),
    ))
    .orderBy(desc(sessions.checkInAt))
    .all()

  return result.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    check_in_at: r.checkInAt,
    sessionId: r.sessionId,
    ...dashboardEvidence(r, r.staffId),
  }))
}

async function getSessionHistoryImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<({ id: number; name: string; role: string | null; check_in_at: string; check_out_at: string | null } & DashboardEvidence)[]> {
  if (!rotaId) return []

  const result = await db
    .select({
      name: rosterEntries.name,
      role: rosterEntries.role,
      staffId: rosterEntries.staffId,
      ...dashboardSessionSelection,
    })
    .from(sessions)
    .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
    .where(eq(rosterEntries.rotaId, rotaId))
    .orderBy(desc(sessions.checkInAt))
    .all()

  return result.map((r) => ({
    id: r.sessionId,
    name: r.name,
    role: r.role,
    check_in_at: r.checkInAt,
    check_out_at: r.checkOutAt,
    ...dashboardEvidence(r, r.staffId),
  }))
}

async function getAuditLogImpl(
  db: Db,
  limit = 50,
): Promise<{ id: number; event: string; details: Record<string, SerializableValue> | { raw: SerializableValue } | null; actor: string | null; created_at: string }[]> {
  const result = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all()

  return result.map((e) => ({
    id: e.id,
    event: e.event,
    details: safeJsonParse(e.details),
    actor: e.actor,
    created_at: e.createdAt,
  }))
}

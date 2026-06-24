import { createServerFn } from '@tanstack/react-start'
import { getDb } from '#/db/client'
import { rotas, rosterEntries, sessions, auditLog } from '#/db/schema'
import { eq, and, isNull, isNotNull, sql, desc, asc, gte, lte, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '#/db/schema'
import { verifyAdminPin, createSessionToken, requireAdmin } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'

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

async function getCurrentSessionForEntry(entryId: number) {
  const db = await getDb()
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.rosterEntryId, entryId), isNull(sessions.checkOutAt)))
    .orderBy(desc(sessions.id))
    .limit(1)
    .get()
}

// ═══════════════════════════════════════════════════════════════════
// Auth endpoint — returns a session token (not the PIN)
// ═══════════════════════════════════════════════════════════════════

export const adminVerifyPin = createServerFn({ method: 'POST' })
  .validator((data: { pin: string }) => data)
  .handler(async ({ data }) => {
    if (!(await verifyAdminPin(data.pin))) throw new Error('Invalid admin PIN')
    const token = await createSessionToken()
    return { ok: true, token }
  })

// ═══════════════════════════════════════════════════════════════════
// Staff-facing functions (QR-token gated — no admin auth needed)
// ═══════════════════════════════════════════════════════════════════

export const checkIn = createServerFn({ method: 'POST' })
  .validator((data: { rosterEntryId: number; token: string }) => data)
  .handler(async ({ data }) => {
    checkRateLimit(`checkin:${data.rosterEntryId}`)
    const db = await getDb()
    const date = todayDate()
    const rota = await getRotaForDate(date)

    if (!rota || rota.token !== data.token) {
      throw new Error('Invalid or expired QR code')
    }

    const entry = await db
      .select()
      .from(rosterEntries)
      .where(eq(rosterEntries.id, data.rosterEntryId))
      .get()

    if (!entry) throw new Error('Staff not found')

    const now = new Date().toISOString()

    // INSERT first — let the partial unique index catch duplicates
    // instead of SELECT-then-INSERT (race condition prone)
    try {
      const [inserted] = await db
        .insert(sessions)
        .values({
          rosterEntryId: entry.id,
          checkInAt: now,
          qrTokenIn: data.token,
        })
        .returning({ id: sessions.id })

      await logAudit(
        'checked_in',
        { entryId: entry.id, name: entry.name, sessionId: inserted.id },
        'staff',
      )

      return { ok: true, at: now, sessionId: inserted.id }
    } catch (e: unknown) {
      // Unique constraint violation → already checked in
      if (e instanceof Error && (e.message.includes('UNIQUE') || e.message.includes('unique'))) {
        throw new Error('Already checked in')
      }
      throw e
    }
  })

export const checkOut = createServerFn({ method: 'POST' })
  .validator((data: { rosterEntryId: number; token: string }) => data)
  .handler(async ({ data }) => {
    checkRateLimit(`checkout:${data.rosterEntryId}`)
    const db = await getDb()
    const date = todayDate()
    const rota = await getRotaForDate(date)

    if (!rota || rota.token !== data.token) {
      throw new Error('Invalid or expired QR code')
    }

    const session = await getCurrentSessionForEntry(data.rosterEntryId)
    if (!session) {
      throw new Error('Not checked in')
    }

    const now = new Date().toISOString()
    await db
      .update(sessions)
      .set({ checkOutAt: now, qrTokenOut: data.token })
      .where(eq(sessions.id, session.id))

    const entry = await db
      .select({ name: rosterEntries.name })
      .from(rosterEntries)
      .where(eq(rosterEntries.id, session.rosterEntryId))
      .get()

    await logAudit(
      'checked_out',
      { entryId: session.rosterEntryId, name: entry?.name, sessionId: session.id },
      'staff',
    )

    return { ok: true, at: now }
  })

export const undoLastAction = createServerFn({ method: 'POST' })
  .validator((data: { rosterEntryId: number; token: string }) => data)
  .handler(async ({ data }) => {
    checkRateLimit(`undo:${data.rosterEntryId}`)
    const db = await getDb()
    const date = todayDate()
    const rota = await getRotaForDate(date)

    // Require a valid QR token for undo — prevents unauthorized undo
    if (!rota || rota.token !== data.token) {
      throw new Error('Invalid or expired QR code')
    }

    const session = await getCurrentSessionForEntry(data.rosterEntryId)

    if (!session) {
      // Undo last checkout: find the most recent closed session
      const lastClosed = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.rosterEntryId, data.rosterEntryId), isNotNull(sessions.checkOutAt)))
        .orderBy(desc(sessions.id))
        .limit(1)
        .get()

      if (!lastClosed) throw new Error('Nothing to undo')

      await db
        .update(sessions)
        .set({ checkOutAt: null, qrTokenOut: null })
        .where(eq(sessions.id, lastClosed.id))

      await logAudit('checkout_undone', { entryId: data.rosterEntryId, sessionId: lastClosed.id }, 'staff')
      return { ok: true, action: 'checkout_undone' }
    }

    // Undo check-in: delete the open session
    await db.delete(sessions).where(eq(sessions.id, session.id))
    await logAudit('checkin_undone', { entryId: data.rosterEntryId, sessionId: session.id }, 'staff')
    return { ok: true, action: 'checkin_undone' }
  })

export const getStatus = createServerFn({ method: 'GET' })
  .validator((data: { rosterEntryId: number }) => data)
  .handler(async ({ data }) => {
    checkRateLimit(`status:${data.rosterEntryId}`)
    const session = await getCurrentSessionForEntry(data.rosterEntryId)
    let hasUndoableAction = !!session
    if (!session) {
      const db = await getDb()
      const lastClosed = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.rosterEntryId, data.rosterEntryId), isNotNull(sessions.checkOutAt)))
        .orderBy(desc(sessions.id))
        .limit(1)
        .get()
      hasUndoableAction = !!lastClosed
    }
    return {
      checkedIn: !!session,
      sessionId: session?.id ?? null,
      checkInAt: session?.checkInAt ?? null,
      hasUndoableAction,
    }
  })

export const manualCheckIn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; role?: string; token: string }) => data)
  .handler(async ({ data }) => {
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

    const [sessInserted] = await db
      .insert(sessions)
      .values({
        rosterEntryId: entryId,
        checkInAt: now,
        qrTokenIn: data.token,
      })
      .returning({ id: sessions.id })

    await logAudit(
      'manual_checkin',
      { entryId, name: data.name, role: data.role, sessionId: sessInserted.id },
      'staff',
    )

    return { ok: true, entryId, sessionId: sessInserted.id }
  })

export const getStaffHistory = createServerFn({ method: 'POST' })
  .validator((data: { rosterEntryId: number; token: string }) => data)
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
  .validator((data: { date: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    const rota = await getRotaForDate(data.date)

    // Build all responses in parallel — they're independent reads
    const [roster, whoIsIn, sessRows, audit] = await Promise.all([
      getRosterWithStatusImpl(db, rota?.id),
      getWhoIsInImpl(db, rota?.id),
      getSessionHistoryImpl(db, rota?.id),
      getAuditLogImpl(db),
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

    return { entries: roster, present: whoIsIn, sessions: sessRows, audit, missingCheckIn, missingCheckOut }
  })

// ═══════════════════════════════════════════════════════════════════
// Admin mutation endpoints
// ═══════════════════════════════════════════════════════════════════

export const adminUpdateSession = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      sessionId?: number
      rosterEntryId?: number
      checkInAt?: string
      checkOutAt?: string
      authToken: string
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    if (data.sessionId && data.checkOutAt !== undefined) {
      await db
        .update(sessions)
        .set({ checkOutAt: data.checkOutAt || null })
        .where(eq(sessions.id, data.sessionId))
      await logAudit('admin_session_updated', { sessionId: data.sessionId, checkOutAt: data.checkOutAt }, 'admin')
      return { ok: true }
    }

    if (data.sessionId && data.checkInAt !== undefined) {
      await db
        .update(sessions)
        .set({ checkInAt: data.checkInAt })
        .where(eq(sessions.id, data.sessionId))
      await logAudit('admin_session_updated', { sessionId: data.sessionId, checkInAt: data.checkInAt }, 'admin')
      return { ok: true }
    }

    if (data.rosterEntryId && data.checkInAt) {
      await db
        .insert(sessions)
        .values({
          rosterEntryId: data.rosterEntryId,
          checkInAt: data.checkInAt,
          qrTokenIn: 'manual',
        })
      await logAudit('admin_manual_checkin', { rosterEntryId: data.rosterEntryId, checkInAt: data.checkInAt }, 'admin')
      return { ok: true }
    }

    throw new Error('Invalid update request')
  })

export const adminDeleteSession = createServerFn({ method: 'POST' })
  .validator((data: { sessionId: number; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    await db.delete(sessions).where(eq(sessions.id, data.sessionId))
    await logAudit('admin_session_deleted', { sessionId: data.sessionId }, 'admin')
    return { ok: true }
  })

export const adminDeleteRosterEntry = createServerFn({ method: 'POST' })
  .validator((data: { entryId: number; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const entry = await db
      .select({ name: rosterEntries.name })
      .from(rosterEntries)
      .where(eq(rosterEntries.id, data.entryId))
      .get()

    await db.delete(rosterEntries).where(eq(rosterEntries.id, data.entryId))
    await logAudit('roster_entry_deleted', { entryId: data.entryId, name: entry?.name }, 'admin')
    return { ok: true }
  })

export const adminExportSessions = createServerFn({ method: 'POST' })
  .validator((data: { startDate: string; endDate: string; authToken: string }) => data)
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
      })),
    }
  })

export const adminWeeklyRollup = createServerFn({ method: 'POST' })
  .validator((data: { weekStart: string; weekEnd: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const result = await db
      .select({
        name: rosterEntries.name,
        date: rotas.date,
        hours: sql<number>`ROUND((julianday(${sessions.checkOutAt}) - julianday(${sessions.checkInAt})) * 24, 2)`.mapWith(Number),
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

    return { rows: result }
  })

/**
 * Auto-checkout: close sessions where shift end + 60 min has passed.
 * Uses per-entry shift_end, not a blanket +1h from check-in.
 */
export const runAutoCheckout = createServerFn({ method: 'POST' })
  .validator((data: { authToken: string }) => data)
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
      .set({ checkOutAt: now, qrTokenOut: 'auto' })
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
  .validator((data: { retentionDays?: number; authToken: string }) => data)
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

async function getRosterWithStatusImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<
  {
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
  }[]
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
    .select({
      rosterEntryId: sessions.rosterEntryId,
      checkInAt: sessions.checkInAt,
      checkOutAt: sessions.checkOutAt,
    })
    .from(sessions)
    .where(inArray(
      sessions.rosterEntryId,
      db.select({ id: rosterEntries.id }).from(rosterEntries).where(eq(rosterEntries.rotaId, rotaId)),
    ))
    .orderBy(desc(sessions.id))
    .all()

  const latestSessionByEntry = new Map<
    number,
    { rosterEntryId: number; checkInAt: string; checkOutAt: string | null }
  >()
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
    }
  })
}

async function getWhoIsInImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<{ id: number; name: string; role: string | null; check_in_at: string }[]> {
  if (!rotaId) return []

  const result = await db
    .select({
      id: rosterEntries.id,
      name: rosterEntries.name,
      role: rosterEntries.role,
      checkInAt: sessions.checkInAt,
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
  }))
}

async function getSessionHistoryImpl(
  db: Db,
  rotaId: number | undefined,
): Promise<{ id: number; name: string; role: string | null; check_in_at: string; check_out_at: string | null }[]> {
  if (!rotaId) return []

  const result = await db
    .select({
      id: sessions.id,
      name: rosterEntries.name,
      role: rosterEntries.role,
      checkInAt: sessions.checkInAt,
      checkOutAt: sessions.checkOutAt,
    })
    .from(sessions)
    .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
    .where(eq(rosterEntries.rotaId, rotaId))
    .orderBy(desc(sessions.checkInAt))
    .all()

  return result.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    check_in_at: r.checkInAt,
    check_out_at: r.checkOutAt,
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

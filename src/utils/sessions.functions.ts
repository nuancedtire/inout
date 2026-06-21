import { createServerFn } from '@tanstack/react-start'
import type { D1Database } from '@cloudflare/workers-types'
import { getDb } from '#/db/client'
import type { RosterEntry, Session } from '#/db/schema'
import { verifyAdminPin, deriveTokenForDate, createSessionToken, requireAdmin } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'

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
    .prepare('SELECT id, token FROM rotas WHERE date = ?')
    .bind(date)
    .first<{ id: number; token: string }>()
}

async function getCurrentSessionForEntry(entryId: number) {
  const db = await getDb()
  return db
    .prepare(
      'SELECT * FROM sessions WHERE roster_entry_id = ? AND check_out_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .bind(entryId)
    .first<Session>()
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
      .prepare('SELECT * FROM roster_entries WHERE id = ?')
      .bind(data.rosterEntryId)
      .first<RosterEntry>()

    if (!entry) throw new Error('Staff not found')

    const now = new Date().toISOString()

    // INSERT first — let the partial unique index catch duplicates
    // instead of SELECT-then-INSERT (race condition prone)
    try {
      const result = await db
        .prepare(
          'INSERT INTO sessions (roster_entry_id, check_in_at, qr_token_in) VALUES (?, ?, ?)',
        )
        .bind(entry.id, now, data.token)
        .run<{ id: number }>()

      await logAudit(
        'checked_in',
        { entryId: entry.id, name: entry.name, sessionId: result.meta?.last_row_id },
        'staff',
      )

      return { ok: true, at: now, sessionId: result.meta?.last_row_id }
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
      .prepare('UPDATE sessions SET check_out_at = ?, qr_token_out = ? WHERE id = ?')
      .bind(now, data.token, session.id)
      .run()

    const entry = await db
      .prepare('SELECT name FROM roster_entries WHERE id = ?')
      .bind(session.roster_entry_id)
      .first<{ name: string }>()

    await logAudit(
      'checked_out',
      { entryId: session.roster_entry_id, name: entry?.name, sessionId: session.id },
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
        .prepare(
          'SELECT * FROM sessions WHERE roster_entry_id = ? AND check_out_at IS NOT NULL ORDER BY id DESC LIMIT 1',
        )
        .bind(data.rosterEntryId)
        .first<Session>()

      if (!lastClosed) throw new Error('Nothing to undo')

      await db
        .prepare('UPDATE sessions SET check_out_at = NULL, qr_token_out = NULL WHERE id = ?')
        .bind(lastClosed.id)
        .run()

      await logAudit('checkout_undone', { entryId: data.rosterEntryId, sessionId: lastClosed.id }, 'staff')
      return { ok: true, action: 'checkout_undone' }
    }

    // Undo check-in: delete the open session
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run()
    await logAudit('checkin_undone', { entryId: data.rosterEntryId, sessionId: session.id }, 'staff')
    return { ok: true, action: 'checkin_undone' }
  })

export const getStatus = createServerFn({ method: 'GET' })
  .validator((data: { rosterEntryId: number }) => data)
  .handler(async ({ data }) => {
    checkRateLimit(`status:${data.rosterEntryId}`)
    const session = await getCurrentSessionForEntry(data.rosterEntryId)
    return {
      checkedIn: !!session,
      sessionId: session?.id ?? null,
      checkInAt: session?.check_in_at ?? null,
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

    const entryResult = await db
      .prepare('INSERT INTO roster_entries (rota_id, name, role, source) VALUES (?, ?, ?, ?)')
      .bind(rota.id, data.name, data.role || null, 'manual')
      .run<{ id: number }>()

    const entryId = entryResult.meta!.last_row_id!
    const now = new Date().toISOString()

    const sessResult = await db
      .prepare('INSERT INTO sessions (roster_entry_id, check_in_at, qr_token_in) VALUES (?, ?, ?)')
      .bind(entryId, now, data.token)
      .run<{ id: number }>()

    await logAudit(
      'manual_checkin',
      { entryId, name: data.name, role: data.role, sessionId: sessResult.meta?.last_row_id },
      'staff',
    )

    return { ok: true, entryId, sessionId: sessResult.meta?.last_row_id }
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
      .prepare(
        `SELECT r.date, e.shift_start, e.shift_end, s.check_in_at, s.check_out_at,
                (julianday(s.check_out_at) - julianday(s.check_in_at)) * 24 AS hours
         FROM sessions s
         JOIN roster_entries e ON e.id = s.roster_entry_id
         JOIN rotas r ON r.id = e.rota_id
         WHERE s.roster_entry_id = ? AND s.check_out_at IS NOT NULL
         ORDER BY s.check_in_at DESC`,
      )
      .bind(data.rosterEntryId)
      .all<{
        date: string
        shift_start: string | null
        shift_end: string | null
        check_in_at: string
        check_out_at: string
        hours: number | null
      }>()

    return { rows: result.results ?? [] }
  })

// ═══════════════════════════════════════════════════════════════════
// Admin dashboard — single endpoint (was 4 separate queries)
// ═══════════════════════════════════════════════════════════════════

function safeJsonParse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : { raw: parsed }
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
    const [roster, whoIsIn, sessions, audit] = await Promise.all([
      getRosterWithStatusImpl(db, rota?.id),
      getWhoIsInImpl(db, rota?.id),
      getSessionHistoryImpl(db, rota?.id),
      getAuditLogImpl(db),
    ])

    return { entries: roster, present: whoIsIn, sessions, audit }
  })

// ── Individual admin endpoints (kept for targeted operations) ────

export const adminGetRosterWithStatus = createServerFn({ method: 'POST' })
  .validator((data: { date: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const rota = await getRotaForDate(data.date)
    return { entries: await getRosterWithStatusImpl(db, rota?.id) }
  })

export const adminGetWhoIsIn = createServerFn({ method: 'POST' })
  .validator((data: { date: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const rota = await getRotaForDate(data.date)
    return { staff: await getWhoIsInImpl(db, rota?.id) }
  })

export const adminGetSessionHistory = createServerFn({ method: 'POST' })
  .validator((data: { date: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const rota = await getRotaForDate(data.date)
    return { sessions: await getSessionHistoryImpl(db, rota?.id) }
  })

export const adminGetAuditLog = createServerFn({ method: 'POST' })
  .validator((data: { limit?: number; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    return { events: await getAuditLogImpl(db, data.limit) }
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
        .prepare('UPDATE sessions SET check_out_at = ? WHERE id = ?')
        .bind(data.checkOutAt || null, data.sessionId)
        .run()
      await logAudit('admin_session_updated', { sessionId: data.sessionId, checkOutAt: data.checkOutAt }, 'admin')
      return { ok: true }
    }

    if (data.sessionId && data.checkInAt !== undefined) {
      await db
        .prepare('UPDATE sessions SET check_in_at = ? WHERE id = ?')
        .bind(data.checkInAt, data.sessionId)
        .run()
      await logAudit('admin_session_updated', { sessionId: data.sessionId, checkInAt: data.checkInAt }, 'admin')
      return { ok: true }
    }

    if (data.rosterEntryId && data.checkInAt) {
      await db
        .prepare('INSERT INTO sessions (roster_entry_id, check_in_at, qr_token_in) VALUES (?, ?, ?)')
        .bind(data.rosterEntryId, data.checkInAt, 'manual')
        .run()
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
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(data.sessionId).run()
    await logAudit('admin_session_deleted', { sessionId: data.sessionId }, 'admin')
    return { ok: true }
  })

export const adminDeleteRosterEntry = createServerFn({ method: 'POST' })
  .validator((data: { entryId: number; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const entry = await db
      .prepare('SELECT name FROM roster_entries WHERE id = ?')
      .bind(data.entryId)
      .first<{ name: string }>()

    await db.prepare('DELETE FROM roster_entries WHERE id = ?').bind(data.entryId).run()
    await logAudit('roster_entry_deleted', { entryId: data.entryId, name: entry?.name }, 'admin')
    return { ok: true }
  })

export const adminExportSessions = createServerFn({ method: 'POST' })
  .validator((data: { startDate: string; endDate: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const result = await db
      .prepare(
        `SELECT e.name, e.role, s.check_in_at, s.check_out_at,
                (julianday(s.check_out_at) - julianday(s.check_in_at)) * 24 AS hours
         FROM sessions s
         JOIN roster_entries e ON e.id = s.roster_entry_id
         JOIN rotas r ON r.id = e.rota_id
         WHERE r.date >= ? AND r.date <= ?
         ORDER BY s.check_in_at DESC`,
      )
      .bind(data.startDate, data.endDate)
      .all<{
        name: string
        role: string | null
        check_in_at: string
        check_out_at: string | null
        hours: number | null
      }>()

    return { rows: result.results ?? [] }
  })

export const adminWeeklyRollup = createServerFn({ method: 'POST' })
  .validator((data: { weekStart: string; weekEnd: string; authToken: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const result = await db
      .prepare(
        `SELECT e.name, r.date,
                ROUND((julianday(s.check_out_at) - julianday(s.check_in_at)) * 24, 2) AS hours
         FROM sessions s
         JOIN roster_entries e ON e.id = s.roster_entry_id
         JOIN rotas r ON r.id = e.rota_id
         WHERE r.date >= ? AND r.date <= ? AND s.check_out_at IS NOT NULL
         ORDER BY e.name, r.date`,
      )
      .bind(data.weekStart, data.weekEnd)
      .all<{ name: string; date: string; hours: number }>()

    return { rows: result.results ?? [] }
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
    const result = await db
      .prepare(
        `UPDATE sessions
         SET check_out_at = ?, qr_token_out = 'auto'
         WHERE check_out_at IS NULL
           AND roster_entry_id IN (
             SELECT e.id FROM roster_entries e
             WHERE e.rota_id = ?
               AND e.shift_end IS NOT NULL
               AND datetime(? || ' ' || e.shift_end, '+60 minutes') < datetime(?)
           )`,
      )
      .bind(now, rota.id, date, now)
      .run()

    const closed = result.meta?.changes ?? 0
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
    const result = await db
      .prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', ?)`)
      .bind(`-${days} days`)
      .run()
    const pruned = result.meta?.changes ?? 0
    if (pruned > 0) {
      await logAudit('audit_pruned', { retentionDays: days, pruned }, 'system')
    }
    return { pruned }
  })

// ═══════════════════════════════════════════════════════════════════
// Internal query implementations (shared, no auth — callers gate)
// ═══════════════════════════════════════════════════════════════════

async function getRosterWithStatusImpl(
  db: D1Database,
  rotaId: number | undefined,
): Promise<(RosterEntry & { checkedIn: boolean; checkInAt: string | null; checkOutAt: string | null })[]> {
  if (!rotaId) return []

  const entriesResult = await db
    .prepare('SELECT * FROM roster_entries WHERE rota_id = ? ORDER BY name')
    .bind(rotaId)
    .all<RosterEntry>()

  const entries = entriesResult.results ?? ([] as RosterEntry[])
  if (entries.length === 0) return []

  // Use subquery instead of IN (?,?,?) to avoid binding limits
  const sessionsResult = await db
    .prepare(
      `SELECT roster_entry_id, check_in_at, check_out_at
       FROM sessions
       WHERE roster_entry_id IN (SELECT id FROM roster_entries WHERE rota_id = ?)
       ORDER BY id DESC`,
    )
    .bind(rotaId)
    .all<Pick<Session, 'roster_entry_id' | 'check_in_at' | 'check_out_at'>>()

  const sessions = sessionsResult.results ?? []
  const latestSessionByEntry = new Map<
    number,
    Pick<Session, 'roster_entry_id' | 'check_in_at' | 'check_out_at'>
  >()
  for (const s of sessions) {
    if (!latestSessionByEntry.has(s.roster_entry_id)) {
      latestSessionByEntry.set(s.roster_entry_id, s)
    }
  }

  return entries.map((e) => {
    const latest = latestSessionByEntry.get(e.id)
    return {
      ...e,
      checkedIn: latest ? latest.check_out_at === null : false,
      checkInAt: latest?.check_in_at ?? null,
      checkOutAt: latest?.check_out_at ?? null,
    }
  })
}

async function getWhoIsInImpl(
  db: D1Database,
  rotaId: number | undefined,
): Promise<{ id: number; name: string; role: string | null; check_in_at: string }[]> {
  if (!rotaId) return []

  const result = await db
    .prepare(
      `SELECT e.id, e.name, e.role, s.check_in_at
       FROM roster_entries e
       JOIN sessions s ON s.roster_entry_id = e.id
       WHERE e.rota_id = ? AND s.check_out_at IS NULL
       ORDER BY s.check_in_at DESC`,
    )
    .bind(rotaId)
    .all<RosterEntry & { check_in_at: string }>()

  return (result.results ?? []) as {
    id: number
    name: string
    role: string | null
    check_in_at: string
  }[]
}

async function getSessionHistoryImpl(
  db: D1Database,
  rotaId: number | undefined,
): Promise<{ id: number; name: string; role: string | null; check_in_at: string; check_out_at: string | null }[]> {
  if (!rotaId) return []

  const result = await db
    .prepare(
      `SELECT s.id, e.name, e.role, s.check_in_at, s.check_out_at
       FROM sessions s
       JOIN roster_entries e ON e.id = s.roster_entry_id
       WHERE e.rota_id = ?
       ORDER BY s.check_in_at DESC`,
    )
    .bind(rotaId)
    .all<{ id: number; name: string; role: string | null; check_in_at: string; check_out_at: string | null }>()

  return result.results ?? []
}

async function getAuditLogImpl(
  db: D1Database,
  limit = 50,
): Promise<{ id: number; event: string; details: Record<string, unknown> | null; actor: string | null; created_at: string }[]> {
  const result = await db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
    .bind(limit)
    .all<{ id: number; event: string; details: string | null; actor: string | null; created_at: string }>()

  return (result.results ?? []).map((e) => ({
    ...e,
    details: safeJsonParse(e.details),
  }))
}

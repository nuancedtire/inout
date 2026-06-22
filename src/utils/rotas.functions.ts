import { createServerFn } from '@tanstack/react-start'
import type { D1Database } from '@cloudflare/workers-types'
import { getDb } from '#/db/client'
import type { Rota, RosterEntry } from '#/db/schema'
import { parseRota } from './rotaParser'
import { requireAdmin, deriveTokenForDate } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'

async function ensureRotaForDate(db: D1Database, date: string): Promise<Rota> {
  const existing = await db
    .prepare('SELECT * FROM rotas WHERE date = ?')
    .bind(date)
    .first<Rota>()

  if (existing) return existing

  const token = await deriveTokenForDate(date)
  const result = await db
    .prepare('INSERT INTO rotas (date, token) VALUES (?, ?)')
    .bind(date, token)
    .run<{ id: number }>()

  const id = result.meta?.last_row_id
  if (!id) throw new Error('Failed to create rota')
  return { id, date, token, created_at: new Date().toISOString() }
}

// ══════════════════════════════════════════════════════════════════
// Public (staff-facing) — only what the check-in page needs
// ══════════════════════════════════════════════════════════════════

export const getTodayRoster = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDb()
  const date = todayDate()

  const rota = await db
    .prepare('SELECT * FROM rotas WHERE date = ?')
    .bind(date)
    .first<Rota>()

  if (!rota) {
    return { rota: null, entries: [] as RosterEntry[] }
  }

  // Return only name/role/shift fields — no status data
  const entries = await db
    .prepare(
      'SELECT id, name, role, shift_start, shift_end, source FROM roster_entries WHERE rota_id = ? ORDER BY name',
    )
    .bind(rota.id)
    .all<Pick<RosterEntry, 'id' | 'name' | 'role' | 'shift_start' | 'shift_end' | 'source'>>()

  return { rota, entries: entries.results ?? [] }
})

export const getQrTokenOrSeed = createServerFn({ method: 'GET' })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const rota = await db
      .prepare('SELECT token FROM rotas WHERE date = ?')
      .bind(data.date)
      .first<{ token: string }>()

    // Only return a token if a rota already exists for this date
    if (!rota) return { token: null }
    return { token: rota.token }
  })

// ══════════════════════════════════════════════════════════════════
// Admin endpoints — session-token gated
// ══════════════════════════════════════════════════════════════════

export const uploadRota = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      date: string
      fileBase64: string
      fileName: string
      authToken: string
      nameHeader?: string
      roleHeader?: string
      shiftHeader?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    let buffer: Uint8Array
    try {
      buffer = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0))
    } catch {
      throw new Error('Invalid file data. The file appears to be corrupt or in an unsupported format.')
    }

    const fileNameLower = data.fileName.toLowerCase()
    const fileType: 'csv' | 'xlsx' | undefined = fileNameLower.endsWith('.csv')
      ? 'csv'
      : fileNameLower.match(/\.(xlsx|xls)$/)
        ? 'xlsx'
        : undefined

    const parsed = parseRota(
      buffer.buffer,
      {
        nameHeader: data.nameHeader,
        roleHeader: data.roleHeader,
        shiftHeader: data.shiftHeader,
      },
      fileType,
    )

    if (parsed.length === 0) {
      throw new Error('No staff found in rota file. Check column headers.')
    }
    // Count entries where a shift was provided but couldn't be parsed
    const unparseableShifts = parsed.filter(e => e.rawShift && !e.shiftStart).length

    // Upsert rota (keeps deterministic token)
    const rota = await ensureRotaForDate(db, data.date)

    // Use D1 batch for atomicity — all or nothing
    const statements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM roster_entries WHERE rota_id = ?').bind(rota.id),
    ]

    for (const entry of parsed) {
      statements.push(
        db
          .prepare(
            'INSERT INTO roster_entries (rota_id, name, role, shift_start, shift_end, source) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind(rota.id, entry.name, entry.role || null, entry.shiftStart, entry.shiftEnd, 'rota'),
      )
    }

    await db.batch(statements)

    await logAudit('rota_uploaded', { date: data.date, staffCount: parsed.length }, 'admin')

    return { ok: true, count: parsed.length, unparseableShifts, token: rota.token, date: data.date }
  })

export const addAdHocStaff = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      name: string
      role?: string
      shiftStart?: string
      shiftEnd?: string
      authToken: string
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    const date = todayDate()

    const rota = await ensureRotaForDate(db, date)

    const result = await db
      .prepare(
        'INSERT INTO roster_entries (rota_id, name, role, shift_start, shift_end, source) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(rota.id, data.name, data.role || null, data.shiftStart || null, data.shiftEnd || null, 'manual')
      .run<{ id: number }>()

    const entryId = result.meta?.last_row_id

    await logAudit(
      'adhoc_staff_added',
      { name: data.name, role: data.role, date, entryId },
      'admin',
    )

    return { ok: true, entryId }
  })

export const adminUpdateRosterEntry = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      entryId: number
      name?: string
      role?: string
      shiftStart?: string
      shiftEnd?: string
      authToken: string
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const sets: string[] = []
    const binds: unknown[] = []

    if (data.name !== undefined) {
      sets.push('name = ?')
      binds.push(data.name)
    }
    if (data.role !== undefined) {
      sets.push('role = ?')
      binds.push(data.role || null)
    }
    if (data.shiftStart !== undefined) {
      sets.push('shift_start = ?')
      binds.push(data.shiftStart || null)
    }
    if (data.shiftEnd !== undefined) {
      sets.push('shift_end = ?')
      binds.push(data.shiftEnd || null)
    }

    if (sets.length === 0) throw new Error('Nothing to update')

    binds.push(data.entryId)
    await db
      .prepare(`UPDATE roster_entries SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run()

    await logAudit(
      'roster_entry_updated',
      {
        entryId: data.entryId,
        changes: { name: data.name, role: data.role, shiftStart: data.shiftStart, shiftEnd: data.shiftEnd },
      },
      'admin',
    )
    return { ok: true }
  })

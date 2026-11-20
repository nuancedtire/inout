import { createServerFn } from '@tanstack/react-start'
import { getDb } from '#/db/client'
import { replaceRotaEntries } from '#/db/attendance'
import type { Rota } from '#/db/schema'
import { rotas, rosterEntries, sessions } from '#/db/schema'
import { eq, asc, desc, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from '#/db/schema'
import { parseRota } from './rotaParser'
import { requireAdmin, deriveTokenForDate } from './auth'
import { logAudit } from './audit'
import { todayDate } from './dateTime'
import { planRotaLinks, summariseRotaLinks } from '#/db/staff'
import { getSiteSettings } from '#/db/passkeys'
import { isSiteConfigured } from './location'
import {
  validateAddAdHocStaff,
  validateQrDate,
  validateUpdateRosterEntry,
  validateUploadRota,
} from './validation'

type Db = DrizzleD1Database<typeof schema>

async function ensureRotaForDate(db: Db, date: string): Promise<Rota> {
  const existing = await db
    .select()
    .from(rotas)
    .where(eq(rotas.date, date))
    .get()

  if (existing) return existing

  const token = await deriveTokenForDate(date)
  const [inserted] = await db
    .insert(rotas)
    .values({ date, token })
    .returning()

  if (!inserted) throw new Error('Failed to create rota')
  return inserted
}

// ══════════════════════════════════════════════════════════════════
// Public (staff-facing) — only what the check-in page needs
// ══════════════════════════════════════════════════════════════════

export const getTodayRoster = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDb()
  const date = todayDate()
  // Public boolean only: whether a department area is set, so the check-in page can skip the
  // location prompt entirely when there is nothing to compare against. Never the coordinates.
  const locationCheck = isSiteConfigured(await getSiteSettings(db))

  // Public endpoint: never return the rota's QR token here.
  const rota = await db
    .select({ id: rotas.id, date: rotas.date })
    .from(rotas)
    .where(eq(rotas.date, date))
    .get()

  if (!rota) {
    return {
      rota: null,
      locationCheck,
      entries: [] as { id: number; name: string; role: string | null; shiftStart: string | null; shiftEnd: string | null; source: string }[],
      statusByEntryId: {} as Record<number, { checkedIn: boolean; sessionId: number | null; checkInAt: string | null; hasUndoableAction: boolean }>,
    }
  }

  const entries = await db
    .select({
      id: rosterEntries.id,
      name: rosterEntries.name,
      role: rosterEntries.role,
      shiftStart: rosterEntries.shiftStart,
      shiftEnd: rosterEntries.shiftEnd,
      source: rosterEntries.source,
    })
    .from(rosterEntries)
    .where(eq(rosterEntries.rotaId, rota.id))
    .orderBy(asc(rosterEntries.name))
    .all()

  const sessionsResult = entries.length > 0
    ? await db
        .select({
          rosterEntryId: sessions.rosterEntryId,
          id: sessions.id,
          checkInAt: sessions.checkInAt,
          checkOutAt: sessions.checkOutAt,
        })
        .from(sessions)
        .where(inArray(
          sessions.rosterEntryId,
          db.select({ id: rosterEntries.id }).from(rosterEntries).where(eq(rosterEntries.rotaId, rota.id)),
        ))
        .orderBy(desc(sessions.id))
        .all()
    : []

  const latestByEntry = new Map<number, { id: number; checkInAt: string; checkOutAt: string | null }>()
  for (const s of sessionsResult) {
    if (!latestByEntry.has(s.rosterEntryId)) {
      latestByEntry.set(s.rosterEntryId, { id: s.id, checkInAt: s.checkInAt, checkOutAt: s.checkOutAt })
    }
  }

  const statusByEntryId: Record<number, { checkedIn: boolean; sessionId: number | null; checkInAt: string | null; hasUndoableAction: boolean }> = {}
  for (const entry of entries) {
    const latest = latestByEntry.get(entry.id)
    statusByEntryId[entry.id] = {
      checkedIn: latest ? latest.checkOutAt === null : false,
      sessionId: latest && latest.checkOutAt === null ? latest.id : null,
      checkInAt: latest && latest.checkOutAt === null ? latest.checkInAt : null,
      hasUndoableAction: latest !== undefined,
    }
  }

  return { rota, locationCheck, entries, statusByEntryId }
})

export const getQrTokenOrSeed = createServerFn({ method: 'GET' })
  .validator(validateQrDate)
  .handler(async ({ data }) => {
    const db = await getDb()
    const rota = await ensureRotaForDate(db, data.date)
    return { token: rota.token }
  })

// ══════════════════════════════════════════════════════════════════
// Admin endpoints — session-token gated
// ══════════════════════════════════════════════════════════════════

export const uploadRota = createServerFn({ method: 'POST' })
  .validator(validateUploadRota)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    const buffer = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0))

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

    // Link to stable staff records only on an exact, unambiguous normalised-name match among
    // active staff. Links are written with the entries in the same atomic batch.
    const { staffIds, reasons } = await planRotaLinks(db, parsed.map((entry) => entry.name))
    const rows = parsed.map((entry, i) => ({
      rotaId: rota.id,
      name: entry.name,
      role: entry.role || null,
      shiftStart: entry.shiftStart,
      shiftEnd: entry.shiftEnd,
      source: 'rota' as const,
      staffId: staffIds[i],
    }))

    await replaceRotaEntries(db, rota.id, rows)
    const links = await summariseRotaLinks(db, rota.id, reasons)

    await logAudit('rota_uploaded', { date: data.date, staffCount: parsed.length, linked: links.linked, unlinked: links.unlinked.length }, 'admin')

    return { ok: true, count: parsed.length, unparseableShifts, token: rota.token, date: data.date, linked: links.linked, unlinked: links.unlinked }
  })

export const addAdHocStaff = createServerFn({ method: 'POST' })
  .validator(validateAddAdHocStaff)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })

    const db = await getDb()
    const date = todayDate()

    const rota = await ensureRotaForDate(db, date)

    const [inserted] = await db
      .insert(rosterEntries)
      .values({
        rotaId: rota.id,
        name: data.name,
        role: data.role || null,
        shiftStart: data.shiftStart || null,
        shiftEnd: data.shiftEnd || null,
        source: 'manual',
      })
      .returning({ id: rosterEntries.id })

    const entryId = inserted.id

    await logAudit(
      'adhoc_staff_added',
      { name: data.name, role: data.role, date, entryId },
      'admin',
    )

    return { ok: true, entryId }
  })

export const adminUpdateRosterEntry = createServerFn({ method: 'POST' })
  .validator(validateUpdateRosterEntry)
  .handler(async ({ data }) => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()

    const updateData: Partial<typeof rosterEntries.$inferInsert> = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.role !== undefined) updateData.role = data.role || null
    if (data.shiftStart !== undefined) updateData.shiftStart = data.shiftStart || null
    if (data.shiftEnd !== undefined) updateData.shiftEnd = data.shiftEnd || null

    if (Object.keys(updateData).length === 0) throw new Error('Nothing to update')

    await db
      .update(rosterEntries)
      .set(updateData)
      .where(eq(rosterEntries.id, data.entryId))

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

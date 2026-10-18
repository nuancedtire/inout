import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '#/db/client'
import { deleteAttendanceEntry, replaceRotaEntries, updateAttendanceSession } from '#/db/attendance'
import { rosterEntries, rotas, sessions } from '#/db/schema'

async function seed() {
  const db = await getDb()
  const [rota] = await db.insert(rotas).values({ date: '2026-10-17', token: 'test-token' }).returning()
  const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Alice Example' }).returning()
  return { db, rota, entry }
}

describe('attendance mutations', () => {
  it('persists both edited timestamps in one session update', async () => {
    const { db, entry } = await seed()
    const [session] = await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: '2026-10-17T09:00:00Z' }).returning()
    await updateAttendanceSession(db, { sessionId: session.id, checkInAt: '2026-10-17T08:00:00Z', checkOutAt: '2026-10-17T16:00:00Z' })
    expect(await db.select().from(sessions)).toMatchObject([{ checkInAt: '2026-10-17T08:00:00Z', checkOutAt: '2026-10-17T16:00:00Z' }])
  })

  it('checks out the open session by roster entry without changing a closed session', async () => {
    const { db, entry } = await seed()
    await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: '2026-10-17T08:00:00Z', checkOutAt: '2026-10-17T09:00:00Z' })
    const [open] = await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: '2026-10-17T10:00:00Z' }).returning()
    await updateAttendanceSession(db, { rosterEntryId: entry.id, checkOutAt: '2026-10-17T16:00:00Z' })
    expect(await db.select().from(sessions).where(eq(sessions.id, open.id))).toMatchObject([{ checkOutAt: '2026-10-17T16:00:00Z' }])
    expect(await db.select().from(sessions)).toMatchObject([{ checkOutAt: '2026-10-17T09:00:00Z' }, { checkOutAt: '2026-10-17T16:00:00Z' }])
  })

  it('deletes linked attendance when an admin deletes a roster entry', async () => {
    const { db, entry, rota } = await seed()
    await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: '2026-10-17T08:00:00Z' })
    await deleteAttendanceEntry(db, entry.id)
    expect(await db.select().from(sessions)).toEqual([])
    expect(await db.select().from(rosterEntries)).toEqual([])
    expect(await db.select().from(rotas)).toHaveLength(1)
    expect(rota.id).toBeTruthy()
  })

  it('replaces a large unused roster without exceeding per-statement parameter limits', async () => {
    const { db, rota } = await seed()
    await replaceRotaEntries(db, rota.id, Array.from({ length: 80 }, (_, i) => ({ rotaId: rota.id, name: `Staff ${i}`, role: 'Nurse', shiftStart: '08:00', shiftEnd: '16:00', source: 'rota' })))
    expect(await db.select().from(rosterEntries)).toHaveLength(80)
  })

  it('preserves the original roster if any replacement insert fails', async () => {
    const { db, rota } = await seed()
    const rows = Array.from({ length: 11 }, (_, i) => ({ rotaId: i === 10 ? -1 : rota.id, name: `Staff ${i}` }))
    await expect(replaceRotaEntries(db, rota.id, rows)).rejects.toThrow()
    expect(await db.select().from(rosterEntries)).toMatchObject([{ name: 'Alice Example' }])
  })

  it('rejects rota replacement once attendance exists and preserves the records', async () => {
    const { db, entry, rota } = await seed()
    await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: '2026-10-17T08:00:00Z' })
    await expect(replaceRotaEntries(db, rota.id, [{ rotaId: rota.id, name: 'Replacement Staff' }])).rejects.toThrow(/attendance records/)
    expect(await db.select().from(rosterEntries)).toMatchObject([{ name: 'Alice Example' }])
    expect(await db.select().from(sessions)).toHaveLength(1)
  })
})

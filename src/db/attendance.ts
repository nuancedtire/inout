import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { getDb } from './client'
import { rosterEntries, sessions } from './schema'

type Db = Awaited<ReturnType<typeof getDb>>
type SessionChange = {
  sessionId?: number
  rosterEntryId?: number
  checkInAt?: string
  checkOutAt?: string
}

export async function updateAttendanceSession(db: Db, change: SessionChange) {
  if (change.sessionId) {
    const patch: Partial<typeof sessions.$inferInsert> = {}
    if (change.checkInAt !== undefined) patch.checkInAt = change.checkInAt
    if (change.checkOutAt !== undefined) patch.checkOutAt = change.checkOutAt || null
    if (Object.keys(patch).length === 0) throw new Error('Nothing to update')
    const updated = await db.update(sessions).set(patch)
      .where(eq(sessions.id, change.sessionId)).returning({ id: sessions.id })
    if (!updated.length) throw new Error('Session not found')
    return { sessionId: updated[0].id }
  }

  if (change.rosterEntryId && change.checkOutAt !== undefined) {
    const session = await db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.rosterEntryId, change.rosterEntryId), isNull(sessions.checkOutAt)))
      .orderBy(desc(sessions.id)).limit(1).get()
    if (!session) throw new Error('Not checked in')
    await db.update(sessions).set({ checkOutAt: change.checkOutAt || null })
      .where(eq(sessions.id, session.id))
    return { sessionId: session.id }
  }

  if (change.rosterEntryId && change.checkInAt) {
    const [session] = await db.insert(sessions).values({
      rosterEntryId: change.rosterEntryId,
      checkInAt: change.checkInAt,
      qrTokenIn: 'manual',
    }).returning({ id: sessions.id })
    return { sessionId: session.id }
  }
  throw new Error('Invalid update request')
}

export async function deleteAttendanceEntry(db: Db, entryId: number) {
  // The session FK deliberately has no cascade: explicitly delete both in one transaction.
  await db.batch([
    db.delete(sessions).where(eq(sessions.rosterEntryId, entryId)),
    db.delete(rosterEntries).where(eq(rosterEntries.id, entryId)),
  ])
}

export async function replaceRotaEntries(db: Db, rotaId: number, rows: (typeof rosterEntries.$inferInsert)[]) {
  const recorded = await db.select({ id: sessions.id }).from(sessions)
    .where(inArray(sessions.rosterEntryId,
      db.select({ id: rosterEntries.id }).from(rosterEntries).where(eq(rosterEntries.rotaId, rotaId))))
    .limit(1).get()
  if (recorded) throw new Error('This rota already has attendance records. Edit staff individually instead of replacing it.')

  const statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.delete(rosterEntries).where(eq(rosterEntries.rotaId, rotaId)),
  ]
  // D1's parameter limit applies per statement, not to the entire batch.
  for (let i = 0; i < rows.length; i += 10) statements.push(db.insert(rosterEntries).values(rows.slice(i, i + 10)))
  await db.batch(statements)
}

import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { getDb } from './client'
import { auditLog, rosterEntries, sessions } from './schema'
import { isUniqueViolation } from './staff'
import type { Identity, LocationOutcome } from '#/utils/verification'
import { readIdentity } from '#/utils/verification'

type Db = Awaited<ReturnType<typeof getDb>>
type SessionChange = {
  sessionId?: number
  rosterEntryId?: number
  checkInAt?: string
  checkOutAt?: string
}

function sameMinute(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.floor(ta / 60_000) === Math.floor(tb / 60_000)
}

export async function updateAttendanceSession(db: Db, change: SessionChange) {
  if (change.sessionId) {
    const current = await db.select({ checkInAt: sessions.checkInAt, checkOutAt: sessions.checkOutAt })
      .from(sessions).where(eq(sessions.id, change.sessionId)).get()
    if (!current) throw new Error('Session not found')
    const patch: Partial<typeof sessions.$inferInsert> = {}
    // A corrected time is an admin statement: mark that end 'admin' (other evidence is kept).
    // The edit form resends both times at minute precision, so an unchanged minute is not a correction.
    if (change.checkInAt !== undefined && !sameMinute(change.checkInAt, current.checkInAt)) {
      patch.checkInAt = change.checkInAt
      patch.identityIn = 'admin'
    }
    if (change.checkOutAt !== undefined && !sameMinute(change.checkOutAt || null, current.checkOutAt)) {
      patch.checkOutAt = change.checkOutAt || null
      Object.assign(patch, change.checkOutAt
        ? { identityOut: 'admin' }
        : { qrTokenOut: null, identityOut: null, credentialIdOut: null, locationOut: null, accuracyOutM: null })
    }
    if (Object.keys(patch).length === 0) return { sessionId: change.sessionId }
    try {
      await db.update(sessions).set(patch).where(eq(sessions.id, change.sessionId))
    } catch (e) {
      if (isUniqueViolation(e, 'sessions')) throw new Error('This person already has an open session')
      throw e
    }
    return { sessionId: change.sessionId }
  }

  if (change.rosterEntryId && change.checkOutAt !== undefined) {
    const session = await db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.rosterEntryId, change.rosterEntryId), isNull(sessions.checkOutAt)))
      .orderBy(desc(sessions.id)).limit(1).get()
    if (!session) throw new Error('Not checked in')
    await db.update(sessions).set(change.checkOutAt
      ? { checkOutAt: change.checkOutAt, qrTokenOut: 'manual', identityOut: 'admin', locationOut: 'not_requested' }
      : { checkOutAt: null })
      .where(eq(sessions.id, session.id))
    return { sessionId: session.id }
  }

  if (change.rosterEntryId && change.checkInAt) {
    const [session] = await db.insert(sessions).values({
      rosterEntryId: change.rosterEntryId,
      checkInAt: change.checkInAt,
      qrTokenIn: 'manual',
      identityIn: 'admin',
      locationIn: 'not_requested',
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

// ═══════════════════════════════════════════════════════════════════
// Staff attendance actions with evidence (self-selected and passkey)
// ═══════════════════════════════════════════════════════════════════

export type AttendanceEvidence = {
  identity: Exclude<Identity, 'admin'>
  credentialId: string | null
  location: LocationOutcome
  accuracyM: number | null
}

export type AttendanceActionKind = 'check_in' | 'check_out' | 'undo'
export type AttendanceOutcome = {
  action: 'check_in' | 'check_out' | 'checkin_undone' | 'checkout_undone'
  at: string
  sessionId: number
}

const PASSKEY_IDENTITIES: readonly Identity[] = ['passkey', 'passkey_pending']

/**
 * "Undo requires the same identity evidence as the action it undoes, or administrator
 * authority": a name-picked undo cannot reverse a passkey action, and no staff undo can
 * reverse an administrator's change.
 */
function assertCanUndo(target: Identity, by: AttendanceEvidence['identity']) {
  if (target === 'admin') throw new Error('An administrator recorded this. Ask the coordinator to change it.')
  if (PASSKEY_IDENTITIES.includes(target) && !PASSKEY_IDENTITIES.includes(by)) {
    throw new Error('This was recorded with a passkey. Use Face ID, fingerprint or your phone passcode to undo it.')
  }
}

/** Audit insert for a batch that only writes when the immediately preceding statement changed a row. */
export function auditIfChanged(db: Db, event: string, details: Record<string, unknown>, actor: string) {
  return auditStatement(db, event, details, actor, 'changes')
}

function auditStatement(db: Db, event: string, details: Record<string, unknown>, actor: string, guard: 'changes' | 'insert') {
  const json = JSON.stringify(details)
  // Runs in the same batch, immediately after the attendance write: for an insert it records
  // the new session ID; for an update/delete it only writes when a row actually changed.
  // INSERT … SELECT lists every audit_log column (id, event, details, actor, created_at).
  return guard === 'insert'
    ? db.insert(auditLog).select(sql`SELECT NULL, ${event}, json_set(${json}, '$.sessionId', last_insert_rowid()), ${actor}, datetime('now')`)
    : db.insert(auditLog).select(sql`SELECT NULL, ${event}, ${json}, ${actor}, datetime('now') WHERE changes() > 0`)
}

/**
 * One D1 batch: the attendance write with its evidence, the audit event, and any `extra`
 * statements (passkey counter/last-used update, credential insert). The partial unique index
 * remains the guard against two open sessions.
 */
export async function performAttendanceAction(db: Db, opts: {
  entry: { id: number; name: string }
  action: AttendanceActionKind
  token: string
  evidence: AttendanceEvidence
  actor?: string
  auditDetails?: Record<string, unknown>
  extra?: BatchItem<'sqlite'>[]
}): Promise<AttendanceOutcome> {
  const { entry, evidence, token } = opts
  const actor = opts.actor ?? 'staff'
  const extra = opts.extra ?? []
  const now = new Date().toISOString()
  const details = {
    entryId: entry.id,
    name: entry.name,
    identity: evidence.identity,
    location: evidence.location,
    ...(evidence.credentialId ? { credentialId: evidence.credentialId } : {}),
    ...opts.auditDetails,
  }

  if (opts.action === 'check_in') {
    try {
      const [inserted] = await db.batch([
        db.insert(sessions).values({
          rosterEntryId: entry.id,
          checkInAt: now,
          qrTokenIn: token,
          identityIn: evidence.identity,
          credentialIdIn: evidence.credentialId,
          locationIn: evidence.location,
          accuracyInM: evidence.accuracyM,
        }).returning({ id: sessions.id }),
        auditStatement(db, 'checked_in', details, actor, 'insert'),
        ...extra,
      ])
      return { action: 'check_in', at: now, sessionId: (inserted as { id: number }[])[0].id }
    } catch (e) {
      if (isUniqueViolation(e, 'sessions')) throw new Error("You're already checked in")
      throw e
    }
  }

  const open = await db.select().from(sessions)
    .where(and(eq(sessions.rosterEntryId, entry.id), isNull(sessions.checkOutAt)))
    .orderBy(desc(sessions.id)).limit(1).get()

  if (opts.action === 'check_out') {
    if (!open) throw new Error("You're not checked in")
    const [updated] = await db.batch([
      db.update(sessions).set({
        checkOutAt: now,
        qrTokenOut: token,
        identityOut: evidence.identity,
        credentialIdOut: evidence.credentialId,
        locationOut: evidence.location,
        accuracyOutM: evidence.accuracyM,
      }).where(and(eq(sessions.id, open.id), isNull(sessions.checkOutAt))).returning({ id: sessions.id }),
      auditStatement(db, 'checked_out', { ...details, sessionId: open.id }, actor, 'changes'),
      ...extra,
    ])
    if (!(updated as unknown[]).length) throw new Error("You're not checked in")
    return { action: 'check_out', at: now, sessionId: open.id }
  }

  // Undo: reverse the latest action for this entry.
  if (open) {
    assertCanUndo(readIdentity(open.identityIn), evidence.identity)
    const [deleted] = await db.batch([
      db.delete(sessions).where(and(eq(sessions.id, open.id), isNull(sessions.checkOutAt))).returning({ id: sessions.id }),
      auditStatement(db, 'checkin_undone', { ...details, sessionId: open.id }, actor, 'changes'),
      ...extra,
    ])
    if (!(deleted as unknown[]).length) throw new Error('Nothing to undo')
    return { action: 'checkin_undone', at: now, sessionId: open.id }
  }

  const lastClosed = await db.select().from(sessions)
    .where(and(eq(sessions.rosterEntryId, entry.id), isNotNull(sessions.checkOutAt)))
    .orderBy(desc(sessions.id)).limit(1).get()
  if (!lastClosed) throw new Error('Nothing to undo')
  assertCanUndo(readIdentity(lastClosed.identityOut), evidence.identity)
  try {
    const [reopened] = await db.batch([
      db.update(sessions).set({
        checkOutAt: null, qrTokenOut: null, identityOut: null, credentialIdOut: null, locationOut: null, accuracyOutM: null,
      }).where(and(eq(sessions.id, lastClosed.id), isNotNull(sessions.checkOutAt))).returning({ id: sessions.id }),
      auditStatement(db, 'checkout_undone', { ...details, sessionId: lastClosed.id }, actor, 'changes'),
      ...extra,
    ])
    if (!(reopened as unknown[]).length) throw new Error('Nothing to undo')
  } catch (e) {
    if (isUniqueViolation(e, 'sessions')) throw new Error("You're already checked in")
    throw e
  }
  return { action: 'checkout_undone', at: now, sessionId: lastClosed.id }
}

export type EntryStatus = {
  checkedIn: boolean
  sessionId: number | null
  checkInAt: string | null
  hasUndoableAction: boolean
}

/** Current attendance state for one roster entry (same rules as the undo logic). */
export async function getEntryStatus(db: Db, entryId: number): Promise<EntryStatus> {
  const open = await db.select({ id: sessions.id, checkInAt: sessions.checkInAt }).from(sessions)
    .where(and(eq(sessions.rosterEntryId, entryId), isNull(sessions.checkOutAt)))
    .orderBy(desc(sessions.id)).limit(1).get()
  const anySession = open ?? await db.select({ id: sessions.id }).from(sessions)
    .where(eq(sessions.rosterEntryId, entryId)).limit(1).get()
  return {
    checkedIn: !!open,
    sessionId: open?.id ?? null,
    checkInAt: open?.checkInAt ?? null,
    hasUndoableAction: !!anySession,
  }
}

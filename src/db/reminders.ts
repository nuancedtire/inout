/**
 * "Still at work?" shift-end reminders, run by the Cron Trigger every five minutes. For each open
 * session whose expected end + 15 minutes has passed (started within 24 hours, no reminder yet,
 * linked to an active staff record with push subscriptions) it sends one Web Push notification
 * per subscription. Best-effort: a session is claimed (reminder_sent_at) before sending, so a
 * reminder is never sent twice and a failed delivery is not retried.
 *
 * Bounded per run: at most MAX_SESSIONS_PER_RUN due sessions and MAX_PUSHES_PER_RUN push
 * requests (Workers Free allows 50 subrequests per invocation, D1 queries included); anything
 * left over is picked up by the next run.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from './schema'
import { auditLog, pushSubscriptions, rosterEntries, rotas, sessions, staff } from './schema'
import { getPushConfig, sendPush, type Fetcher, type PushConfig, type PushOutcome } from '#/utils/push'
import { expectedShiftEnd, isReminderDue, REMINDER_MAX_AGE_MS, ukClock } from '#/utils/shiftEnd'

type Db = DrizzleD1Database<typeof schema>

export const MAX_SESSIONS_PER_RUN = 200
export const MAX_PUSHES_PER_RUN = 40
/** Candidates scanned per run (cheap columns only) before the due filter. */
const MAX_CANDIDATES = 1000
/** Consecutive failed deliveries after which a subscription is dropped. */
export const MAX_PUSH_FAILURES = 10
/** Seconds a push service may hold the reminder for an offline phone. */
export const REMINDER_TTL_S = 3 * 60 * 60
/** D1 allows 100 bound parameters per statement. */
const IN_CHUNK = 90

export type ReminderRunResult = {
  enabled: boolean
  /** Due sessions claimed and notified this run. */
  sessions: number
  sent: number
  removed: number
  failed: number
}

export type ReminderMessage = {
  web_push?: 8030
  notification: {
    title: string
    body: string
    navigate?: string
    tag: string
    lang: 'en-GB'
    dir: 'ltr'
    silent: false
    data: { url: string; sessionId: number }
  }
}

/**
 * Notification payload. With a configured origin it is also a Declarative Web Push message
 * (Safari 18.4+ shows it even if the service worker cannot); the service worker reads the same
 * `notification` object everywhere else.
 */
export function reminderMessage(session: { id: number; checkInAt: string; endsAt: Date; basis: 'shift' | 'default' }, appOrigin: string | null): ReminderMessage {
  const body = session.basis === 'shift'
    ? `Your shift ended at ${ukClock(session.endsAt)}. Tap to check out.`
    : `You checked in at ${ukClock(new Date(session.checkInAt))}. Tap to check out.`
  const notification: ReminderMessage['notification'] = {
    title: 'Still at work?',
    body,
    tag: `checkout-${session.id}`,
    lang: 'en-GB',
    dir: 'ltr',
    silent: false,
    data: { url: '/', sessionId: session.id },
  }
  if (!appOrigin) return { notification }
  return { web_push: 8030, notification: { ...notification, navigate: `${appOrigin}/` } }
}

async function chunkedIn<T>(ids: number[], query: (chunk: number[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...await query(ids.slice(i, i + IN_CHUNK)))
  return out
}

export async function runShiftEndReminders(db: Db, opts: { now?: Date; config?: PushConfig; fetcher?: Fetcher } = {}): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { enabled: false, sessions: 0, sent: 0, removed: 0, failed: 0 }
  const config = opts.config ?? await getPushConfig()
  if (!config.enabled) return result
  result.enabled = true
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()

  const candidates = await db.select({
    id: sessions.id,
    checkInAt: sessions.checkInAt,
    staffId: rosterEntries.staffId,
    rotaDate: rotas.date,
    shiftStart: rosterEntries.shiftStart,
    shiftEnd: rosterEntries.shiftEnd,
  })
    .from(sessions)
    .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
    .innerJoin(rotas, eq(rotas.id, rosterEntries.rotaId))
    .innerJoin(staff, eq(staff.id, rosterEntries.staffId))
    .where(and(
      isNull(sessions.checkOutAt),
      isNull(sessions.reminderSentAt),
      gte(sessions.checkInAt, new Date(now.getTime() - REMINDER_MAX_AGE_MS).toISOString()),
      isNotNull(rosterEntries.staffId),
      eq(staff.active, true),
      sql`EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.staff_id = ${rosterEntries.staffId})`,
    ))
    .orderBy(asc(sessions.checkInAt), asc(sessions.id))
    .limit(MAX_CANDIDATES)
    .all()

  const due = candidates.filter((c) => isReminderDue(c, now)).slice(0, MAX_SESSIONS_PER_RUN)
  if (!due.length) return result

  const staffIds = [...new Set(due.map((d) => d.staffId!))]
  const subs = await chunkedIn(staffIds, (chunk) => db.select().from(pushSubscriptions)
    .where(inArray(pushSubscriptions.staffId, chunk)).orderBy(asc(pushSubscriptions.id)).all())
  const byStaff = new Map<number, typeof subs>()
  for (const s of subs) byStaff.set(s.staffId, [...(byStaff.get(s.staffId) ?? []), s])

  // Stay within the per-run push budget; the rest waits for the next run.
  const chosen: typeof due = []
  let budget = MAX_PUSHES_PER_RUN
  for (const d of due) {
    const n = byStaff.get(d.staffId!)?.length ?? 0
    if (n === 0) continue
    if (n > budget) break
    chosen.push(d)
    budget -= n
  }
  if (!chosen.length) return result

  // Claim first: a concurrent or repeated run cannot send the same reminder again.
  const claimed = new Set((await db.update(sessions).set({ reminderSentAt: nowIso })
    .where(and(
      inArray(sessions.id, chosen.map((c) => c.id)),
      isNull(sessions.reminderSentAt),
      isNull(sessions.checkOutAt),
    ))
    .returning({ id: sessions.id })).map((r) => r.id))
  const toSend = chosen.filter((c) => claimed.has(c.id))
  result.sessions = toSend.length
  if (!toSend.length) return result

  const deliveries = await Promise.all(toSend.flatMap((session) => {
    const { expectedEndAt, basis } = expectedShiftEnd(session)
    const message = reminderMessage({ id: session.id, checkInAt: session.checkInAt, endsAt: expectedEndAt, basis }, config.appOrigin)
    return (byStaff.get(session.staffId!) ?? []).map(async (sub): Promise<{ subId: number } & PushOutcome> => ({
      subId: sub.id,
      ...await sendPush(sub, message, { ttl: REMINDER_TTL_S, urgency: 'high', topic: `checkout-${session.id}` }, config, opts.fetcher),
    }))
  }))

  const ids = (outcome: PushOutcome['outcome']) => [...new Set(deliveries.filter((d) => d.outcome === outcome).map((d) => d.subId))]
  const sent = ids('sent')
  const gone = ids('gone').filter((id) => !sent.includes(id))
  const failed = ids('failed').filter((id) => !sent.includes(id) && !gone.includes(id))
  result.sent = deliveries.filter((d) => d.outcome === 'sent').length
  result.failed = deliveries.filter((d) => d.outcome === 'failed').length

  // A subscription that keeps failing (expired keys, VAPID mismatch) is dropped after MAX_PUSH_FAILURES.
  const failureCount = new Map(subs.map((s) => [s.id, s.failureCount]))
  const exhausted = failed.filter((id) => (failureCount.get(id) ?? 0) + 1 >= MAX_PUSH_FAILURES)
  const retry = failed.filter((id) => !exhausted.includes(id))
  const remove = [...gone, ...exhausted]
  result.removed = remove.length

  const statements: BatchItem<'sqlite'>[] = []
  if (sent.length) {
    statements.push(db.update(pushSubscriptions).set({ lastSuccessAt: nowIso, failureCount: 0 })
      .where(inArray(pushSubscriptions.id, sent)))
  }
  if (retry.length) {
    statements.push(db.update(pushSubscriptions).set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(inArray(pushSubscriptions.id, retry)))
  }
  if (remove.length) statements.push(db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, remove)))
  if (result.sent > 0) {
    // Counts only: endpoints are capability URLs and never leave the subscriptions table.
    statements.push(db.insert(auditLog).values({
      event: 'checkout_reminders_sent',
      details: JSON.stringify({ sessions: result.sessions, sent: result.sent, failed: result.failed, removed: result.removed }),
      actor: 'system',
    }))
  }
  if (statements.length) await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return result
}

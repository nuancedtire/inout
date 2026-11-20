import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { getDb } from './client'
import { rosterEntries, rotas, staff, type RosterEntry, type Staff } from './schema'
import { normalizeName } from '#/utils/staffNames'

type Db = Awaited<ReturnType<typeof getDb>>

export type StaffSummary = { id: number; name: string; role: string | null }

export function toStaffSummary(s: Pick<Staff, 'id' | 'name' | 'role'>): StaffSummary {
  return { id: s.id, name: s.name, role: s.role }
}

export function isUniqueViolation(error: unknown, needle?: string): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const message = e instanceof Error ? e.message : String(e)
    if (/UNIQUE constraint failed/i.test(message) && (!needle || message.includes(needle))) return true
  }
  return false
}

/** Active staff whose normalised name equals `name`'s. */
export async function findActiveStaffByName(db: Db, name: string): Promise<Staff[]> {
  return db.select().from(staff)
    .where(and(eq(staff.normalizedName, normalizeName(name)), eq(staff.active, true)))
    .orderBy(asc(staff.id)).all()
}

export async function createStaff(db: Db, name: string, role: string | null): Promise<Staff> {
  const [created] = await db.insert(staff)
    .values({ name, normalizedName: normalizeName(name), role })
    .returning()
  return created
}

async function staffOnRota(db: Db, rotaId: number, staffId: number) {
  return db.select({ id: rosterEntries.id }).from(rosterEntries)
    .where(and(eq(rosterEntries.rotaId, rotaId), eq(rosterEntries.staffId, staffId))).get()
}

/**
 * Stable staff record for a daily roster entry. Uses the existing link; otherwise links the
 * single active staff record with the same normalised name (if it is not already on that rota);
 * otherwise creates a staff record. Never merges on an ambiguous name.
 */
export async function resolveStaffForEntry(db: Db, entry: RosterEntry): Promise<Staff> {
  if (entry.staffId) {
    const linked = await db.select().from(staff).where(eq(staff.id, entry.staffId)).get()
    if (linked) return linked
  }
  const matches = await findActiveStaffByName(db, entry.name)
  let candidate: Staff | undefined
  let created = false
  if (matches.length === 1 && !(await staffOnRota(db, entry.rotaId, matches[0].id))) candidate = matches[0]
  if (!candidate) {
    candidate = await createStaff(db, entry.name, entry.role)
    created = true
  }
  try {
    const linked = await db.update(rosterEntries).set({ staffId: candidate.id })
      .where(and(eq(rosterEntries.id, entry.id), isNull(rosterEntries.staffId)))
      .returning({ id: rosterEntries.id })
    if (linked.length) return candidate
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
  }
  // Lost a race: another request linked this entry first. Use its link and drop our new record.
  if (created) await db.delete(staff).where(eq(staff.id, candidate.id))
  const current = await db.select({ staffId: rosterEntries.staffId }).from(rosterEntries)
    .where(eq(rosterEntries.id, entry.id)).get()
  const linked = current?.staffId
    ? await db.select().from(staff).where(eq(staff.id, current.staffId)).get()
    : undefined
  if (!linked) throw new Error('Could not link this rota entry. Please try again.')
  return linked
}

/**
 * Staff record for a locum or not-on-rota enrolment: the single active exact normalised-name
 * match, else a new record.
 */
export async function resolveStaffForName(db: Db, name: string, role: string | null): Promise<Staff> {
  const matches = await findActiveStaffByName(db, name)
  return matches.length === 1 ? matches[0] : createStaff(db, name, role)
}

/** Today's roster entry for a staff record, creating a linked `manual` entry if none exists. */
export async function findOrCreateEntryForStaff(db: Db, rotaId: number, person: Staff): Promise<RosterEntry> {
  const find = () => db.select().from(rosterEntries)
    .where(and(eq(rosterEntries.rotaId, rotaId), eq(rosterEntries.staffId, person.id))).get()
  const existing = await find()
  if (existing) return existing
  // The partial unique index (rota_id, staff_id) makes concurrent creation safe.
  await db.insert(rosterEntries)
    .values({ rotaId, name: person.name, role: person.role, source: 'manual', staffId: person.id })
    .onConflictDoNothing()
  const entry = await find()
  if (!entry) throw new Error('Could not add you to today\'s rota. Please try again.')
  return entry
}

export type RotaLinkResult = {
  linked: number
  unlinked: { entryId: number; name: string; reason: 'no_match' | 'ambiguous' }[]
}

/**
 * Staff links for rota rows about to be imported: an exact normalised-name match against exactly
 * one active staff record, and only when the name appears once in the file.
 */
export async function planRotaLinks(db: Db, names: string[]): Promise<{
  staffIds: (number | null)[]
  reasons: Map<string, 'no_match' | 'ambiguous'>
}> {
  const active = await db.select({ id: staff.id, normalizedName: staff.normalizedName }).from(staff)
    .where(eq(staff.active, true)).all()
  const byName = new Map<string, number[]>()
  for (const s of active) byName.set(s.normalizedName, [...(byName.get(s.normalizedName) ?? []), s.id])
  const inFile = new Map<string, number>()
  for (const name of names) inFile.set(normalizeName(name), (inFile.get(normalizeName(name)) ?? 0) + 1)
  const reasons = new Map<string, 'no_match' | 'ambiguous'>()
  const staffIds = names.map((name) => {
    const key = normalizeName(name)
    const ids = byName.get(key) ?? []
    if (ids.length === 1 && inFile.get(key) === 1) return ids[0]
    reasons.set(key, ids.length === 0 ? 'no_match' : 'ambiguous')
    return null
  })
  return { staffIds, reasons }
}

export async function summariseRotaLinks(db: Db, rotaId: number, reasons: Map<string, 'no_match' | 'ambiguous'>): Promise<RotaLinkResult> {
  const entries = await db.select({ id: rosterEntries.id, name: rosterEntries.name, staffId: rosterEntries.staffId })
    .from(rosterEntries).where(eq(rosterEntries.rotaId, rotaId)).orderBy(asc(rosterEntries.name)).all()
  return {
    linked: entries.filter((e) => e.staffId !== null).length,
    unlinked: entries.filter((e) => e.staffId === null).map((e) => ({
      entryId: e.id,
      name: e.name,
      reason: reasons.get(normalizeName(e.name)) ?? 'no_match',
    })),
  }
}

/** Roster entries on a date without a staff link, with the reason a name match is not possible. */
export async function listUnlinkedEntries(db: Db, date: string): Promise<RotaLinkResult['unlinked']> {
  const rota = await db.select({ id: rotas.id }).from(rotas).where(eq(rotas.date, date)).get()
  if (!rota) return []
  const entries = await db.select({ id: rosterEntries.id, name: rosterEntries.name }).from(rosterEntries)
    .where(and(eq(rosterEntries.rotaId, rota.id), isNull(rosterEntries.staffId)))
    .orderBy(asc(rosterEntries.name)).all()
  const { reasons } = await planRotaLinks(db, entries.map((e) => e.name))
  return entries.map((e) => ({ entryId: e.id, name: e.name, reason: reasons.get(normalizeName(e.name)) ?? 'no_match' }))
}

export async function linkRosterEntry(db: Db, entryId: number, staffId: number | null) {
  if (staffId !== null) {
    const person = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).get()
    if (!person) throw new Error('Staff member not found')
  }
  try {
    const updated = await db.update(rosterEntries).set({ staffId })
      .where(eq(rosterEntries.id, entryId)).returning({ id: rosterEntries.id })
    if (!updated.length) throw new Error('Roster entry not found')
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('That staff member is already linked to another entry on this rota')
    throw e
  }
}

export async function setStaffActive(db: Db, staffId: number, active: boolean) {
  const updated = await db.update(staff).set({ active }).where(eq(staff.id, staffId)).returning({ id: staff.id, name: staff.name })
  if (!updated.length) throw new Error('Staff member not found')
  return updated[0]
}

export type StaffListRow = {
  id: number
  name: string
  role: string | null
  active: boolean
  createdAt: string
  credentials: { pending: number; approved: number; rejected: number; revoked: number }
  lastSeenAt: string | null
}

export async function listStaff(db: Db): Promise<StaffListRow[]> {
  const rows = await db.select({
    id: staff.id,
    name: staff.name,
    role: staff.role,
    active: staff.active,
    createdAt: staff.createdAt,
    // Correlated subqueries use explicit aliases: Drizzle leaves single-table columns unqualified.
    pending: sql<number>`(SELECT count(*) FROM staff_credentials c WHERE c.staff_id = staff.id AND c.status = 'pending')`.mapWith(Number),
    approved: sql<number>`(SELECT count(*) FROM staff_credentials c WHERE c.staff_id = staff.id AND c.status = 'approved')`.mapWith(Number),
    rejected: sql<number>`(SELECT count(*) FROM staff_credentials c WHERE c.staff_id = staff.id AND c.status = 'rejected')`.mapWith(Number),
    revoked: sql<number>`(SELECT count(*) FROM staff_credentials c WHERE c.staff_id = staff.id AND c.status = 'revoked')`.mapWith(Number),
    lastSessionAt: sql<string | null>`(SELECT max(coalesce(s.check_out_at, s.check_in_at)) FROM sessions s JOIN roster_entries r ON r.id = s.roster_entry_id WHERE r.staff_id = staff.id)`,
    lastPasskeyAt: sql<string | null>`(SELECT max(c.last_used_at) FROM staff_credentials c WHERE c.staff_id = staff.id)`,
  }).from(staff).orderBy(asc(staff.name), asc(staff.id)).all()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.createdAt,
    credentials: { pending: r.pending, approved: r.approved, rejected: r.rejected, revoked: r.revoked },
    lastSeenAt: [r.lastSessionAt, r.lastPasskeyAt].filter((v): v is string => !!v).sort().at(-1) ?? null,
  }))
}

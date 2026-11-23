import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { getDb } from './client'
import { rosterEntries, rotas, sessions, staff, staffAliases, type RosterEntry, type Staff } from './schema'
import { nameKey, namesLookAlike, normalizeName } from '#/utils/staffNames'
import { todayDate } from '#/utils/dateTime'

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

/**
 * Every way a rota name can resolve to an active staff record: the `nameKey` of each profile's
 * name plus each remembered alias. A key mapping to more than one record is ambiguous.
 */
export type StaffMatchIndex = {
  byKey: Map<string, number[]>
  active: { id: number; key: string }[]
}

export async function loadMatchIndex(db: Db): Promise<StaffMatchIndex> {
  const active = await db.select({ id: staff.id, name: staff.name }).from(staff)
    .where(eq(staff.active, true)).orderBy(asc(staff.id)).all()
  const aliases = await db.select({ staffId: staffAliases.staffId, nameKey: staffAliases.nameKey }).from(staffAliases)
    .innerJoin(staff, eq(staff.id, staffAliases.staffId))
    .where(eq(staff.active, true)).orderBy(asc(staffAliases.id)).all()
  const byKey = new Map<string, number[]>()
  const add = (key: string, id: number) => {
    const ids = byKey.get(key) ?? []
    if (!ids.includes(id)) byKey.set(key, [...ids, id])
  }
  const list = active.map((s) => ({ id: s.id, key: nameKey(s.name) }))
  for (const s of list) add(s.key, s.id)
  for (const a of aliases) add(a.nameKey, a.staffId)
  return { byKey, active: list }
}

/** Active staff whose name or a remembered alias has the same `nameKey` as `name`. */
export async function findActiveStaffByName(db: Db, name: string): Promise<Staff[]> {
  const ids = (await loadMatchIndex(db)).byKey.get(nameKey(name)) ?? []
  if (!ids.length) return []
  return db.select().from(staff).where(inArray(staff.id, ids)).orderBy(asc(staff.id)).all()
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
 * single active staff record with the same name key or alias (if it is not already on that rota);
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
    if (linked.length) {
      if (created) await linkPendingEntriesSafely(db)
      return candidate
    }
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
 * Staff record for a locum or not-on-rota enrolment: the single active name-key or alias match,
 * else a new record (which then links that person's unlinked rows on upcoming rotas).
 */
export async function resolveStaffForName(db: Db, name: string, role: string | null): Promise<Staff> {
  const matches = await findActiveStaffByName(db, name)
  if (matches.length === 1) return matches[0]
  const created = await createStaff(db, name, role)
  await linkPendingEntriesSafely(db)
  return created
}

/** Today's roster entry for a staff record, creating a linked `manual` entry if none exists. */
export async function findOrCreateEntryForStaff(db: Db, rotaId: number, person: Staff): Promise<RosterEntry> {
  const find = () => db.select().from(rosterEntries)
    .where(and(eq(rosterEntries.rotaId, rotaId), eq(rosterEntries.staffId, person.id))).get()
  const existing = await find()
  if (existing) return existing
  // Prefer this person's own rota row (e.g. "Dr J Smith" remembered as an alias) over a new one.
  await linkPendingEntriesOnRota(db, rotaId)
  const adopted = await find()
  if (adopted) return adopted
  // The partial unique index (rota_id, staff_id) makes concurrent creation safe.
  await db.insert(rosterEntries)
    .values({ rotaId, name: person.name, role: person.role, source: 'manual', staffId: person.id })
    .onConflictDoNothing()
  const entry = await find()
  if (!entry) throw new Error('Could not add you to today\'s rota. Please try again.')
  return entry
}

/**
 * How long an open session still counts as "you're in". Covers a night shift that started on
 * yesterday's rota plus a late checkout; anything older is treated as a forgotten checkout
 * (left for the coordinator) so it can never lock someone out of checking in.
 */
export const CARRY_OVER_MS = 20 * 60 * 60 * 1000

/**
 * The roster entry a staff member's next checkout or undo applies to: their most recent session
 * that started within the carry-over window, on any rota (an open one first). Null if none.
 */
export async function findRecentEntryForStaff(db: Db, staffId: number, opts: { openOnly?: boolean; now?: Date } = {}): Promise<RosterEntry | null> {
  const since = new Date((opts.now ?? new Date()).getTime() - CARRY_OVER_MS).toISOString()
  const base = [eq(rosterEntries.staffId, staffId), gte(sessions.checkInAt, since)]
  const pick = (where: SQL | undefined) => db.select({ entry: rosterEntries }).from(sessions)
    .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
    .where(where).orderBy(desc(sessions.checkInAt), desc(sessions.id)).limit(1).get()
  const open = await pick(and(...base, isNull(sessions.checkOutAt)))
  if (open || opts.openOnly) return open?.entry ?? null
  return (await pick(and(...base)))?.entry ?? null
}

export type UnlinkedReason = 'ambiguous' | 'suggested' | 'no_match'

export type UnlinkedEntry = {
  entryId: number
  name: string
  /**
   * `ambiguous`: the name matches several profiles, or the same profile more than once on this
   * rota. `suggested`: no match, but profiles with a similar name exist. `no_match`: neither.
   */
  reason: UnlinkedReason
  /** Profiles to offer: the matches for `ambiguous`, the look-alikes for `suggested`. */
  candidates: StaffSummary[]
}

export type RotaLinkResult = { linked: number; unlinked: UnlinkedEntry[] }

export type LinkPlan = {
  staffIds: (number | null)[]
  /** Per `nameKey` of each name left unlinked. */
  notes: Map<string, { reason: UnlinkedReason; candidateIds: number[] }>
}

const MAX_SUGGESTIONS = 4

/**
 * Staff links for rota names: a name links when its `nameKey` (or a remembered alias) matches
 * exactly one active profile, the name appears once among `names`, and no other name resolves to
 * the same profile. Profiles in `exclude` (already on the rota) are never used. Similar-looking
 * names are only suggested, never linked.
 */
export function planLinks(index: StaffMatchIndex, names: string[], exclude: ReadonlySet<number> = new Set()): LinkPlan {
  const keys = names.map(nameKey)
  const inFile = new Map<string, number>()
  for (const key of keys) inFile.set(key, (inFile.get(key) ?? 0) + 1)
  const matches = keys.map((key) => (index.byKey.get(key) ?? []).filter((id) => !exclude.has(id)))
  const tentative = keys.map((key, i) => (matches[i].length === 1 && inFile.get(key) === 1 ? matches[i][0] : null))
  // A person is on a rota at most once, so two spellings resolving to one profile are ambiguous.
  const perStaff = new Map<number, number>()
  for (const id of tentative) if (id !== null) perStaff.set(id, (perStaff.get(id) ?? 0) + 1)
  const staffIds = tentative.map((id) => (id !== null && perStaff.get(id) === 1 ? id : null))

  const taken = new Set<number>(exclude)
  for (const id of staffIds) if (id !== null) taken.add(id)
  const notes: LinkPlan['notes'] = new Map()
  keys.forEach((key, i) => {
    if (staffIds[i] !== null || notes.has(key)) return
    if (matches[i].length > 0) {
      notes.set(key, { reason: 'ambiguous', candidateIds: matches[i] })
      return
    }
    const candidateIds = index.active
      .filter((s) => !taken.has(s.id) && namesLookAlike(key, s.key))
      .map((s) => s.id)
      .slice(0, MAX_SUGGESTIONS)
    notes.set(key, { reason: candidateIds.length ? 'suggested' : 'no_match', candidateIds })
  })
  return { staffIds, notes }
}

export async function planRotaLinks(db: Db, names: string[], exclude?: ReadonlySet<number>): Promise<LinkPlan> {
  return planLinks(await loadMatchIndex(db), names, exclude)
}

async function describeUnlinked(db: Db, entries: { id: number; name: string }[], plan: LinkPlan): Promise<UnlinkedEntry[]> {
  const ids = [...new Set([...plan.notes.values()].flatMap((n) => n.candidateIds))]
  const people = ids.length
    ? await db.select({ id: staff.id, name: staff.name, role: staff.role }).from(staff).where(inArray(staff.id, ids)).all()
    : []
  const byId = new Map(people.map((p) => [p.id, toStaffSummary(p)]))
  return entries.map((e) => {
    const note = plan.notes.get(nameKey(e.name)) ?? { reason: 'no_match' as const, candidateIds: [] }
    return {
      entryId: e.id,
      name: e.name,
      reason: note.reason,
      candidates: note.candidateIds.map((id) => byId.get(id)).filter((p): p is StaffSummary => !!p),
    }
  })
}

async function rotaEntriesForLinking(db: Db, rotaId: number) {
  const entries = await db.select({ id: rosterEntries.id, name: rosterEntries.name, staffId: rosterEntries.staffId })
    .from(rosterEntries).where(eq(rosterEntries.rotaId, rotaId)).orderBy(asc(rosterEntries.name), asc(rosterEntries.id)).all()
  const exclude = new Set(entries.flatMap((e) => (e.staffId === null ? [] : [e.staffId])))
  return { pending: entries.filter((e) => e.staffId === null), exclude, linked: exclude.size }
}

/** Link summary for a rota just imported with `plan` (names in file order). */
export async function summariseRotaLinks(db: Db, rotaId: number, plan: LinkPlan): Promise<RotaLinkResult> {
  const { pending, linked } = await rotaEntriesForLinking(db, rotaId)
  return { linked, unlinked: await describeUnlinked(db, pending, plan) }
}

/**
 * Links a rota's unlinked entries that now resolve to exactly one profile — after someone sets
 * up their phone (a new profile) or an admin teaches InOut a spelling. Same rule as rota import.
 */
export async function linkPendingEntriesOnRota(db: Db, rotaId: number, index?: StaffMatchIndex): Promise<number> {
  const { pending, exclude } = await rotaEntriesForLinking(db, rotaId)
  if (!pending.length) return 0
  const { staffIds } = planLinks(index ?? (await loadMatchIndex(db)), pending.map((e) => e.name), exclude)
  let count = 0
  for (const [i, staffId] of staffIds.entries()) {
    if (staffId === null) continue
    try {
      const updated = await db.update(rosterEntries).set({ staffId })
        .where(and(eq(rosterEntries.id, pending[i].id), isNull(rosterEntries.staffId)))
        .returning({ id: rosterEntries.id })
      count += updated.length
    } catch (e) {
      // A concurrent check-in linked this person to another row on the rota first.
      if (!isUniqueViolation(e)) throw e
    }
  }
  return count
}

/** `linkPendingEntriesOnRota` for today's rota and every rota uploaded for a later date. */
export async function linkPendingEntries(db: Db, fromDate = todayDate()): Promise<number> {
  const upcoming = await db.select({ id: rotas.id }).from(rotas).where(gte(rotas.date, fromDate)).orderBy(asc(rotas.date)).all()
  if (!upcoming.length) return 0
  const index = await loadMatchIndex(db)
  let count = 0
  for (const rota of upcoming) count += await linkPendingEntriesOnRota(db, rota.id, index)
  return count
}

/** Best effort: a failure here must never block enrolment or an admin action. */
async function linkPendingEntriesSafely(db: Db) {
  try {
    await linkPendingEntries(db)
  } catch (e) {
    console.warn('Could not link pending rota entries', e instanceof Error ? e.message : e)
  }
}

/** Unlinked roster entries on a date, after linking any that now match exactly (today onwards only). */
export async function listUnlinkedEntries(db: Db, date: string): Promise<UnlinkedEntry[]> {
  const rota = await db.select({ id: rotas.id }).from(rotas).where(eq(rotas.date, date)).get()
  if (!rota) return []
  const index = await loadMatchIndex(db)
  if (date >= todayDate()) await linkPendingEntriesOnRota(db, rota.id, index)
  const { pending, exclude } = await rotaEntriesForLinking(db, rota.id)
  return describeUnlinked(db, pending, planLinks(index, pending.map((e) => e.name), exclude))
}

/**
 * Links (or unlinks, with `staffId` null) a roster entry by hand. A link whose spelling differs
 * from the profile's name is remembered as an alias, so the same spelling links automatically on
 * later rotas; undoing or changing a link forgets the alias it relied on.
 */
export async function linkRosterEntry(db: Db, entryId: number, staffId: number | null): Promise<{ aliasSaved: boolean; alsoLinked: number }> {
  const entry = await db.select({ id: rosterEntries.id, name: rosterEntries.name, staffId: rosterEntries.staffId })
    .from(rosterEntries).where(eq(rosterEntries.id, entryId)).get()
  if (!entry) throw new Error('Roster entry not found')
  const person = staffId === null
    ? null
    : await db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.id, staffId)).get()
  if (staffId !== null && !person) throw new Error('Staff member not found')

  const key = nameKey(entry.name)
  const saveAlias = !!person && nameKey(person.name) !== key
  const statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.update(rosterEntries).set({ staffId }).where(eq(rosterEntries.id, entryId)),
  ]
  if (entry.staffId !== null && entry.staffId !== staffId) {
    statements.push(db.delete(staffAliases).where(and(eq(staffAliases.nameKey, key), eq(staffAliases.staffId, entry.staffId))))
  }
  if (saveAlias && person) {
    statements.push(db.insert(staffAliases).values({ staffId: person.id, nameKey: key }).onConflictDoNothing())
  }
  try {
    await db.batch(statements)
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('That staff member is already linked to another entry on this rota')
    throw e
  }
  const alsoLinked = saveAlias ? await linkPendingEntries(db).catch(() => 0) : 0
  return { aliasSaved: saveAlias, alsoLinked }
}

export async function setStaffActive(db: Db, staffId: number, active: boolean) {
  const updated = await db.update(staff).set({ active }).where(eq(staff.id, staffId)).returning({ id: staff.id, name: staff.name })
  if (!updated.length) throw new Error('Staff member not found')
  if (active) await linkPendingEntriesSafely(db)
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

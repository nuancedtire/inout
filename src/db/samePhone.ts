/**
 * Same-phone queries over the hashed phone markers (src/utils/deviceMarker.ts). A signal for the
 * coordinator that one phone was used for more than one person, never proof on its own.
 */
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from './schema'
import { rosterEntries, sessions, staff, staffCredentials } from './schema'

type Db = DrizzleD1Database<typeof schema>

/** Sessions this close to each other (by check-in time) count as "the same shift". */
export const SAME_PHONE_WINDOW_HOURS = 12

/**
 * Correlated subquery for a row selected `from(sessions)` (or joined with it unaliased): a JSON
 * array of the other people whose check-in or check-out within the window used the same phone
 * marker as either end of this session. People are compared by staff record, or by roster entry
 * when an entry is unlinked. Outer columns are written as "sessions"."…" because Drizzle leaves
 * single-table selects unqualified, which would be ambiguous inside the subquery.
 */
export const samePhoneNamesSql = sql<string | null>`(
  SELECT json_group_array(DISTINCT e2.name)
  FROM sessions s2 JOIN roster_entries e2 ON e2.id = s2.roster_entry_id
  WHERE s2.id <> "sessions"."id"
    AND (
      ("sessions"."device_hash_in" IS NOT NULL AND (s2.device_hash_in = "sessions"."device_hash_in" OR s2.device_hash_out = "sessions"."device_hash_in"))
      OR ("sessions"."device_hash_out" IS NOT NULL AND (s2.device_hash_in = "sessions"."device_hash_out" OR s2.device_hash_out = "sessions"."device_hash_out"))
    )
    AND abs(julianday(s2.check_in_at) - julianday("sessions"."check_in_at")) * 24 <= ${sql.raw(String(SAME_PHONE_WINDOW_HOURS))}
    AND coalesce(e2.staff_id, -e2.id) <> (SELECT coalesce(e1.staff_id, -e1.id) FROM roster_entries e1 WHERE e1.id = "sessions"."roster_entry_id")
)`

/** Parses the subquery's JSON array; anything unexpected reads as "no other people". */
export function parseSamePhoneNames(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string' && n.length > 0).sort() : []
  } catch {
    return []
  }
}

/**
 * For each passkey, the other people this phone was set up for or used by, at any time. Two
 * small queries over the marker hashes of the given passkeys; passkeys without a marker get [].
 */
export async function samePhoneForCredentials(
  db: Db,
  creds: { credentialId: string; staffId: number }[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (!creds.length) return result
  const ids = creds.map((c) => c.credentialId)
  const hashes = await db.select({ id: staffCredentials.id, hash: staffCredentials.deviceHash })
    .from(staffCredentials).where(and(inArray(staffCredentials.id, ids), isNotNull(staffCredentials.deviceHash))).all()
  const hashById = new Map(hashes.map((h) => [h.id, h.hash as string]))
  const uniqueHashes = [...new Set(hashById.values())]
  if (!uniqueHashes.length) return result

  // People per hash: { staffId (or -entryId when unlinked), name }.
  const people = new Map<string, Map<number, string>>()
  const add = (hash: string | null, key: number, name: string) => {
    if (!hash) return
    let byKey = people.get(hash)
    if (!byKey) people.set(hash, (byKey = new Map()))
    byKey.set(key, name)
  }
  for (const chunk of chunks(uniqueHashes, 40)) {
    const enrolled = await db.select({ hash: staffCredentials.deviceHash, staffId: staff.id, name: staff.name })
      .from(staffCredentials).innerJoin(staff, eq(staff.id, staffCredentials.staffId))
      .where(inArray(staffCredentials.deviceHash, chunk)).all()
    for (const r of enrolled) add(r.hash, r.staffId, r.name)
    const used = await db.select({
      hashIn: sessions.deviceHashIn, hashOut: sessions.deviceHashOut,
      staffId: rosterEntries.staffId, entryId: rosterEntries.id, name: rosterEntries.name,
    })
      .from(sessions).innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId))
      .where(or(inArray(sessions.deviceHashIn, chunk), inArray(sessions.deviceHashOut, chunk))).all()
    for (const r of used) {
      const key = r.staffId ?? -r.entryId
      if (r.hashIn && chunk.includes(r.hashIn)) add(r.hashIn, key, r.name)
      if (r.hashOut && chunk.includes(r.hashOut)) add(r.hashOut, key, r.name)
    }
  }
  for (const c of creds) {
    const hash = hashById.get(c.credentialId)
    const byKey = hash ? people.get(hash) : undefined
    if (!byKey) continue
    const others = [...byKey].filter(([key]) => key !== c.staffId).map(([, name]) => name)
    if (others.length) result.set(c.credentialId, [...new Set(others)].sort())
  }
  return result
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}


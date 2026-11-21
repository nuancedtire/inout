import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import type { getDb } from './client'
import { sessions, siteSettings, staff, staffCredentials, webauthnChallenges, type StaffCredential } from './schema'
import type { SiteArea } from '#/utils/location'
import { samePhoneForCredentials } from './samePhone'

type Db = Awaited<ReturnType<typeof getDb>>

export const CHALLENGE_TTL_MS = 5 * 60 * 1000

// ─── Challenges ──────────────────────────────────────────────────────────

/** Opportunistic cleanup; there is no scheduled job. */
export async function pruneExpiredChallenges(db: Db, now = new Date()) {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now.toISOString()))
}

export async function storeChallenge(db: Db, row: {
  challenge: string
  purpose: 'register' | 'authenticate'
  staffId?: number | null
  rosterEntryId?: number | null
}, now = new Date()) {
  await db.insert(webauthnChallenges).values({
    challenge: row.challenge,
    purpose: row.purpose,
    staffId: row.staffId ?? null,
    rosterEntryId: row.rosterEntryId ?? null,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
  })
}

/**
 * Atomically takes a challenge: the DELETE … RETURNING succeeds for exactly one caller, so a
 * challenge can never be used twice, even by concurrent requests. Returns null when the
 * challenge is unknown, already used, for another purpose, or expired.
 */
export async function consumeChallenge(db: Db, challenge: string, purpose: 'register' | 'authenticate', now = new Date()) {
  const [row] = await db.delete(webauthnChallenges)
    .where(and(eq(webauthnChallenges.challenge, challenge), eq(webauthnChallenges.purpose, purpose)))
    .returning()
  if (!row || row.expiresAt <= now.toISOString()) return null
  return row
}

// ─── Credentials ─────────────────────────────────────────────────────────

export async function getCredential(db: Db, id: string): Promise<StaffCredential | undefined> {
  return db.select().from(staffCredentials).where(eq(staffCredentials.id, id)).get()
}

export async function listExcludableCredentials(db: Db, staffId: number) {
  const rows = await db.select({ id: staffCredentials.id, transports: staffCredentials.transports })
    .from(staffCredentials)
    .where(and(eq(staffCredentials.staffId, staffId), ne(staffCredentials.status, 'rejected')))
    .all()
  return rows.map((r) => ({ id: r.id, transports: parseTransports(r.transports) }))
}

export function parseTransports(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : undefined
  } catch {
    return undefined
  }
}

export type EnrolmentRow = {
  credentialId: string
  staffId: number
  staffName: string
  staffRole: string | null
  staffActive: boolean
  label: string | null
  aaguid: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  deviceType: 'singleDevice' | 'multiDevice' | null
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  sessionsCount: number
  /** Other approved passkeys for the same staff record (a second phone always needs approval). */
  otherApprovedCount: number
  /** Other people the phone that enrolled this passkey was also set up for or used by. */
  samePhoneAs: string[]
}

export async function listEnrolments(db: Db, status: 'pending' | 'all'): Promise<EnrolmentRow[]> {
  const rows = await db.select({
    credentialId: staffCredentials.id,
    staffId: staff.id,
    staffName: staff.name,
    staffRole: staff.role,
    staffActive: staff.active,
    label: staffCredentials.label,
    aaguid: staffCredentials.aaguid,
    status: staffCredentials.status,
    deviceType: staffCredentials.deviceType,
    backedUp: staffCredentials.backedUp,
    createdAt: staffCredentials.createdAt,
    lastUsedAt: staffCredentials.lastUsedAt,
    reviewedAt: staffCredentials.reviewedAt,
    reviewedBy: staffCredentials.reviewedBy,
    sessionsCount: sql<number>`(SELECT count(*) FROM ${sessions} WHERE ${sessions.credentialIdIn} = ${staffCredentials.id} OR ${sessions.credentialIdOut} = ${staffCredentials.id})`.mapWith(Number),
    otherApprovedCount: sql<number>`(SELECT count(*) FROM ${staffCredentials} c2 WHERE c2.staff_id = ${staffCredentials.staffId} AND c2.status = 'approved' AND c2.id <> ${staffCredentials.id})`.mapWith(Number),
  })
    .from(staffCredentials)
    .innerJoin(staff, eq(staff.id, staffCredentials.staffId))
    .where(status === 'pending' ? eq(staffCredentials.status, 'pending') : undefined)
    .orderBy(desc(staffCredentials.createdAt), desc(staffCredentials.id))
    .all()
  const samePhone = await samePhoneForCredentials(db, rows)
  return rows.map((r) => ({ ...r, samePhoneAs: samePhone.get(r.credentialId) ?? [] }))
}

export async function countPendingEnrolments(db: Db): Promise<number> {
  const row = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(staffCredentials)
    .where(eq(staffCredentials.status, 'pending')).get()
  return row?.n ?? 0
}

const ALLOWED_FROM: Record<'approved' | 'rejected' | 'revoked', StaffCredential['status'][]> = {
  approved: ['pending'],
  rejected: ['pending'],
  revoked: ['pending', 'approved'],
}

/**
 * Approve or reject a pending passkey, or revoke one. Rejected and revoked are final: the person
 * enrols again. Existing sessions keep their original identity assurance.
 */
export async function buildCredentialStatusChange(db: Db, credentialId: string, status: 'approved' | 'rejected' | 'revoked') {
  const current = await db.select({ id: staffCredentials.id, status: staffCredentials.status, staffId: staffCredentials.staffId, staffName: staff.name })
    .from(staffCredentials).innerJoin(staff, eq(staff.id, staffCredentials.staffId))
    .where(eq(staffCredentials.id, credentialId)).get()
  if (!current) throw new Error('Passkey not found')
  if (!ALLOWED_FROM[status].includes(current.status)) {
    throw new Error(`This passkey is ${current.status} and cannot be ${status}`)
  }
  const statement = db.update(staffCredentials)
    .set({ status, reviewedAt: new Date().toISOString(), reviewedBy: 'admin' })
    .where(and(eq(staffCredentials.id, credentialId), inArray(staffCredentials.status, ALLOWED_FROM[status])))
    .returning({ id: staffCredentials.id })
  return { current, statement }
}

// ─── Site settings ───────────────────────────────────────────────────────

export const DEFAULT_SITE: SiteArea = { latitude: null, longitude: null, radiusM: 150, accuracyCeilingM: 100 }

export async function getSiteSettings(db: Db): Promise<SiteArea & { updatedAt: string | null }> {
  const row = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).get()
  if (!row) return { ...DEFAULT_SITE, updatedAt: null }
  return { latitude: row.latitude, longitude: row.longitude, radiusM: row.radiusM, accuracyCeilingM: row.accuracyCeilingM, updatedAt: row.updatedAt }
}

export function buildSiteSettingsUpsert(db: Db, area: { latitude: number; longitude: number; radiusM: number; accuracyCeilingM: number }) {
  const values = { ...area, updatedAt: new Date().toISOString() }
  return db.insert(siteSettings).values({ id: 1, ...values })
    .onConflictDoUpdate({ target: siteSettings.id, set: values })
}

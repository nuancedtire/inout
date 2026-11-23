/**
 * Admin functions for staff records, passkey enrolments, the department area and session review.
 * Each handler checks the admin token itself; UI gates are not an authorisation boundary.
 */
import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '#/db/client'
import { auditIfChanged } from '#/db/attendance'
import {
  buildCredentialStatusChange,
  buildSiteSettingsUpsert,
  getSiteSettings,
  listEnrolments,
  type EnrolmentRow,
} from '#/db/passkeys'
import { auditLog, sessions } from '#/db/schema'
import {
  linkRosterEntry,
  listStaff,
  listUnlinkedEntries,
  setStaffActive,
  type RotaLinkResult,
  type StaffListRow,
  type UnlinkedEntry,
} from '#/db/staff'
import { requireAdmin } from './auth'
import { logAudit } from './audit'
import {
  validateAdminDate,
  validateAdminAuth,
  validateLinkRosterEntry,
  validateListEnrolments,
  validateReviewSession,
  validateSetCredentialStatus,
  validateSetSiteSettings,
  validateSetStaffActive,
} from './validation'

export type { EnrolmentRow, StaffListRow, RotaLinkResult, UnlinkedEntry }

export type SiteSettingsView = {
  latitude: number | null
  longitude: number | null
  radiusM: number
  accuracyCeilingM: number
  configured: boolean
  updatedAt: string | null
}

export const adminListEnrolments = createServerFn({ method: 'POST' })
  .validator(validateListEnrolments)
  .handler(async ({ data }): Promise<{ enrolments: EnrolmentRow[] }> => {
    await requireAdmin({ token: data.authToken })
    return { enrolments: await listEnrolments(await getDb(), data.status) }
  })

export const adminSetCredentialStatus = createServerFn({ method: 'POST' })
  .validator(validateSetCredentialStatus)
  .handler(async ({ data }): Promise<{ ok: true; credentialId: string; status: 'approved' | 'rejected' | 'revoked' }> => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const { current, statement } = await buildCredentialStatusChange(db, data.credentialId, data.status)
    const event = `passkey_${data.status}`
    const [updated] = await db.batch([
      statement,
      auditIfChanged(db, event, { credentialId: data.credentialId, staffId: current.staffId, name: current.staffName, from: current.status }, 'admin'),
    ])
    if (!(updated as unknown[]).length) throw new Error('This passkey changed in the meantime. Reload and try again.')
    return { ok: true, credentialId: data.credentialId, status: data.status }
  })

export const adminListStaff = createServerFn({ method: 'POST' })
  .validator(validateAdminAuth)
  .handler(async ({ data }): Promise<{ staff: StaffListRow[] }> => {
    await requireAdmin({ token: data.authToken })
    return { staff: await listStaff(await getDb()) }
  })

export const adminSetStaffActive = createServerFn({ method: 'POST' })
  .validator(validateSetStaffActive)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin({ token: data.authToken })
    const person = await setStaffActive(await getDb(), data.staffId, data.active)
    await logAudit(data.active ? 'staff_activated' : 'staff_deactivated', { staffId: person.id, name: person.name }, 'admin')
    return { ok: true }
  })

export const adminLinkRosterEntry = createServerFn({ method: 'POST' })
  .validator(validateLinkRosterEntry)
  .handler(async ({ data }): Promise<{ ok: true; aliasSaved: boolean; alsoLinked: number }> => {
    await requireAdmin({ token: data.authToken })
    const result = await linkRosterEntry(await getDb(), data.entryId, data.staffId)
    await logAudit(
      data.staffId === null ? 'roster_entry_unlinked' : 'roster_entry_linked',
      { entryId: data.entryId, staffId: data.staffId, ...(result.aliasSaved ? { aliasSaved: true, alsoLinked: result.alsoLinked } : {}) },
      'admin',
    )
    return { ok: true, ...result }
  })

/**
 * Roster entries on a date that are not linked to a staff record, with the reason and any
 * suggested profiles. Entries that now match exactly one profile are linked first.
 */
export const adminListUnlinkedEntries = createServerFn({ method: 'POST' })
  .validator(validateAdminDate)
  .handler(async ({ data }): Promise<{ unlinked: UnlinkedEntry[] }> => {
    await requireAdmin({ token: data.authToken })
    return { unlinked: await listUnlinkedEntries(await getDb(), data.date) }
  })

export const adminGetSiteSettings = createServerFn({ method: 'POST' })
  .validator(validateAdminAuth)
  .handler(async ({ data }): Promise<SiteSettingsView> => {
    await requireAdmin({ token: data.authToken })
    const site = await getSiteSettings(await getDb())
    return { ...site, configured: site.latitude !== null && site.longitude !== null }
  })

/** Department centre (set with "use my current position" in the department), radius and accuracy ceiling. */
export const adminSetSiteSettings = createServerFn({ method: 'POST' })
  .validator(validateSetSiteSettings)
  .handler(async ({ data }): Promise<SiteSettingsView> => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const { authToken: _authToken, ...area } = data
    await db.batch([
      buildSiteSettingsUpsert(db, area),
      // Tuning values only; the centre is deliberately left out of the audit log.
      db.insert(auditLog).values({
        event: 'site_area_updated',
        details: JSON.stringify({ radiusM: area.radiusM, accuracyCeilingM: area.accuracyCeilingM }),
        actor: 'admin',
      }),
    ])
    const site = await getSiteSettings(db)
    return { ...site, configured: true }
  })

/** Accept a flagged session with a note. The original evidence is not altered. */
export const adminReviewSession = createServerFn({ method: 'POST' })
  .validator(validateReviewSession)
  .handler(async ({ data }): Promise<{ ok: true; reviewedAt: string }> => {
    await requireAdmin({ token: data.authToken })
    const db = await getDb()
    const reviewedAt = new Date().toISOString()
    const [updated] = await db.batch([
      db.update(sessions)
        .set({ reviewState: 'accepted', reviewedAt, reviewedBy: 'admin', reviewNote: data.note })
        .where(and(eq(sessions.id, data.sessionId), isNull(sessions.reviewState)))
        .returning({ id: sessions.id }),
      auditIfChanged(db, 'session_accepted', { sessionId: data.sessionId, note: data.note }, 'admin'),
    ])
    if (!(updated as unknown[]).length) {
      const existing = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, data.sessionId)).get()
      throw new Error(existing ? 'This session has already been accepted' : 'Session not found')
    }
    return { ok: true, reviewedAt }
  })

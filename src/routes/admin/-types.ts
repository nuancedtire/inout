import type { adminGetDashboard, DashboardEvidence } from '#/utils/sessions.functions'
import type { adminListEnrolments, adminListStaff, adminGetSiteSettings } from '#/utils/staff.functions'

/** Everything the admin dashboard endpoint returns, typed from the server function itself. */
export type DashboardData = Awaited<ReturnType<typeof adminGetDashboard>>

/** A roster entry with its latest session's times and evidence (snake_case fields from the rota). */
export type RosterEntryWithStatus = DashboardData['entries'][number]

/** One session for the selected date with its evidence. `id` is the session ID. */
export type SessionRow = DashboardData['sessions'][number]

/** Someone currently checked in. `id` is the roster entry ID. */
export type PresentStaff = DashboardData['present'][number]

export type EnrolmentRow = Awaited<ReturnType<typeof adminListEnrolments>>['enrolments'][number]
export type StaffListRow = Awaited<ReturnType<typeof adminListStaff>>['staff'][number]
export type SiteSettingsView = Awaited<ReturnType<typeof adminGetSiteSettings>>

/**
 * The common shape every verification chip, evidence dialog and review flow reads, whichever
 * dashboard list the row came from.
 */
export type EvidenceSubject = DashboardEvidence & {
  sessionId: number
  name: string
  role: string | null
  checkInAt: string
  checkOutAt: string | null
}

export function subjectFromSession(s: SessionRow): EvidenceSubject {
  return { ...s, sessionId: s.id, checkInAt: s.check_in_at, checkOutAt: s.check_out_at }
}

export function subjectFromPresent(p: PresentStaff): EvidenceSubject {
  return { ...p, checkInAt: p.check_in_at, checkOutAt: null }
}

export function subjectFromEntry(e: RosterEntryWithStatus): EvidenceSubject | null {
  if (e.sessionId === null || !e.checkInAt) return null
  return { ...e, sessionId: e.sessionId, checkInAt: e.checkInAt, checkOutAt: e.checkOutAt }
}

/** A session still needs a coordinator's look: flagged and not yet accepted. */
export function needsReview(s: Pick<DashboardEvidence, 'verified' | 'accepted'>) {
  return !s.verified && !s.accepted
}

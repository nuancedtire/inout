import { useCallback, useEffect, useRef, useState } from 'react'
import { adminGetDashboard } from '#/utils/sessions.functions'
import { useAdminContext } from '#/routes/admin/-context'
import type { DashboardData } from '#/routes/admin/-types'
import { setPendingApprovals } from './pendingApprovals'

export function isAuthError(e: unknown) {
  return e instanceof Error && /^Unauthorized/.test(e.message)
}

/**
 * The selected date's dashboard data (roster, sessions with evidence, audit, pending approvals).
 * Read once per date; no polling. `reload` refetches without blanking the page; `patch` applies
 * an optimistic local change. An expired admin token locks the admin area.
 */
export function useDashboard() {
  const { authToken, viewDate, logout } = useAdminContext()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  // The context's logout is recreated on every render; keep it out of the effect's dependencies.
  const logoutRef = useRef(logout)
  logoutRef.current = logout

  const load = useCallback(async (quiet: boolean) => {
    const id = ++request.current
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const next = await adminGetDashboard({ data: { date: viewDate, authToken } })
      if (id !== request.current) return
      setData(next)
      setPendingApprovals(next.pendingEnrolments)
    } catch (e) {
      if (id !== request.current) return
      if (isAuthError(e)) logoutRef.current()
      setError(e instanceof Error ? e.message : 'Could not load this page')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [viewDate, authToken])

  useEffect(() => {
    void load(false)
  }, [load])

  const reload = useCallback(() => load(true), [load])
  const patch = useCallback((fn: (d: DashboardData) => DashboardData) => setData((d) => (d ? fn(d) : d)), [])

  return { data, loading, error, reload, retry: () => load(false), patch, viewDate }
}

/** Mark a session accepted everywhere it appears in the dashboard payload. */
export function acceptInDashboard(d: DashboardData, sessionId: number, note: string): DashboardData {
  const mark = <T extends { reviewState: 'accepted' | null; reviewNote: string | null; accepted: boolean }>(row: T): T =>
    ({ ...row, reviewState: 'accepted', reviewNote: note, accepted: true })
  return {
    ...d,
    sessions: d.sessions.map((s) => (s.id === sessionId ? mark(s) : s)),
    present: d.present.map((p) => (p.sessionId === sessionId ? mark(p) : p)),
    entries: d.entries.map((e) => (e.sessionId === sessionId ? mark(e) : e)),
  }
}

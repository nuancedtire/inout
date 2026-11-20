import { useEffect, useSyncExternalStore } from 'react'
import { adminListEnrolments } from '#/utils/staff.functions'

/**
 * Count of phones waiting for approval, shared by the sidebar, the dock and the pages that
 * change it. Pages that already fetch the number (dashboard, approvals) push it here; the nav
 * fetches it once per admin token if nobody has yet. No polling: dashboard reads do not poll.
 */
let count: number | null = null
let loadedFor: string | null = null
const listeners = new Set<() => void>()

export function setPendingApprovals(next: number) {
  if (next === count) return
  count = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePendingApprovals(authToken: string | null): number {
  const value = useSyncExternalStore(subscribe, () => count, () => null)
  useEffect(() => {
    if (!authToken || loadedFor === authToken) return
    loadedFor = authToken
    adminListEnrolments({ data: { authToken, status: 'pending' } })
      .then(({ enrolments }) => setPendingApprovals(enrolments.length))
      .catch(() => {
        loadedFor = null
      })
  }, [authToken])
  return value ?? 0
}

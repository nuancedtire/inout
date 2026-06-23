import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAdminContext } from '#/routes/admin/-context'
import { adminGetDashboard, adminUpdateSession, adminDeleteSession } from '#/utils/sessions.functions'
import { useLoading } from '#/hooks/useLoading'
import { useAutoDismiss } from '#/routes/admin/-hooks'
import { MessageBanner } from '#/routes/admin/-components/MessageBanner'
import { SessionSection } from '#/routes/admin/-components/SessionSection'
import { ConfirmDialog } from '#/components/ConfirmDialog'
import type { SessionRow } from '#/routes/admin/-types'

export const Route = createFileRoute('/admin/sessions')({
  component: AdminSessions,
})

function AdminSessions() {
  const { authToken, viewDate } = useAdminContext()
  const { withLoading } = useLoading()
  const { message, show, clear } = useAutoDismiss()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    confirmVariant: 'danger' | 'warning'
    onConfirm: () => Promise<void>
  } | null>(null)

  const refresh = async () => {
    if (!authToken) return
    setError(null)
    try {
      const dashboard = await adminGetDashboard({
        data: { date: viewDate, authToken },
      })
      setSessions((dashboard as { sessions: SessionRow[] }).sessions ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions'
      setError(msg)
      throw e
    }
  }

  useEffect(() => {
    let cancelled = false
    setDataLoading(true)
    refresh()
      .finally(() => {
        if (!cancelled) setDataLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewDate, authToken])

  const handleUpdateSession = async (
    sessionId: number,
    form: { checkInAt: string; checkOutAt: string | undefined },
  ) => {
    await withLoading(`saveSession-${sessionId}`, async () => {
      await adminUpdateSession({
        data: {
          sessionId,
          checkInAt: form.checkInAt,
          checkOutAt: form.checkOutAt,
          authToken,
        },
      })
      show('Session updated')
      await refresh()
    })
  }

  const handleDeleteSession = (sessionId: number) => {
    setConfirmDialog({
      title: 'Delete Session',
      message: 'Delete this session permanently?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: () =>
        withLoading(`delSession-${sessionId}`, async () => {
          await adminDeleteSession({ data: { sessionId, authToken } })
          show('Session deleted')
          await refresh()
        }),
    })
  }

  if (dataLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-64 bg-neutral-200 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MessageBanner message={message} onClose={clear} />
      {error && (
        <div className="p-4 bg-danger-50 text-danger-800 rounded-lg border border-danger-200">
          <p className="font-medium">Failed to load sessions</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <SessionSection sessions={sessions} onUpdate={handleUpdateSession} onDelete={handleDeleteSession} />

      <ConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAdminContext } from '#/routes/admin/-context'
import { adminUpdateSession, adminDeleteSession } from '#/utils/sessions.functions'
import { SessionSection } from '#/routes/admin/-components/SessionSection'
import { EvidenceDialog } from '#/routes/admin/-components/verification'
import { acceptInDashboard, useDashboard } from '#/routes/admin/-components/useDashboard'
import { errorText, LoadError, Notice, Page, PanelSkeleton } from '#/routes/admin/-components/kit'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import type { EvidenceSubject } from '#/routes/admin/-types'

export const Route = createFileRoute('/admin/sessions')({
  component: AdminSessions,
})

function AdminSessions() {
  const { authToken } = useAdminContext()
  const { data, loading, error, reload, retry, patch } = useDashboard()
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null)
  const [details, setDetails] = useState<EvidenceSubject | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  if (loading && !data) return <Page><PanelSkeleton rows={6} /></Page>
  if (error && !data) return <Page><LoadError title="Could not load sessions" message={error} onRetry={retry} /></Page>
  if (!data) return null

  const handleUpdate = async (sessionId: number, form: { checkInAt: string; checkOutAt: string | undefined }) => {
    setSavingId(sessionId)
    try {
      await adminUpdateSession({ data: { sessionId, checkInAt: form.checkInAt, checkOutAt: form.checkOutAt, authToken } })
      setNotice({ text: 'Session times saved.', tone: 'success' })
      await reload()
    } catch (e) {
      setNotice({ text: errorText(e, 'Could not save the session.'), tone: 'error' })
      throw e
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = (sessionId: number) => {
    const s = data.sessions.find((r) => r.id === sessionId)
    setConfirm({
      title: 'Delete this session?',
      message: `${s ? `${s.name}'s` : 'This'} check-in and checkout will be removed permanently. The deletion is recorded in the audit log.`,
      confirmLabel: 'Delete session',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await adminDeleteSession({ data: { sessionId, authToken } })
          setNotice({ text: 'Session deleted.', tone: 'success' })
          await reload()
        } catch (e) {
          setNotice({ text: errorText(e, 'Could not delete the session.'), tone: 'error' })
        }
      },
    })
  }

  return (
    <Page>
      {notice ? <Notice message={notice.text} tone={notice.tone} onClose={() => setNotice(null)} /> : null}
      <SessionSection
        sessions={data.sessions}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onDetails={setDetails}
        savingId={savingId}
      />
      <EvidenceDialog
        subject={details}
        onClose={() => setDetails(null)}
        onAccepted={(sessionId, note) => {
          patch((d) => acceptInDashboard(d, sessionId, note))
          setNotice({ text: 'Session accepted.', tone: 'success' })
        }}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Page>
  )
}

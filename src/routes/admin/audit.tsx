import { createFileRoute } from '@tanstack/react-router'
import { AuditLogSection } from '#/routes/admin/-components/AuditLogSection'
import { useDashboard } from '#/routes/admin/-components/useDashboard'
import { LoadError, Page, PanelSkeleton } from '#/routes/admin/-components/kit'

export const Route = createFileRoute('/admin/audit')({
  component: AdminAudit,
})

function AdminAudit() {
  // The audit list is global (latest 50 events), whatever date the other pages show.
  const { data, loading, error, retry } = useDashboard()

  if (loading && !data) return <Page><PanelSkeleton rows={8} /></Page>
  if (error && !data) return <Page><LoadError title="Could not load the audit log" message={error} onRetry={retry} /></Page>
  if (!data) return null

  return (
    <Page>
      <AuditLogSection audit={data.audit} />
    </Page>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MapPinned, Smartphone, UsersRound } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/motion/tabs'
import { adminListEnrolments, adminListStaff } from '#/utils/staff.functions'
import { useAdminContext } from '#/routes/admin/-context'
import { ApprovalsTab } from '#/routes/admin/-components/ApprovalsTab'
import { StaffDirectory } from '#/routes/admin/-components/StaffDirectory'
import { LocationSetup } from '#/routes/admin/-components/LocationSetup'
import { LoadError, Page, PanelSkeleton } from '#/routes/admin/-components/kit'
import { setPendingApprovals } from '#/routes/admin/-components/pendingApprovals'
import { isAuthError } from '#/routes/admin/-components/useDashboard'
import type { EnrolmentRow, StaffListRow } from '#/routes/admin/-types'

const TABS = ['approvals', 'staff', 'location'] as const
type StaffTab = (typeof TABS)[number]

export const Route = createFileRoute('/admin/staff')({
  validateSearch: (search: Record<string, unknown>): { tab?: StaffTab } =>
    (TABS as readonly unknown[]).includes(search.tab) ? { tab: search.tab as StaffTab } : {},
  component: AdminStaff,
})

function AdminStaff() {
  const { authToken, logout } = useAdminContext()
  const { tab = 'approvals' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([])
  const [staff, setStaff] = useState<StaffListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const logoutRef = useRef(logout)
  logoutRef.current = logout

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const [e, s] = await Promise.all([
        adminListEnrolments({ data: { authToken, status: 'all' } }),
        adminListStaff({ data: { authToken } }),
      ])
      setEnrolments(e.enrolments)
      setStaff(s.staff)
      setPendingApprovals(e.enrolments.filter((r) => r.status === 'pending').length)
    } catch (e) {
      if (isAuthError(e)) logoutRef.current()
      setError(e instanceof Error ? e.message : 'Could not load staff')
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => {
    void load()
  }, [load])

  const pending = enrolments.filter((e) => e.status === 'pending')

  return (
    <Page>
      <Tabs
        variant="segment"
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as StaffTab }, replace: true })}
      >
        <TabsList className="w-full sm:w-fit" aria-label="Staff sections" data-tour="staff-tabs">
          <TabsTrigger value="approvals" className="min-h-11 sm:min-w-40">
            <Smartphone className="size-4" aria-hidden="true" />
            Approvals
            {pending.length > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-accessible px-1.5 text-[11px] font-bold tabular-nums text-white">
                {pending.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="staff" className="min-h-11 sm:min-w-32">
            <UsersRound className="size-4" aria-hidden="true" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="location" className="min-h-11 sm:min-w-36" data-tour="location-tab">
            <MapPinned className="size-4" aria-hidden="true" />
            Location
          </TabsTrigger>
        </TabsList>

        {error ? (
          <div className="mt-5">
            <LoadError title="Could not load staff" message={error} onRetry={() => load()} />
          </div>
        ) : null}

        <TabsContent value="approvals" className="mt-5">
          {loading ? <PanelSkeleton rows={2} /> : <ApprovalsTab pending={pending} allEnrolments={enrolments} onChanged={() => load(true)} />}
        </TabsContent>
        <TabsContent value="staff" className="mt-5">
          {loading ? <PanelSkeleton rows={6} /> : <StaffDirectory staff={staff} enrolments={enrolments} onChanged={() => load(true)} />}
        </TabsContent>
        <TabsContent value="location" className="mt-5">
          <LocationSetup />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

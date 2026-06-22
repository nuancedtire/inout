import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  uploadRota,
  addAdHocStaff,
  getQrTokenOrSeed,
  adminUpdateRosterEntry,
} from '#/utils/rotas.functions'
import {
  adminGetDashboard,
  adminUpdateSession,
  adminDeleteSession,
  adminDeleteRosterEntry,
  adminExportSessions,
  runAutoCheckout,
} from '#/utils/sessions.functions'
import { formatDateTime, formatDate, parseShiftTime, addDays } from '#/utils/dateTime'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { ConfirmDialog } from '#/components/ConfirmDialog'
import { Card } from '#/components/Card'
import { Badge } from '#/components/Badge'
import { usePersistentAdminAuth, useAutoDismiss } from '#/routes/admin/-hooks'
import { useLoading } from '#/hooks/useLoading'
import { AdminHeader } from '#/routes/admin/-components/AdminHeader'
import { MessageBanner } from '#/routes/admin/-components/MessageBanner'
import { RefreshError } from '#/routes/admin/-components/RefreshError'
import { SectionNav } from '#/routes/admin/-components/SectionNav'
import { RotaStaffSection } from '#/routes/admin/-components/RotaStaffSection'
import { QrSection } from '#/routes/admin/-components/QrSection'
import { WhoIsInSection, type PresentStaff } from '#/routes/admin/-components/WhoIsInSection'
import { RosterSection } from '#/routes/admin/-components/RosterSection'
import { SessionSection } from '#/routes/admin/-components/SessionSection'
import { AuditLogSection } from '#/routes/admin/-components/AuditLogSection'
import { WeeklyRollupSection } from '#/routes/admin/-components/WeeklyRollupSection'
import type { AuditEventItem } from '#/routes/admin/-components/AuditEvent'
import type { RosterEntryWithStatus, SessionRow } from '#/routes/admin/-types'
import { DailySummary } from '#/routes/admin/-components/DailySummary'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  Clock,
} from 'lucide-react'
import Papa from 'papaparse'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
  errorComponent: ErrorFallback,
  notFoundComponent: () => <NotFound />,
  loader: async () => {
    return { date: new Date().toISOString().slice(0, 10) }
  },
})

function NotFound() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <EmptyState title="Page not found" description="This admin page cannot be found." />
    </main>
  )
}


function AdminPage() {
  const { date: today } = Route.useLoaderData()
  const { authToken, authenticated, pin, setPin, login, logout } = usePersistentAdminAuth()
  const { message, show, clear } = useAutoDismiss()
  const { loading, withLoading } = useLoading()
  const [entries, setEntries] = useState<RosterEntryWithStatus[]>([])
  const [present, setPresent] = useState<PresentStaff[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [audit, setAudit] = useState<AuditEventItem[]>([])
  const [refreshError, setRefreshError] = useState<string | null>(null)
const [confirmDialog, setConfirmDialog] = useState<{
  title: string
  message: string
  confirmLabel: string
  confirmVariant: 'danger' | 'warning'
  onConfirm: () => Promise<void>
} | null>(null)
  const [viewDate, setViewDate] = useState(today)

  const isToday = viewDate === today

  const refresh = async () => {
    if (!authToken) return
    try {
      const dashboard = await adminGetDashboard({
        data: { date: viewDate, authToken },
      })
      setEntries((dashboard.entries as RosterEntryWithStatus[]) ?? [])
      setPresent((dashboard.present as PresentStaff[]) ?? [])
      setSessions((dashboard.sessions as SessionRow[]) ?? [])
      setAudit((dashboard.audit as AuditEventItem[]) ?? [])
      setRefreshError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard'
      // Token expired → force re-login
      if (msg.includes('expired') || msg.includes('Invalid admin')) {
        logout()
      }
      setRefreshError(msg)
      throw e
    }
  }

  useEffect(() => {
    if (authenticated && authToken) {
      refresh().catch((e) => show(e instanceof Error ? e.message : 'Refresh failed'))
    }
  }, [authenticated, authToken, viewDate])

  if (!authenticated) {
    return (
      <main className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <input
          type="password"
          placeholder="Admin PIN"
          aria-label="Admin PIN"
          className="w-full p-3 border border-neutral-300 rounded-lg mb-3 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              await withLoading('unlock', async () => login(pin)).catch((err) =>
                show(err instanceof Error ? err.message : 'Invalid PIN'),
              )
            }
          }}
        />
        <Button
          fullWidth
          loading={loading['unlock']}
          onClick={async () => {
            await withLoading('unlock', async () => login(pin)).catch((err) =>
              show(err instanceof Error ? err.message : 'Invalid PIN'),
            )
          }}
        >
          Unlock
        </Button>
        {message && <p className="mt-3 text-danger-600">{message}</p>}
      </main>
    )
  }

  if (!authToken) return null

  const handleUpload = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    await withLoading('upload', async () => {
      const result = await uploadRota({
        data: {
          date: viewDate,
          fileBase64: base64,
          fileName: file.name,
          authToken,
        },
      })
      const msg = result.unparseableShifts
        ? `Uploaded ${result.count} staff (⚠ ${result.unparseableShifts} had unparseable shift times)`
        : `Uploaded ${result.count} staff`
      show(msg)
      await refresh()
    })
  }

  const handleAddStaff = async (form: FormData) => {
    await withLoading('addStaff', async () => {
      await addAdHocStaff({
        data: {
          name: form.get('name') as string,
          role: (form.get('role') as string) || undefined,
          shiftStart: (form.get('shiftStart') as string) || undefined,
          shiftEnd: (form.get('shiftEnd') as string) || undefined,
          authToken,
        },
      })
      show('Ad-hoc staff added')
      await refresh()
    })
  }

  const handleManualCheckout = async (entryId: number) => {
    await withLoading(`checkout-${entryId}`, async () => {
      await adminUpdateSession({
        data: {
          rosterEntryId: entryId,
          checkOutAt: new Date().toISOString(),
          authToken,
        },
      })
      show('Checked out manually')
      // Optimistic: update local state
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId ? { ...e, checkedIn: false, checkOutAt: new Date().toISOString() } : e,
        ),
      )
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

  const handleUpdateEntry = async (
    entryId: number,
    form: { name: string; role: string; shiftStart: string; shiftEnd: string },
  ) => {
    await withLoading(`saveEntry-${entryId}`, async () => {
      await adminUpdateRosterEntry({
        data: {
          entryId,
          name: form.name,
          role: form.role,
          shiftStart: form.shiftStart,
          shiftEnd: form.shiftEnd,
          authToken,
        },
      })
      show('Roster entry updated')
      await refresh()
    })
  }

  const handleDeleteEntry = (entryId: number) => {
    setConfirmDialog({
      title: 'Delete Roster Entry',
      message: 'Delete roster entry and all linked sessions?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: () =>
        withLoading(`delEntry-${entryId}`, async () => {
          await adminDeleteRosterEntry({ data: { entryId, authToken } })
          show('Roster entry deleted')
          await refresh()
        }),
    })
  }

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

  const handleAutoCheckout = () => {
    setConfirmDialog({
      title: 'Auto-Checkout',
      message: 'Run auto-checkout for anyone whose shift ended >60 min ago?',
      confirmLabel: 'Run',
      confirmVariant: 'warning',
      onConfirm: () =>
        withLoading('autoCheckout', async () => {
          const { closed } = await runAutoCheckout({ data: { authToken } })
          show(`Auto-closed ${closed} session(s)`)
          await refresh()
        }),
    })
  }

  const handleExport = async () => {
    await withLoading('export', async () => {
      const { rows } = await adminExportSessions({
        data: { startDate: viewDate, endDate: viewDate, authToken },
      })

      const csvRows = [
        ['Name', 'Role', 'Check in', 'Check out', 'Hours'],
        ...rows.map((r) => [
          r.name,
          r.role || '',
          formatDateTime(r.check_in_at),
          r.check_out_at ? formatDateTime(r.check_out_at) : '',
          r.hours?.toFixed(2) || '',
        ]),
      ]

      const csv = Papa.unparse(csvRows)

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inout-${viewDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const checkedInCount = entries.filter((e) => e.checkInAt).length
  const stillInCount = present.length

  const now = new Date()
  const missingCheckIn = isToday
    ? entries.filter(
        (e) =>
          !e.checkInAt &&
          (!e.shift_start ||
            (parseShiftTime(viewDate, e.shift_start)?.getTime() ?? 0) < now.getTime()),
      )
    : []
  const missingCheckOut = isToday
    ? entries.filter(
        (e) =>
          e.checkInAt &&
          !e.checkOutAt &&
          e.shift_end &&
          (parseShiftTime(viewDate, e.shift_end)?.getTime() ?? Infinity) < now.getTime(),
      )
    : []
  const allGood = entries.filter((e) => e.checkInAt && e.checkOutAt)

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <AdminHeader onLogout={logout} />

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-neutral-900">Viewing</h2>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Button variant="ghost" size="sm" onClick={() => setViewDate(addDays(viewDate, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <input
              type="date"
              aria-label="Select date"
              className="p-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => setViewDate(addDays(viewDate, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => setViewDate(today)}>
                Today
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Badge variant={isToday ? 'success' : 'neutral'}>
              {isToday ? 'Today' : formatDate(viewDate)}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">On rota</p>
              <p className="text-2xl font-bold text-neutral-900">{entries.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success-100 text-success-600">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Checked in</p>
              <p className="text-2xl font-bold text-neutral-900">{checkedInCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning-100 text-warning-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Currently in</p>
              <p className="text-2xl font-bold text-neutral-900">{stillInCount}</p>
            </div>
          </div>
        </Card>
      </div>

      <MessageBanner message={message} onClose={clear} />
      <RefreshError error={refreshError} onRetry={() => refresh().catch((e) => show(e instanceof Error ? e.message : 'Retry failed'))} />

      <DailySummary
        missingCheckIn={missingCheckIn}
        missingCheckOut={missingCheckOut}
        allGood={allGood}
        entries={entries}
        viewDate={viewDate}
      />
      <SectionNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QrSection today={viewDate} onGenerate={async (qrDate: string) => {
          const { default: QRCode } = await import('qrcode')
          const { token } = await getQrTokenOrSeed({ data: { date: qrDate } })
          if (!token) throw new Error('No rota for this date. Upload a rota first.')
          const url = `${window.location.origin}/?token=${token}`
          return QRCode.toDataURL(url, { width: 360 })
        }} />
        <RotaStaffSection
          onUpload={handleUpload}
          onAdd={handleAddStaff}
          uploadLoading={loading['upload'] ?? false}
          addLoading={loading['addStaff'] ?? false}
          date={viewDate}
        />
      </div>

      <WhoIsInSection present={present} />
      <RosterSection
        entries={entries}
        loading={loading}
        viewDate={viewDate}
        onCheckout={handleManualCheckout}
        onUpdate={handleUpdateEntry}
        onDelete={handleDeleteEntry}
        onAutoCheckout={handleAutoCheckout}
        onExport={handleExport}
      />
      <SessionSection sessions={sessions} onUpdate={handleUpdateSession} onDelete={handleDeleteSession} />
      <WeeklyRollupSection viewDate={viewDate} authToken={authToken} />
      <AuditLogSection audit={audit} />

      <ConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </main>
  )
}

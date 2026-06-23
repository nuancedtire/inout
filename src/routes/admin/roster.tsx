import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAdminContext } from '#/routes/admin/-context'
import {
  uploadRota,
  addAdHocStaff,
  getQrTokenOrSeed,
  adminUpdateRosterEntry,
} from '#/utils/rotas.functions'
import {
  adminGetDashboard,
  adminUpdateSession,
  adminDeleteRosterEntry,
  adminExportSessions,
  runAutoCheckout,
} from '#/utils/sessions.functions'
import { formatDateTime } from '#/utils/dateTime'
import { useLoading } from '#/hooks/useLoading'
import { useAutoDismiss } from '#/routes/admin/-hooks'
import { MessageBanner } from '#/routes/admin/-components/MessageBanner'
import { QrSection } from '#/routes/admin/-components/QrSection'
import { RotaStaffSection } from '#/routes/admin/-components/RotaStaffSection'
import { RosterSection } from '#/routes/admin/-components/RosterSection'
import { WeeklyRollupSection } from '#/routes/admin/-components/WeeklyRollupSection'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import type { RosterEntryWithStatus } from '#/routes/admin/-types'
import Papa from 'papaparse'

export const Route = createFileRoute('/admin/roster')({
  component: AdminRoster,
})

function AdminRoster() {
  const { authToken, viewDate, setViewDate } = useAdminContext()
  const { loading, withLoading } = useLoading()
  const { message, show, clear } = useAutoDismiss()
  const [entries, setEntries] = useState<RosterEntryWithStatus[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null)

  const refresh = async () => {
    if (!authToken) return
    setError(null)
    try {
      const dashboard = await adminGetDashboard({
        data: { date: viewDate, authToken },
      })
      setEntries((dashboard as { entries: RosterEntryWithStatus[] }).entries ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load roster data'
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

  // ── Handlers ──────────────────────────────────────────────────────

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
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, checkedIn: false, checkOutAt: new Date().toISOString() }
            : e,
        ),
      )
      await refresh()
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
        ...rows.map((r: { name: string; role: string | null; check_in_at: string; check_out_at: string | null; hours: number | null }) => [
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

  const handleQrGenerate = async (qrDate: string) => {
    const { default: QRCode } = await import('qrcode')
    const { token } = await getQrTokenOrSeed({ data: { date: qrDate } })
    const url = `${window.location.origin}/?token=${token}`
    return QRCode.toDataURL(url, { width: 360 })
  }

  if (dataLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-neutral-200 rounded-xl" />
          <div className="h-64 bg-neutral-200 rounded-xl" />
        </div>
        <div className="h-96 bg-neutral-200 rounded-xl" />
        <div className="h-64 bg-neutral-200 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MessageBanner message={message} onClose={clear} />
      {error && (
        <div className="p-4 bg-danger-50 text-danger-800 rounded-lg border border-danger-200">
          <p className="font-medium">Failed to load roster data</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QrSection viewDate={viewDate} onDateChange={setViewDate} onGenerate={handleQrGenerate} />
        <RotaStaffSection
          onUpload={handleUpload}
          onAdd={handleAddStaff}
          uploadLoading={loading['upload'] ?? false}
          addLoading={loading['addStaff'] ?? false}
          date={viewDate}
        />
      </div>

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
      <WeeklyRollupSection viewDate={viewDate} authToken={authToken} />

      <ConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}

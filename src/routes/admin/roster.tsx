import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAdminContext } from '#/routes/admin/-context'
import { uploadRota, addAdHocStaff, getQrTokenOrSeed, adminUpdateRosterEntry } from '#/utils/rotas.functions'
import { adminUpdateSession, adminDeleteRosterEntry, adminExportSessions, runAutoCheckout } from '#/utils/sessions.functions'
import { adminLinkRosterEntry, adminListStaff, adminListUnlinkedEntries } from '#/utils/staff.functions'
import { buildAttendanceCsv } from '#/utils/exportCsv'
import { useLoading } from '#/hooks/useLoading'
import { QrSection } from '#/routes/admin/-components/QrSection'
import { RotaStaffSection, type UploadSummary } from '#/routes/admin/-components/RotaStaffSection'
import { RosterSection } from '#/routes/admin/-components/RosterSection'
import { WeeklyRollupSection } from '#/routes/admin/-components/WeeklyRollupSection'
import { LinkStaffPanel, type UnlinkedEntry } from '#/routes/admin/-components/LinkStaffPanel'
import { EvidenceDialog } from '#/routes/admin/-components/verification'
import { acceptInDashboard, useDashboard } from '#/routes/admin/-components/useDashboard'
import { errorText, LoadError, Notice, Page, PanelSkeleton } from '#/routes/admin/-components/kit'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import type { EvidenceSubject, StaffListRow } from '#/routes/admin/-types'

export const Route = createFileRoute('/admin/roster')({
  component: AdminRoster,
})

function AdminRoster() {
  const { authToken, viewDate, today } = useAdminContext()
  const { data, loading: dataLoading, error, reload, retry, patch } = useDashboard()
  const { loading, withLoading } = useLoading()
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null)
  const [details, setDetails] = useState<EvidenceSubject | null>(null)
  const [lastUpload, setLastUpload] = useState<UploadSummary | null>(null)
  const [unlinked, setUnlinked] = useState<UnlinkedEntry[]>([])
  const [staff, setStaff] = useState<StaffListRow[]>([])
  const [linkingId, setLinkingId] = useState<number | null>(null)

  const ok = (text: string) => setNotice({ text, tone: 'success' })
  const fail = (e: unknown, fallback: string) => setNotice({ text: errorText(e, fallback), tone: 'error' })

  const loadLinks = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([
        adminListUnlinkedEntries({ data: { date: viewDate, authToken } }),
        adminListStaff({ data: { authToken } }),
      ])
      setUnlinked(u.unlinked)
      setStaff(s.staff)
    } catch {
      setUnlinked([])
    }
  }, [viewDate, authToken])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  const refresh = async () => {
    await Promise.all([reload(), loadLinks()])
  }

  // ── Handlers ──────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    await withLoading('upload', async () => {
      const result = await uploadRota({ data: { date: viewDate, fileBase64: btoa(binary), fileName: file.name, authToken } })
      setLastUpload({
        count: result.count,
        linked: result.linked,
        unlinked: result.unlinked.length,
        unparseableShifts: result.unparseableShifts,
        date: viewDate,
      })
      setUnlinked(result.unlinked)
      setNotice(null)
      await refresh()
    })
  }

  const handleAddStaff = async (form: FormData) => {
    try {
      await withLoading('addStaff', () =>
        addAdHocStaff({
          data: {
            name: String(form.get('name') ?? ''),
            role: (form.get('role') as string) || undefined,
            shiftStart: (form.get('shiftStart') as string) || undefined,
            shiftEnd: (form.get('shiftEnd') as string) || undefined,
            authToken,
          },
        }),
      )
      ok(`${String(form.get('name'))} added to today’s rota.`)
      await refresh()
      return true
    } catch (e) {
      fail(e, 'Could not add this person.')
      return false
    }
  }

  const handleManualCheckout = async (entryId: number) => {
    const entry = data?.entries.find((e) => e.id === entryId)
    try {
      await withLoading(`checkout-${entryId}`, () =>
        adminUpdateSession({ data: { rosterEntryId: entryId, checkOutAt: new Date().toISOString(), authToken } }),
      )
      ok(`${entry?.name ?? 'They'} checked out.`)
      await refresh()
    } catch (e) {
      fail(e, 'Could not check them out.')
    }
  }

  const handleUpdateEntry = async (entryId: number, form: { name: string; role: string; shiftStart: string; shiftEnd: string }) => {
    try {
      await withLoading(`saveEntry-${entryId}`, () => adminUpdateRosterEntry({ data: { entryId, ...form, authToken } }))
      ok('Roster entry saved.')
      await refresh()
    } catch (e) {
      fail(e, 'Could not save the roster entry.')
      throw e
    }
  }

  const handleDeleteEntry = (entryId: number) => {
    const entry = data?.entries.find((e) => e.id === entryId)
    setConfirm({
      title: `Remove ${entry?.name ?? 'this person'} from the rota?`,
      message: entry?.checkInAt
        ? 'Their sessions for this date are deleted too. This is recorded in the audit log.'
        : 'They have no sessions for this date. This is recorded in the audit log.',
      confirmLabel: 'Remove',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await adminDeleteRosterEntry({ data: { entryId, authToken } })
          ok('Removed from the rota.')
          await refresh()
        } catch (e) {
          fail(e, 'Could not remove this entry.')
        }
      },
    })
  }

  const handleAutoCheckout = () => {
    setConfirm({
      title: 'Run auto-checkout?',
      message: 'Checks out everyone on today’s rota whose shift ended more than an hour ago, stamped with the time now. Each is recorded as an admin checkout.',
      confirmLabel: 'Run auto-checkout',
      confirmVariant: 'warning',
      onConfirm: async () => {
        try {
          const { closed } = await withLoading('autoCheckout', () => runAutoCheckout({ data: { authToken } }))
          ok(closed ? `Checked out ${closed} ${closed === 1 ? 'person' : 'people'}.` : 'No one needed checking out.')
          await refresh()
        } catch (e) {
          fail(e, 'Auto-checkout failed.')
        }
      },
    })
  }

  const handleExport = async () => {
    try {
      await withLoading('export', async () => {
        const { rows } = await adminExportSessions({ data: { startDate: viewDate, endDate: viewDate, authToken } })
        const blob = new Blob([buildAttendanceCsv(rows)], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `inout-${viewDate}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
    } catch (e) {
      fail(e, 'Export failed.')
    }
  }

  const handleLink = async (entryId: number, staffId: number) => {
    setLinkingId(entryId)
    try {
      await adminLinkRosterEntry({ data: { entryId, staffId, authToken } })
      const who = staff.find((s) => s.id === staffId)
      ok(`Linked to ${who?.name ?? 'the staff profile'}.`)
      await refresh()
    } catch (e) {
      fail(e, 'Could not link this name.')
    } finally {
      setLinkingId(null)
    }
  }

  const handleQrGenerate = async (qrDate: string) => {
    const { default: QRCode } = await import('qrcode')
    const { token } = await getQrTokenOrSeed({ data: { date: qrDate } })
    return QRCode.toDataURL(`${window.location.origin}/?token=${token}`, { width: 448, margin: 1 })
  }

  if (dataLoading && !data) {
    return (
      <Page>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={3} />
        </div>
        <PanelSkeleton rows={6} />
      </Page>
    )
  }
  if (error && !data) return <Page><LoadError title="Could not load the roster" message={error} onRetry={retry} /></Page>
  if (!data) return null

  return (
    <Page>
      {notice ? <Notice message={notice.text} tone={notice.tone} onClose={() => setNotice(null)} /> : null}

      <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
        <RotaStaffSection
          onUpload={handleUpload}
          onAdd={handleAddStaff}
          addLoading={loading['addStaff'] ?? false}
          date={viewDate}
          today={today}
          lastUpload={lastUpload}
        />
        <QrSection viewDate={viewDate} onGenerate={handleQrGenerate} />
      </div>

      <LinkStaffPanel key={viewDate} unlinked={unlinked} staff={staff} onLink={handleLink} linkingId={linkingId} />

      <RosterSection
        entries={data.entries}
        loading={loading}
        viewDate={viewDate}
        isToday={viewDate === today}
        onCheckout={handleManualCheckout}
        onUpdate={handleUpdateEntry}
        onDelete={handleDeleteEntry}
        onAutoCheckout={handleAutoCheckout}
        onExport={handleExport}
        onDetails={setDetails}
      />
      <WeeklyRollupSection viewDate={viewDate} authToken={authToken} />

      <EvidenceDialog
        subject={details}
        onClose={() => setDetails(null)}
        onAccepted={(sessionId, note) => patch((d) => acceptInDashboard(d, sessionId, note))}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Page>
  )
}

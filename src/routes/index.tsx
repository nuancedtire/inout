import { useState, useEffect } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { getTodayRoster } from '#/utils/rotas.functions'
import { checkIn, checkOut, getStatus, undoLastAction, manualCheckIn } from '#/utils/sessions.functions'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { IdentityBar } from '#/components/IdentityBar'
import { SlideToAction } from '#/components/SlideToAction'
import { useStaffIdentity } from '#/routes/-hooks'
import { Logo } from '#/components/Logo'
import { IdentityPickerModal } from '#/components/IdentityPickerModal'
import { Undo2, UserPlus, X, ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ErrorFallback,
  notFoundComponent: () => <NotFound />,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) || '' }),
  loader: async () => {
    return getTodayRoster()
  },
})

function NotFound() {
  return (
    <main className="max-w-md mx-auto p-6">
      <EmptyState
        title="Page not found"
        description="This staff check-in page cannot be found."
        icon="alert"
      />
    </main>
  )
}

type Message = { text: string; type: 'success' | 'error' | 'info' }

// ── Main page ─────────────────────────────────────────────────────────────────

function HomePage() {
  const { rota, entries, statusByEntryId } = Route.useLoaderData()
  const { token } = Route.useSearch()
  const router = useRouter()

  const {
    staffId, showIdentityPicker,
    selectIdentity, clearIdentity,
    setShowIdentityPicker,
  } = useStaffIdentity(entries as { id: number; name: string; role: string | null }[])

  const [message, setMessage] = useState<Message | null>(null)
  const [status, setStatus] = useState<{
    checkedIn: boolean; sessionId: number | null; checkInAt: string | null; hasUndoableAction: boolean
  }>({ checkedIn: false, sessionId: null, checkInAt: null, hasUndoableAction: false })
  const [slideLoading, setSlideLoading] = useState(false)
  const [undoLoading, setUndoLoading] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualRole, setManualRole] = useState('')
  const [showManual, setShowManual] = useState(false)

  const currentStaff = entries.find((e: { id: number; name: string; role: string | null }) => e.id === staffId) ?? null

  useEffect(() => {
    const s = staffId ? statusByEntryId[staffId] : undefined
    setStatus(s ?? { checkedIn: false, sessionId: null, checkInAt: null, hasUndoableAction: false })
  }, [staffId])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  const showMessage = (text: string, type: Message['type'] = 'info') => setMessage({ text, type })

  const handleCheckIn = async () => {
    if (!staffId || !token) throw new Error('Missing identity or QR code')
    await checkIn({ data: { rosterEntryId: staffId, token } })
    showMessage('Checked in ✓', 'success')
    const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
    setStatus(newStatus)
  }

  const handleCheckOut = async () => {
    if (!staffId || !token) throw new Error('Missing identity or QR code')
    await checkOut({ data: { rosterEntryId: staffId, token } })
    showMessage('Checked out ✓', 'success')
    const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
    setStatus(newStatus)
  }

  const handleUndo = async () => {
    if (!staffId || !token) return
    setUndoLoading(true)
    try {
      const result = await undoLastAction({ data: { rosterEntryId: staffId, token } })
      showMessage(result.action === 'checkin_undone' ? 'Check-in undone' : 'Check-out undone', 'info')
      const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
      setStatus(newStatus)
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setUndoLoading(false)
    }
  }

  const handleManualCheckIn = async () => {
    if (!token) { showMessage('Scan the QR code first', 'error'); return }
    if (!manualName.trim()) { showMessage('Enter your name', 'error'); return }
    setSlideLoading(true)
    try {
      const result = await manualCheckIn({ data: { name: manualName.trim(), role: manualRole.trim() || undefined, token } })
      const newStatus = await getStatus({ data: { rosterEntryId: result.entryId } })
      setStatus(newStatus)
      selectIdentity(result.entryId)
      setManualName('')
      setManualRole('')
      setShowManual(false)
      showMessage('Checked in ✓', 'success')
      router.invalidate()
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setSlideLoading(false)
    }
  }

  if (!rota) {
    return (
      <main className="max-w-sm mx-auto p-6">
        <EmptyState title="No rota for today" description="Ask an admin to upload today's rota before you can check in." icon="calendar" />
      </main>
    )
  }

  if (!token) {
    return (
      <main className="max-w-sm mx-auto p-6">
        <EmptyState title="Scan the QR code" description="Point your device at the QR code on the notice board to check in or out." icon="scan" />
      </main>
    )
  }

  return (
    <main className="max-w-sm mx-auto px-4 pt-8 pb-10 flex flex-col gap-5 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-center gap-0 mb-2">
        <span className="text-2xl font-bold text-ink tracking-tight leading-none">In</span>
        <Logo size={38} variant="rausch" className="-mx-1" />
        <span className="text-2xl font-bold text-ink tracking-tight leading-none">Out</span>
      </div>

      {/* Identity bar */}
      <IdentityBar
        staffId={staffId}
        staffName={currentStaff?.name ?? null}
        staffRole={currentStaff?.role ?? null}
        onSelectClick={() => setShowIdentityPicker(true)}
        onClear={() => { clearIdentity(); showMessage('Identity cleared', 'info') }}
      />

      {/* Action area */}
      {staffId && (
        <div className="flex flex-col gap-3">
          <div
            className="bg-canvas rounded-2xl px-6 py-5"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Status</p>
            <p className="text-2xl font-bold text-ink mb-4">
              {status.checkedIn ? "You're inside" : "You're outside"}
            </p>
            <SlideToAction
              mode={status.checkedIn ? 'out' : 'in'}
              checkInAt={status.checkInAt}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              disabled={!token || undoLoading}
            />
          </div>

          {/* Undo */}
          {status.hasUndoableAction && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoLoading}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {undoLoading
                ? <span className="w-4 h-4 border-2 border-hairline border-t-muted rounded-full animate-spin" />
                : <Undo2 className="w-4 h-4" />}
              Undo last action
            </button>
          )}
        </div>
      )}

      {/* Locum / manual entry */}
      <button
        type="button"
        onClick={() => setShowManual(!showManual)}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary-500 hover:text-primary-600 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        Not on the rota? (locum / bank)
      </button>

      {showManual && (() => {
        const nameConflict = manualName.trim()
          ? (entries as { id: number; name: string; role: string | null }[]).some(
              (e) => e.name.toLowerCase() === manualName.trim().toLowerCase()
            )
          : false
        return (
          <div
            className="bg-canvas rounded-2xl px-6 py-5 border border-warning-200"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <p className="text-sm text-warning-700 mb-3">
              For locums, bank staff, or anyone not on today's rota. Your entry will be flagged as manual.
            </p>
            <input
              className="w-full px-4 py-3 border border-hairline rounded-xl mb-2 bg-canvas focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm transition-all"
              placeholder="Your name"
              aria-label="Your name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            {nameConflict && (
              <p className="text-xs text-warning-700 mb-2 px-1">
                Someone with this name is already on the rota. Continue only if this is a different person.
              </p>
            )}
            <input
              className="w-full px-4 py-3 border border-hairline rounded-xl mb-4 bg-canvas focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm transition-all"
              placeholder="Role (optional)"
              aria-label="Role (optional)"
              value={manualRole}
              onChange={(e) => setManualRole(e.target.value)}
            />
            <Button variant="warning" fullWidth loading={slideLoading} onClick={handleManualCheckIn}>
              Request check-in
            </Button>
          </div>
        )
      })()}

      {/* History link */}
      <Link
        to="/history"
        search={{ token }}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted hover:text-ink transition-colors"
      >
        View my history <ArrowRight className="w-4 h-4" />
      </Link>

      {/* Toast */}
      {message && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl px-4 py-3 text-sm flex items-center justify-between gap-3 shadow-lg z-50 ${
            message.type === 'success'
              ? 'bg-success-600 text-white'
              : message.type === 'error'
                ? 'bg-danger-600 text-white'
                : 'bg-ink text-white'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showIdentityPicker && (
        <IdentityPickerModal
          entries={entries}
          staffId={staffId}
          onClose={() => setShowIdentityPicker(false)}
          onSelect={selectIdentity}
          onClear={() => { clearIdentity(); showMessage('Identity cleared', 'info') }}
        />
      )}
    </main>
  )
}

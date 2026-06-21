import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getTodayRoster } from '#/utils/rotas.functions'
import { checkIn, checkOut, getStatus, undoLastAction, manualCheckIn } from '#/utils/sessions.functions'
import { formatDateTime, relativeTime } from '#/utils/dateTime'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { Card } from '#/components/Card'
import { Badge } from '#/components/Badge'
import { IdentityBar } from '#/components/IdentityBar'
import SlideButton from '#/components/SlideButton'
import { useStaffIdentity } from '#/routes/-hooks'
import { Undo2, UserPlus, Users, Clock, X, Lock, User } from 'lucide-react'

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

function HomePage() {
  const { rota, entries } = Route.useLoaderData()
  const { token } = Route.useSearch()

  const {
    staffId, isLocked, showPinEntry, showIdentityPicker,
    selectIdentity, clearIdentity, lockIdentity, unlockIdentity,
    setShowPinEntry, setShowIdentityPicker,
  } = useStaffIdentity(entries as { id: number; name: string; role: string | null }[])

  const [message, setMessage] = useState<Message | null>(null)
  const [status, setStatus] = useState<{
    checkedIn: boolean; sessionId: number | null; checkInAt: string | null
  }>({ checkedIn: false, sessionId: null, checkInAt: null })
  const [slideLoading, setSlideLoading] = useState(false)
  const [undoLoading, setUndoLoading] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualRole, setManualRole] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinMode, setPinMode] = useState<'lock' | 'unlock'>('unlock')
  const [pinError, setPinError] = useState('')

  const currentStaff = entries.find((e) => e.id === staffId) ?? null

  // Load status when staffId or token changes
  useEffect(() => {
    if (staffId) {
      getStatus({ data: { rosterEntryId: staffId } })
        .then((s) =>
          setStatus({ ...s }),
        )
        .catch((e) => {
          showMessage(e instanceof Error ? e.message : 'Failed to load status', 'error')
        })
    } else {
      setStatus({ checkedIn: false, sessionId: null, checkInAt: null })
    }
  }, [staffId])

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  const showMessage = (text: string, type: Message['type'] = 'info') => {
    setMessage({ text, type })
  }

  // ── Slide action ──────────────────────────────────────────────

  const handleSlideComplete = async () => {
    if (!staffId || !token) {
      throw new Error('Missing identity or QR code')
    }

    if (status.checkedIn) {
      await checkOut({ data: { rosterEntryId: staffId, token } })
      showMessage('Checked out ✓', 'success')
    } else {
      await checkIn({ data: { rosterEntryId: staffId, token } })
      showMessage('Checked in ✓', 'success')
    }

    const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
    setStatus({ ...newStatus, checkInAt: null })
  }

  // ── Undo ──────────────────────────────────────────────────────

  const handleUndo = async () => {
    if (!staffId || !token) return
    setUndoLoading(true)
    try {
      const result = await undoLastAction({ data: { rosterEntryId: staffId, token } })
      showMessage(
        result.action === 'checkin_undone' ? 'Check-in undone' : 'Check-out undone',
        'info',
      )
      const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
      setStatus({ ...newStatus, checkInAt: null })
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setUndoLoading(false)
    }
  }

  // ── Manual / locum check-in ───────────────────────────────────

  const handleManualCheckIn = async () => {
    if (!token) { showMessage('Scan the QR code first', 'error'); return }
    if (!manualName.trim()) { showMessage('Enter your name', 'error'); return }
    setSlideLoading(true)
    try {
      await manualCheckIn({
        data: { name: manualName.trim(), role: manualRole.trim() || undefined, token },
      })
      showMessage('Checked in (manual entry)', 'success')
      setManualName('')
      setManualRole('')
      setShowManual(false)
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setSlideLoading(false)
    }
  }

  // ── PIN modal handlers ────────────────────────────────────────

  const openPinForLock = () => { setPinMode('lock'); setPinInput(''); setPinError(''); setShowPinEntry(true) }
  const openPinForUnlock = () => { setPinMode('unlock'); setPinInput(''); setPinError(''); setShowPinEntry(true) }

  const handlePinSubmit = () => {
    if (pinMode === 'lock') {
      if (lockIdentity(pinInput)) {
        setShowPinEntry(false)
        showMessage('Identity locked 🔒', 'info')
      } else {
        setPinError('Enter a 4-digit PIN')
      }
    } else {
      if (unlockIdentity(pinInput)) {
        setShowPinEntry(false)
        showMessage('Identity unlocked', 'info')
      } else {
        setPinError('Wrong PIN')
      }
    }
  }

  // ── No rota state ─────────────────────────────────────────────

  if (!rota) {
    return (
      <main className="max-w-md mx-auto p-6">
        <EmptyState
          title="No rota for today"
          description="Ask an admin to upload today's rota before you can check in."
          icon="calendar"
        />
      </main>
    )
  }

  // ── No token state ────────────────────────────────────────────

  if (!token) {
    return (
      <main className="max-w-md mx-auto p-6">
        <EmptyState
          title="Scan the QR code"
          description="Point your device at the QR code on the notice board to check in or out."
          icon="scan"
        />
      </main>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────

  return (
    <main className="max-w-md mx-auto p-4 sm:p-6 flex flex-col gap-5 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 pt-4">
        <Users className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-neutral-900">In &amp; Out</h1>
      </div>

      {/* Identity bar */}
      <IdentityBar
        staffId={staffId}
        staffName={currentStaff?.name ?? null}
        staffRole={currentStaff?.role ?? null}
        isLocked={isLocked}
        onSelectClick={() => setShowIdentityPicker(true)}
        onClear={isLocked ? openPinForUnlock : () => { clearIdentity(); showMessage('Identity cleared', 'info') }}
      />

      {/* ── Slide action area ─────────────────────────────────── */}
      {staffId && (
        <Card className="overflow-visible">
          {/* Status */}
          <div className="flex items-center justify-center mb-4">
            {status.checkedIn ? (
              <div className="flex flex-col items-center gap-1">
                <Badge variant="success">Currently checked in</Badge>
                {status.checkInAt && (
                  <div
                    className="flex items-center gap-1 text-sm text-neutral-500"
                    title={formatDateTime(status.checkInAt)}
                  >
                    <Clock className="w-4 h-4" />
                    {relativeTime(status.checkInAt)}
                  </div>
                )}
              </div>
            ) : (
              <Badge variant="neutral">Not checked in</Badge>
            )}
          </div>

          {/* Slide button */}
          <div className="mb-3">
            <SlideButton
              variant={status.checkedIn ? 'danger' : 'success'}
              label={status.checkedIn ? 'slide to check out' : 'slide to check in'}
              loading={slideLoading}
              disabled={!token}
              onComplete={async () => {
                setSlideLoading(true)
                try {
                  await handleSlideComplete()
                } finally {
                  setSlideLoading(false)
                }
              }}
            />
          </div>

          {/* Undo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoLoading}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-sm
              text-neutral-500 hover:text-neutral-700
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            {undoLoading ? (
              <span className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            Undo last action
          </button>
        </Card>
      )}

      {/* Lock identity prompt (when identity selected but not locked) */}
      {staffId && !isLocked && (
        <button
          type="button"
          onClick={openPinForLock}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm
            text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          Lock your identity with a PIN
        </button>
      )}

      {/* Locum / manual entry */}
      <div>
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm
            text-primary-600 hover:text-primary-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Not on the rota? (locum / bank)
        </button>
      </div>

      {showManual && (
        <Card className="bg-warning-50 border-warning-200">
          <p className="text-sm text-warning-800 mb-3">
            For locums, bank staff, or anyone not on today's uploaded rota.
            Your entry will be flagged as manual.
          </p>
          <input
            className="w-full p-3 border border-warning-300 rounded-lg mb-2 bg-white
              focus:border-warning-500 focus:ring-2 focus:ring-warning-200
              placeholder:text-neutral-400 text-sm"
            placeholder="Your name"
            aria-label="Your name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <input
            className="w-full p-3 border border-warning-300 rounded-lg mb-3 bg-white
              focus:border-warning-500 focus:ring-2 focus:ring-warning-200
              placeholder:text-neutral-400 text-sm"
            placeholder="Role (optional)"
            aria-label="Role (optional)"
            value={manualRole}
            onChange={(e) => setManualRole(e.target.value)}
          />
          <Button
            variant="warning"
            fullWidth
            loading={slideLoading}
            onClick={handleManualCheckIn}
          >
            Request check-in
          </Button>
        </Card>
      )}

      {/* View history link */}
      <div>
        <Link
          to="/history"
          search={{ token }}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm
            text-primary-600 hover:text-primary-700 transition-colors"
        >
          View my history &rarr;
        </Link>
      </div>

      {/* Message toast */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-success-100 text-success-800 border border-success-200'
              : message.type === 'error'
                ? 'bg-danger-100 text-danger-800 border border-danger-200'
                : 'bg-warning-100 text-warning-800 border border-warning-200'
          }`}
        >
          <div className="flex justify-between items-start gap-2">
            <span>{message.text}</span>
            <button
              type="button"
              className="font-bold opacity-60 hover:opacity-100 shrink-0"
              aria-label="Dismiss"
              onClick={() => setMessage(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Identity picker modal ─────────────────────────────── */}
      {showIdentityPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="identity-picker-title"
          onClick={() => setShowIdentityPicker(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm
              max-h-[70vh] overflow-hidden shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-neutral-300" />
            </div>

            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 id="identity-picker-title" className="text-lg font-semibold text-neutral-900">Who are you?</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowIdentityPicker(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { selectIdentity(entry.id); setShowIdentityPicker(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left
                    hover:bg-neutral-50 transition-colors border-b border-neutral-50
                    ${entry.id === staffId ? 'bg-primary-50' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600
                    flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {entry.name}
                    </p>
                    {entry.role && (
                      <p className="text-xs text-neutral-500">{entry.role}</p>
                    )}
                  </div>
                  {entry.id === staffId && (
                    <Badge variant="info">You</Badge>
                  )}
                </button>
              ))}
            </div>

            {staffId && (
              <div className="px-4 py-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowIdentityPicker(false)
                    if (isLocked) openPinForUnlock()
                    else { clearIdentity(); showMessage('Identity cleared', 'info') }
                  }}
                  className="w-full text-sm text-neutral-500 hover:text-danger-600 py-1.5 transition-colors"
                >
                  Clear my identity
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PIN entry modal ────────────────────────────────────── */}
      {showPinEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-modal-title"
          onClick={() => setShowPinEntry(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl w-full max-w-xs mx-4 shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-primary-600" />
              <h2 id="pin-modal-title" className="text-lg font-semibold text-neutral-900">
                {pinMode === 'lock' ? 'Lock identity' : 'Unlock identity'}
              </h2>
            </div>

            <p className="text-sm text-neutral-500 mb-4">
              {pinMode === 'lock'
                ? 'Set a 4-digit PIN to prevent others from checking in as you.'
                : 'Enter your PIN to change your identity.'}
            </p>

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit() }}
              className="w-full p-3 border border-neutral-300 rounded-lg text-center text-2xl tracking-widest
                focus:border-primary-500 focus:ring-2 focus:ring-primary-200 mb-3
                placeholder:text-neutral-300"
              autoFocus
            />

            {pinError && (
              <p className="text-sm text-danger-600 mb-3">{pinError}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setShowPinEntry(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                disabled={pinInput.length !== 4}
                onClick={handlePinSubmit}
              >
                {pinMode === 'lock' ? 'Lock' : 'Unlock'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

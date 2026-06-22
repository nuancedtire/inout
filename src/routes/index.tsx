import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getTodayRoster } from '#/utils/rotas.functions'
import { checkIn, checkOut, getStatus, undoLastAction, manualCheckIn } from '#/utils/sessions.functions'
import { formatDateTime, relativeTime } from '#/utils/dateTime'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { Badge } from '#/components/Badge'
import { IdentityBar } from '#/components/IdentityBar'
import SlideButton from '#/components/SlideButton'
import { useStaffIdentity } from '#/routes/-hooks'
import { Logo } from '#/components/Logo'
import { Undo2, UserPlus, X, User, Clock, Building2, LogOut, ChevronRight } from 'lucide-react'

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

// ── Swipe-out card shown when checked in ──────────────────────────────────────
function SwipeOutCard({
  checkInAt,
  onCheckout,
  loading,
}: {
  checkInAt: string | null
  onCheckout: () => Promise<void>
  loading: boolean
}) {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const startXRef = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const THRESHOLD = 0.45

  const progress = cardRef.current
    ? Math.min(1, offset / (cardRef.current.offsetWidth * THRESHOLD))
    : 0

  const handlePointerDown = (e: React.PointerEvent) => {
    if (loading) return
    startXRef.current = e.clientX
    setIsDragging(true)
    setIsAnimating(false)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || startXRef.current === null) return
    const dx = Math.max(0, e.clientX - startXRef.current)
    setOffset(dx)
  }

  const handlePointerUp = async () => {
    if (!isDragging || startXRef.current === null) return
    setIsDragging(false)
    startXRef.current = null

    const cardWidth = cardRef.current?.offsetWidth ?? 340
    if (offset >= cardWidth * THRESHOLD) {
      setIsAnimating(true)
      setOffset(cardWidth * 1.5)
      await new Promise((r) => setTimeout(r, 350))
      await onCheckout()
    } else {
      setIsAnimating(true)
      setOffset(0)
      setTimeout(() => setIsAnimating(false), 400)
    }
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Reveal layer — checkout CTA exposed as card slides away */}
      <div
        className="absolute inset-0 rounded-2xl flex items-center justify-end pr-8"
        style={{ background: '#ff385c14' }}
      >
        <div className="flex flex-col items-center gap-1.5" style={{ color: '#ff385c', opacity: 0.4 + progress * 0.6 }}>
          <LogOut className="w-7 h-7" />
          <span className="text-xs font-bold tracking-wide uppercase">Check out</span>
        </div>
      </div>

      {/* Draggable card */}
      <div
        ref={cardRef}
        className="relative rounded-2xl bg-canvas cursor-grab active:cursor-grabbing select-none touch-none"
        style={{
          transform: `translateX(${offset}px)`,
          transition: isAnimating ? 'transform 0.35s cubic-bezier(0.2,0,0,1)' : 'none',
          boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.08) 0 4px 8px 0',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex items-stretch overflow-hidden rounded-2xl">
          <div className="flex-1 px-6 py-5 min-w-0">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Status</p>
            <p className="text-2xl font-bold text-ink mt-1">You're inside</p>
            {checkInAt && (
              <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span title={formatDateTime(checkInAt)}>Since {relativeTime(checkInAt)}</span>
              </p>
            )}
            <p className="text-xs text-muted mt-3 flex items-center gap-1 opacity-50">
              Swipe right to check out
              <ChevronRight className="w-3 h-3" />
            </p>
          </div>
          <div className="w-20 flex items-center justify-center shrink-0" style={{ background: '#16a34a18' }}>
            {loading ? (
              <span className="w-6 h-6 rounded-full border-2 border-success-400 border-t-transparent animate-spin" />
            ) : (
              <Building2 className="w-8 h-8 text-success-600" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function HomePage() {
  const { rota, entries } = Route.useLoaderData()
  const { token } = Route.useSearch()

  const {
    staffId, showIdentityPicker,
    selectIdentity, clearIdentity,
    setShowIdentityPicker,
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

  const currentStaff = entries.find((e: { id: number; name: string; role: string | null }) => e.id === staffId) ?? null

  useEffect(() => {
    if (staffId) {
      getStatus({ data: { rosterEntryId: staffId } })
        .then((s) => setStatus({ ...s, checkInAt: null }))
        .catch((e) => showMessage(e instanceof Error ? e.message : 'Failed to load status', 'error'))
    } else {
      setStatus({ checkedIn: false, sessionId: null, checkInAt: null })
    }
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
    setStatus({ ...newStatus, checkInAt: null })
  }

  const handleCheckOut = async () => {
    if (!staffId || !token) throw new Error('Missing identity or QR code')
    setSlideLoading(true)
    try {
      await checkOut({ data: { rosterEntryId: staffId, token } })
      showMessage('Checked out ✓', 'success')
      const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
      setStatus({ ...newStatus, checkInAt: null })
    } finally {
      setSlideLoading(false)
    }
  }

  const handleUndo = async () => {
    if (!staffId || !token) return
    setUndoLoading(true)
    try {
      const result = await undoLastAction({ data: { rosterEntryId: staffId, token } })
      showMessage(result.action === 'checkin_undone' ? 'Check-in undone' : 'Check-out undone', 'info')
      const newStatus = await getStatus({ data: { rosterEntryId: staffId } })
      setStatus({ ...newStatus, checkInAt: null })
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
      await manualCheckIn({ data: { name: manualName.trim(), role: manualRole.trim() || undefined, token } })
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
      <div className="flex items-center gap-0 mb-2">
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
          {status.checkedIn ? (
            /* ── Checked in: swipe-out card ── */
            <SwipeOutCard
              checkInAt={status.checkInAt}
              onCheckout={handleCheckOut}
              loading={slideLoading}
            />
          ) : (
            /* ── Not checked in: slide-in button ── */
            <div
              className="bg-canvas rounded-2xl px-6 py-5"
              style={{ boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.08) 0 4px 8px 0' }}
            >
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Status</p>
              <p className="text-2xl font-bold text-ink mb-4">You're outside</p>
              <SlideButton
                variant="success"
                label="slide to check in"
                loading={slideLoading}
                disabled={!token}
                onComplete={async () => {
                  setSlideLoading(true)
                  try { await handleCheckIn() } finally { setSlideLoading(false) }
                }}
              />
            </div>
          )}

          {/* Undo */}
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

      {showManual && (
        <div
          className="bg-canvas rounded-2xl px-6 py-5 border border-warning-200"
          style={{ boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.08) 0 4px 8px 0' }}
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
      )}

      {/* History link */}
      <Link
        to="/history"
        search={{ token }}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted hover:text-ink transition-colors"
      >
        View my history →
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

      {/* Identity picker modal */}
      {showIdentityPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="identity-picker-title"
          onClick={() => setShowIdentityPicker(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-canvas rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[75vh] overflow-hidden shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-hairline" />
            </div>
            <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
              <h2 id="identity-picker-title" className="text-base font-semibold text-ink">Who are you?</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowIdentityPicker(false)}
                className="p-1.5 rounded-full hover:bg-surface-soft text-muted hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh]">
              {entries.map((entry: { id: number; name: string; role: string | null }) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { selectIdentity(entry.id); setShowIdentityPicker(false) }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-soft transition-colors border-b border-hairline-soft last:border-0 ${entry.id === staffId ? 'bg-primary-50' : ''}`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                    style={{ background: '#ff385c18', color: '#ff385c' }}
                  >
                    {entry.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{entry.name}</p>
                    {entry.role && <p className="text-xs text-muted">{entry.role}</p>}
                  </div>
                  {entry.id === staffId && <Badge variant="info">You</Badge>}
                </button>
              ))}
            </div>
            {staffId && (
              <div className="px-5 py-4 border-t border-hairline space-y-2">
                <button
                  type="button"
                  onClick={() => { setShowIdentityPicker(false); clearIdentity(); showMessage('Identity cleared', 'info') }}
                  className="w-full text-sm text-muted hover:text-danger-600 py-1.5 transition-colors"
                >
                  Clear my identity
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

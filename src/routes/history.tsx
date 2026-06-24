import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getTodayRoster } from '#/utils/rotas.functions'
import { getStaffHistory } from '#/utils/sessions.functions'
import { formatDateTime } from '#/utils/dateTime'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Card } from '#/components/Card'
import { Badge } from '#/components/Badge'
import { IdentityBar } from '#/components/IdentityBar'
import { useStaffIdentity } from '#/routes/-hooks'
import { Clock, User, ArrowLeft } from 'lucide-react'
import { IdentityPickerModal } from '#/components/IdentityPickerModal'
type SessionRow = {
  date: string
  shift_start: string | null
  shift_end: string | null
  check_in_at: string
  check_out_at: string
  hours: number | null
}

export const Route = createFileRoute('/history')({
  component: HistoryPage,
  errorComponent: ErrorFallback,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) || '' }),
  loader: async () => {
    return getTodayRoster()
  },
})

function HistoryPage() {
  const { entries } = Route.useLoaderData()
  const { token } = Route.useSearch()

  const {
    staffId, showIdentityPicker,
    selectIdentity, clearIdentity,
    setShowIdentityPicker,
  } = useStaffIdentity(entries as { id: number; name: string; role: string | null }[])

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const currentStaff = entries.find((e: { id: number; name: string; role: string | null }) => e.id === staffId) ?? null

  useEffect(() => {
    if (staffId && token) {
      setLoading(true)
      setLoadError(null)
      getStaffHistory({ data: { rosterEntryId: staffId, token } })
        .then((r) => setSessions(r.rows))
        .catch((e) => {
          setLoadError(e instanceof Error ? e.message : 'Failed to load history')
          setSessions([])
        })
        .finally(() => setLoading(false))
    }
  }, [staffId, token])

  // ── No token state ────────────────────────────────────────────

  if (!token) {
    return (
      <main className="max-w-md mx-auto p-6">
        <EmptyState
          title="Scan the QR code"
          description="Scan the daily QR code on the notice board to view your check-in history."
          icon="scan"
        />
        <div className="mt-4 text-center">
          <Link
            to="/"
            search={{ token: '' }}
            className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
          >
            &larr; Back to check-in
          </Link>
        </div>
      </main>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────

  return (
    <main className="max-w-md mx-auto p-4 sm:p-6 flex flex-col gap-5 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 pt-4">
        <Link
          to="/"
          search={{ token }}
          className="p-1 -ml-1 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Clock className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-neutral-900">Your History</h1>
      </div>

      {/* Identity bar */}
      <IdentityBar
        staffId={staffId}
        staffName={currentStaff?.name ?? null}
        staffRole={currentStaff?.role ?? null}
        onSelectClick={() => setShowIdentityPicker(true)}
        onClear={() => clearIdentity()}
      />

      {/* No staff selected prompt */}
      {!staffId && (
        <EmptyState
          title="Select your name"
          description="Tap your name above to view your check-in history."
          icon={<User className="w-6 h-6" />}
        />
      )}

      {/* Session history */}
      {staffId && (
        <>
          {loadError && (
            <div className="p-3 rounded-lg text-sm bg-danger-100 text-danger-800 border border-danger-200">
              {loadError}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-neutral-500 text-sm">Loading...</div>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No sessions found"
              description="Your check-in history will appear here once you've checked in and out."
              icon="calendar"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map((s, i) => {
                const dateLabel = (() => {
                  try {
                    return new Intl.DateTimeFormat('en-GB', {
                      timeZone: 'Europe/London',
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(s.date + 'T00:00:00'))
                  } catch {
                    return s.date
                  }
                })()

                const shiftLabel = s.shift_start && s.shift_end
                  ? `${s.shift_start.slice(0, 5)}–${s.shift_end.slice(0, 5)}`
                  : s.shift_start
                    ? s.shift_start.slice(0, 5)
                    : '–'

                const hoursLabel = s.hours != null
                  ? `${Number(s.hours).toFixed(2)}h`
                  : '–'

                return (
                  <Card key={i}>
                    <div className="flex flex-col gap-2">
                      {/* Date + hours */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-800">
                          {dateLabel}
                        </span>
                        <Badge variant="info">{hoursLabel}</Badge>
                      </div>

                      {/* Shift */}
                      <div className="text-xs text-neutral-500">
                        Shift: {shiftLabel}
                      </div>

                      {/* Times */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500">
                        <div>
                          <span className="text-neutral-400">In: </span>
                          {formatDateTime(s.check_in_at)}
                        </div>
                        <div>
                          <span className="text-neutral-400">Out: </span>
                          {formatDateTime(s.check_out_at)}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {showIdentityPicker && (
        <IdentityPickerModal
          entries={entries}
          staffId={staffId}
          onClose={() => setShowIdentityPicker(false)}
          onSelect={selectIdentity}
          onClear={clearIdentity}
          onReset={() => { localStorage.clear(); window.location.reload() }}
        />
      )}

    </main>
  )
}

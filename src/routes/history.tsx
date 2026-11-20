import { useState, useEffect } from 'react'
import { readStoredToken, storeToken } from '#/lib/checkinStorage'
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
import { User, ArrowLeft, AlertCircle } from 'lucide-react'
import { WorkingIndicator } from '#/components/brand/WorkingIndicator'
import { RunnerMark } from '#/components/brand/RunnerMark'
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
  const { entries, rota } = Route.useLoaderData()
  const { token: searchToken } = Route.useSearch()
  // Keep the daily code out of the address bar: read it once, keep it for this tab only.
  const [token, setToken] = useState(searchToken)
  const [tokenResolved, setTokenResolved] = useState(false)
  useEffect(() => {
    if (!rota) return
    const t = searchToken || readStoredToken(rota.date) || ''
    if (searchToken) {
      storeToken(rota.date, searchToken)
      window.history.replaceState(window.history.state, '', '/history')
    }
    setToken(t)
    setTokenResolved(true)
  }, [searchToken, rota])

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

  if (!token && rota && !tokenResolved) {
    return (
      <main className="min-h-svh bg-surface-soft px-4 py-12 pt-safe">
        <div className="mx-auto flex max-w-md justify-center pt-16">
          <WorkingIndicator label="Loading…" size={56} />
        </div>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="min-h-svh bg-surface-soft px-4 py-12 pt-safe">
        <div className="mx-auto max-w-md">
          <EmptyState
            title="Scan the QR code"
            description="Scan the daily QR code on the notice board to view your check-in history."
            icon="scan"
          >
            <Link
              to="/"
              search={{ token: '' }}
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold text-accent-accessible hover:bg-primary-50"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to check-in
            </Link>
          </EmptyState>
        </div>
      </main>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────

  return (
    <main className="min-h-svh bg-surface-soft">
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-safe">
      {/* Header */}
      <header className="flex items-center gap-2 pt-2">
        <Link
          to="/"
          search={{ token: '' }}
          aria-label="Back to check-in"
          className="ui-press -ml-2 flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-strong"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight text-ink">Session history</h1>
          <p className="text-sm text-muted">Completed sessions for the selected name</p>
        </div>
        <RunnerMark size={36} animate="ambient" />
      </header>

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
            <div role="alert" className="flex items-start gap-3 rounded-control border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{loadError}</p>
            </div>
          )}
          {loading ? (
            <WorkingIndicator label="Loading history…" size={56} className="py-10" />
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No sessions found"
              description="Your check-in history will appear here once you've checked in and out."
              icon="calendar"
            />
          ) : (
            <ol className="flex flex-col gap-3">
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
                  <li key={i} className="animate-reveal" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{dateLabel}</p>
                          <p className="mt-0.5 text-sm text-muted">Shift {shiftLabel}</p>
                        </div>
                        <Badge variant="neutral">{hoursLabel}</Badge>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline-soft pt-4 text-sm">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted">In</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-ink">{formatDateTime(s.check_in_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Out</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-ink">{formatDateTime(s.check_out_at)}</dd>
                        </div>
                      </dl>
                    </Card>
                  </li>
                )
              })}
            </ol>
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
      </div>
    </main>
  )
}

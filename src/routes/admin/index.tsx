import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAdminContext } from '#/routes/admin/-context'
import { adminGetDashboard } from '#/utils/sessions.functions'
import { DailySummary } from '#/routes/admin/-components/DailySummary'
import { WhoIsInSection, type PresentStaff } from '#/routes/admin/-components/WhoIsInSection'
import type { RosterEntryWithStatus, SessionRow } from '#/routes/admin/-types'
import type { AuditEventItem } from '#/routes/admin/-components/AuditEvent'
import { CalendarDays, LogIn, Building2 } from 'lucide-react'
import { parseShiftTime } from '#/utils/dateTime'

type DashboardData = {
  entries: RosterEntryWithStatus[]
  present: PresentStaff[]
  sessions: SessionRow[]
  audit: AuditEventItem[]
}

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  progress,
}: {
  icon: React.ElementType
  label: string
  value: number
  sub: string
  accent: string
  progress?: number
}) {
  return (
    <div
      className="bg-canvas rounded-2xl overflow-hidden flex items-stretch"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex-1 px-6 py-5 min-w-0">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-ink leading-none mt-1">{value}</p>
        <p className="text-xs text-muted mt-1">{sub}</p>
        {progress !== undefined && (
          <div className="h-1 bg-surface-strong rounded-full overflow-hidden mt-3">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: accent }}
            />
          </div>
        )}
      </div>
      <div
        className="w-20 flex items-center justify-center shrink-0"
        style={{ background: accent + '18' }}
      >
        <Icon className="w-8 h-8" style={{ color: accent }} />
      </div>
    </div>
  )
}

function AdminDashboard() {
  const { authToken, viewDate, today } = useAdminContext()
  const [entries, setEntries] = useState<RosterEntryWithStatus[]>([])
  const [present, setPresent] = useState<PresentStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminGetDashboard({ data: { date: viewDate, authToken } })
      .then((d) => {
        if (!cancelled) {
          const data = d as DashboardData
          setEntries(data.entries ?? [])
          setPresent(data.present ?? [])
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [viewDate, authToken])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 bg-canvas rounded-2xl" />
          ))}
        </div>
        <div className="h-48 bg-canvas rounded-2xl" />
        <div className="h-48 bg-canvas rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-5 bg-danger-50 text-danger-800 rounded-2xl border border-danger-100">
        <p className="font-semibold">Failed to load dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  const checkedInCount = entries.filter((e) => e.checkInAt).length
  const stillInCount = present.length
  const checkedInPct = entries.length > 0 ? Math.round((checkedInCount / entries.length) * 100) : 0
  const stillInPct = entries.length > 0 ? Math.round((stillInCount / entries.length) * 100) : 0

  const now = new Date()
  const isToday = viewDate === today

  const missingCheckIn = isToday
    ? entries.filter(
        (e) => !e.checkInAt && (!e.shift_start || (parseShiftTime(viewDate, e.shift_start)?.getTime() ?? 0) < now.getTime()),
      )
    : []

  const missingCheckOut = isToday
    ? entries.filter(
        (e) => e.checkInAt && !e.checkOutAt && e.shift_end && (parseShiftTime(viewDate, e.shift_end)?.getTime() ?? Infinity) < now.getTime(),
      )
    : []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={CalendarDays}
          label="On rota"
          value={entries.length}
          sub="staff scheduled today"
          accent="#6a6a6a"
        />
        <StatCard
          icon={LogIn}
          label="Checked in"
          value={checkedInCount}
          sub={`${entries.length - checkedInCount} yet to arrive`}
          accent="#16a34a"
          progress={checkedInPct}
        />
        <StatCard
          icon={Building2}
          label="Currently in"
          value={stillInCount}
          sub={`${checkedInCount - stillInCount} have checked out`}
          accent="#ff385c"
          progress={stillInPct}
        />
      </div>

      <DailySummary
        missingCheckIn={missingCheckIn}
        missingCheckOut={missingCheckOut}
        entries={entries}
        viewDate={viewDate}
      />
      <WhoIsInSection present={present} />
    </div>
  )
}

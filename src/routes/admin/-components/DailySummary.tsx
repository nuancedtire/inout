import type { RosterEntryWithStatus } from '#/routes/admin/-types'
import { formatTime, parseShiftTime } from '#/utils/dateTime'
import { AlertCircle, Clock, UserX, Timer } from 'lucide-react'

const LATE_THRESHOLD_MS = 15 * 60 * 1000

type StatusCellProps = {
  icon: React.ElementType
  title: string
  count: number
  emptyMsg: string
  items: { id: number; name: string; role?: string | null; detail?: string }[]
  accentColor: string
  bgColor: string
}

function StatusCell({ icon: Icon, title, count, emptyMsg, items, accentColor, bgColor }: StatusCellProps) {
  return (
    <div className="p-4 rounded-2xl flex flex-col gap-3" style={{ background: bgColor }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
          <span className="text-sm font-semibold" style={{ color: accentColor }}>{title}</span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
          style={{ background: accentColor }}
        >
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((p) => (
            <li key={p.id} className="text-xs">
              <span className="font-medium text-ink">{p.name}</span>
              {p.role && <span className="text-muted"> · {p.role}</span>}
              {p.detail && <span className="text-muted block">{p.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DailySummary({
  missingCheckIn,
  missingCheckOut,
  entries,
  viewDate,
}: {
  missingCheckIn: RosterEntryWithStatus[]
  missingCheckOut: RosterEntryWithStatus[]
  entries: RosterEntryWithStatus[]
  viewDate: string
}) {
  const lateArrivals = entries.filter((e) => {
    if (!e.checkInAt || !e.shift_start) return false
    const shiftStart = parseShiftTime(viewDate, e.shift_start)
    if (!shiftStart) return false
    return new Date(e.checkInAt).getTime() - shiftStart.getTime() > LATE_THRESHOLD_MS
  })

  const earlyDepartures = entries.filter((e) => {
    if (!e.checkOutAt || !e.shift_end) return false
    const shiftEnd = parseShiftTime(viewDate, e.shift_end)
    if (!shiftEnd) return false
    return shiftEnd.getTime() - new Date(e.checkOutAt).getTime() > LATE_THRESHOLD_MS
  })

  return (
    <div
      className="bg-canvas rounded-2xl p-5"
      style={{ boxShadow: 'var(--shadow-card)' }}
      data-tour="daily-summary"
    >
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold text-ink">Daily summary</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCell
          icon={AlertCircle}
          title="Missing check-in"
          count={missingCheckIn.length}
          emptyMsg="Everyone has checked in."
          items={missingCheckIn.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.shift_start ? `shift ${p.shift_start}` : undefined,
          }))}
          accentColor="#dc2626"
          bgColor="#fef2f2"
        />
        <StatusCell
          icon={Clock}
          title="Missing check-out"
          count={missingCheckOut.length}
          emptyMsg="No one is overdue."
          items={missingCheckOut.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkInAt ? `in at ${formatTime(p.checkInAt)}` : undefined,
          }))}
          accentColor="#d97706"
          bgColor="#fffbeb"
        />
        <StatusCell
          icon={Timer}
          title="Late arrivals"
          count={lateArrivals.length}
          emptyMsg="Everyone was on time."
          items={lateArrivals.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkInAt ? `in at ${formatTime(p.checkInAt)}` : undefined,
          }))}
          accentColor="#d97706"
          bgColor="#fffbeb"
        />
        <StatusCell
          icon={UserX}
          title="Early departures"
          count={earlyDepartures.length}
          emptyMsg="No one left early."
          items={earlyDepartures.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkOutAt ? `out at ${formatTime(p.checkOutAt)}` : undefined,
          }))}
          accentColor="#6a6a6a"
          bgColor="#f7f7f7"
        />
      </div>
    </div>
  )
}

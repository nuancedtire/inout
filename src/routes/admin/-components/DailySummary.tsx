import type { ComponentType } from 'react'
import type { RosterEntryWithStatus } from '#/routes/admin/-types'
import { formatTime, parseShiftTime } from '#/utils/dateTime'
import { cn } from '#/lib/utils'
import { AlertCircle, Clock, UserX, Timer, Check, type LucideProps } from 'lucide-react'
import { Panel } from './kit'

const LATE_THRESHOLD_MS = 15 * 60 * 1000

type Tone = 'danger' | 'warning' | 'neutral'

const TONE: Record<Tone, { icon: string; count: string }> = {
  danger: { icon: 'bg-danger-50 text-danger-700', count: 'bg-danger-600 text-white' },
  warning: { icon: 'bg-warning-50 text-warning-800', count: 'bg-warning-700 text-white' },
  neutral: { icon: 'bg-surface-strong text-body', count: 'bg-neutral-700 text-white' },
}

type StatusCellProps = {
  icon: ComponentType<LucideProps>
  title: string
  emptyMsg: string
  items: { id: number; name: string; role?: string | null; detail?: string }[]
  tone: Tone
}

function StatusCell({ icon: Icon, title, emptyMsg, items, tone }: StatusCellProps) {
  const empty = items.length === 0
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-hairline-soft p-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn('flex size-8 items-center justify-center rounded-full', empty ? 'bg-success-50 text-success-800' : TONE[tone].icon)}>
          {empty ? <Check className="size-4" /> : <Icon className="size-4" />}
        </span>
        <h3 className="flex-1 text-sm font-semibold text-ink">{title}</h3>
        <span
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums',
            empty ? 'bg-surface-strong text-muted' : TONE[tone].count,
          )}
        >
          {items.length}
        </span>
      </div>
      {empty ? (
        <p className="text-sm text-muted">{emptyMsg}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => (
            <li key={p.id} className="min-w-0 text-sm leading-snug">
              <span className="font-medium text-ink">{p.name}</span>
              {p.role && <span className="text-muted"> · {p.role}</span>}
              {p.detail && <span className="block text-xs tabular-nums text-muted">{p.detail}</span>}
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
  isToday,
}: {
  missingCheckIn: RosterEntryWithStatus[]
  missingCheckOut: RosterEntryWithStatus[]
  entries: RosterEntryWithStatus[]
  viewDate: string
  isToday: boolean
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
    <Panel
      tour="daily-summary"
      title="Daily summary"
      description={isToday ? 'Compared with each person’s rota’d shift. Late or early means more than 15 minutes out.' : 'Missing check-ins and check-outs are worked out for today only.'}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatusCell
          icon={AlertCircle}
          title="Missing check-in"
          emptyMsg={isToday ? 'Everyone due has checked in.' : 'Not tracked for past dates.'}
          items={missingCheckIn.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.shift_start ? `Shift from ${p.shift_start}` : undefined,
          }))}
          tone="danger"
        />
        <StatusCell
          icon={Clock}
          title="Missing check-out"
          emptyMsg={isToday ? 'No one is overdue.' : 'Not tracked for past dates.'}
          items={missingCheckOut.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkInAt ? `In at ${formatTime(p.checkInAt)}` : undefined,
          }))}
          tone="warning"
        />
        <StatusCell
          icon={Timer}
          title="Late arrivals"
          emptyMsg="Everyone was on time."
          items={lateArrivals.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkInAt ? `In at ${formatTime(p.checkInAt)} (shift ${p.shift_start})` : undefined,
          }))}
          tone="warning"
        />
        <StatusCell
          icon={UserX}
          title="Early departures"
          emptyMsg="No one left early."
          items={earlyDepartures.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            detail: p.checkOutAt ? `Out at ${formatTime(p.checkOutAt)} (shift to ${p.shift_end})` : undefined,
          }))}
          tone="neutral"
        />
      </div>
    </Panel>
  )
}

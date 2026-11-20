import { useState, useEffect, useMemo } from 'react'
import { CalendarRange, CircleCheck, ShieldCheck, TriangleAlert } from 'lucide-react'
import { adminWeeklyRollup } from '#/utils/sessions.functions'
import { getWeekStart, addDays, formatDate } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'
import { cn } from '#/lib/utils'
import { flagLabels } from '#/utils/verification'
import { Bone, LoadError, Panel } from './kit'

type RollupRow = Awaited<ReturnType<typeof adminWeeklyRollup>>['rows'][number]
type CellState = 'verified' | 'flagged' | 'accepted'
type Cell = { hours: number; state: CellState | null; sessions: number; flagged: number; why: string }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GLYPH: Record<CellState, { icon: typeof ShieldCheck; className: string; label: string }> = {
  verified: { icon: ShieldCheck, className: 'text-success-accessible', label: 'Verified' },
  flagged: { icon: TriangleAlert, className: 'text-warning-700', label: 'Flagged' },
  accepted: { icon: CircleCheck, className: 'text-muted', label: 'Accepted' },
}

function combine(rows: RollupRow[]): Cell {
  let hours = 0
  let flagged = 0
  let accepted = 0
  const reasons = new Set<string>()
  for (const r of rows) {
    hours += r.hours
    if (r.accepted) accepted++
    else if (!r.verified) {
      flagged++
      for (const reason of r.reasons) reasons.add(reason)
    }
  }
  const state: CellState | null = rows.length === 0 ? null : flagged ? 'flagged' : accepted ? 'accepted' : 'verified'
  return { hours, state, sessions: rows.length, flagged, why: flagLabels([...reasons] as RollupRow['reasons']) }
}

export function WeeklyRollupSection({ viewDate, authToken }: { viewDate: string; authToken: string }) {
  const [rows, setRows] = useState<RollupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const weekStart = getWeekStart(viewDate)
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminWeeklyRollup({ data: { weekStart, weekEnd, authToken } })
      .then((r) => !cancelled && setRows(r.rows))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load the weekly hours'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [weekStart, weekEnd, authToken, attempt])

  const { dates, people } = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const byName = new Map<string, RollupRow[]>()
    for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r])
    const people = [...byName.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const mine = byName.get(name)!
        return { name, days: dates.map((d) => combine(mine.filter((r) => r.date === d))), total: combine(mine) }
      })
    return { dates, people }
  }, [rows, weekStart])

  return (
    <Panel
      tour="weekly-rollup"
      title="Weekly hours"
      icon={<CalendarRange />}
      description={`${formatDate(weekStart)} to ${formatDate(weekEnd)}. Completed sessions only. Each day shows whether its sessions were verified.`}
      flush
    >
      {loading ? (
        <div className="flex flex-col gap-3 p-5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-5">
          <LoadError title="Could not load the weekly hours" message={error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      ) : people.length === 0 ? (
        <EmptyState title="No completed sessions this week" description="Hours appear here once staff check out." icon="calendar" />
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline-soft text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="sticky left-0 z-10 bg-canvas px-5 py-3 text-left font-semibold">Staff</th>
                  {dates.map((d, i) => (
                    <th key={d} scope="col" className={cn('px-2 py-3 text-center font-semibold', d === viewDate && 'text-ink')}>
                      {DAY_LABELS[i]}
                      <span className="block text-[11px] font-medium normal-case tracking-normal text-muted">{d.slice(8)}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-right font-semibold text-ink">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {people.map(({ name, days, total }) => (
                  <tr key={name} className="hover:bg-surface-soft/60">
                    <th scope="row" className="sticky left-0 z-10 bg-canvas px-5 py-2.5 text-left font-semibold text-ink">
                      {name}
                    </th>
                    {days.map((c, i) => (
                      <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums', dates[i] === viewDate && 'bg-surface-soft/70')}>
                        {c.state ? <HoursCell cell={c} /> : <span className="text-neutral-400" aria-label="No hours">–</span>}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right">
                      <span className="font-semibold tabular-nums text-ink">{total.hours.toFixed(1)}</span>
                      {total.flagged ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-warning-800" title={total.why}>
                          <TriangleAlert className="size-3" aria-hidden="true" />
                          {total.flagged}
                          <span className="sr-only"> flagged</span>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline-soft px-5 py-3 text-xs text-muted">
            {(Object.keys(GLYPH) as CellState[]).map((k) => {
              const g = GLYPH[k]
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <g.icon className={cn('size-3.5', g.className)} aria-hidden="true" />
                  {g.label}
                </span>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}

function HoursCell({ cell }: { cell: Cell }) {
  const g = GLYPH[cell.state!]
  const title = cell.state === 'flagged' ? `${cell.flagged} flagged: ${cell.why}` : g.label
  return (
    <span className="inline-flex items-center justify-center gap-1 text-ink" title={title}>
      {cell.hours.toFixed(1)}
      <g.icon role="img" className={cn('size-3.5 shrink-0', g.className)} aria-label={title} />
    </span>
  )
}

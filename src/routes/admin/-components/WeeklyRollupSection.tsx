import { useState, useEffect, useMemo } from 'react'
import { adminWeeklyRollup } from '#/utils/sessions.functions'
import { getWeekStart, addDays, formatDate } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'

type RollupRow = { name: string; date: string; hours: number }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function WeeklyRollupSection({
  viewDate,
  authToken,
}: {
  viewDate: string
  authToken: string
}) {
  const [rows, setRows] = useState<RollupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekStart = getWeekStart(viewDate)
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminWeeklyRollup({ data: { weekStart, weekEnd, authToken } })
      .then((r) => {
        if (!cancelled) setRows(r.rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load rollup')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [weekStart, weekEnd, authToken])

  const pivot = useMemo(() => {
    // Group by name, then by date
    const map = new Map<string, Map<string, number>>()
    for (const r of rows) {
      let byDate = map.get(r.name)
      if (!byDate) {
        byDate = new Map()
        map.set(r.name, byDate)
      }
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.hours)
    }
    // Build columns: Mon-Sun for this week
    const dates: string[] = []
    for (let i = 0; i < 7; i++) dates.push(addDays(weekStart, i))
    // Sorted names
    const names = [...map.keys()].sort((a, b) => a.localeCompare(b))
    // Pivot: for each name, an array of [hours per day, total]
    const cells = names.map((name) => {
      const byDate = map.get(name)!
      let total = 0
      const dayHours = dates.map((d) => {
        const h = byDate.get(d) ?? 0
        total += h
        return h
      })
      return { name, dayHours, total }
    })
    return { dates, cells }
  }, [rows, weekStart])

  if (loading) {
    return (
      <section id="weekly-rollup" data-tour="weekly-rollup" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
        <h2 className="font-semibold text-neutral-900 mb-3">Weekly hours</h2>
        <p className="text-sm text-neutral-500 animate-pulse">Loading…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section id="weekly-rollup" data-tour="weekly-rollup" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
        <h2 className="font-semibold text-neutral-900 mb-3">Weekly hours</h2>
        <p className="text-sm text-danger-600">{error}</p>
      </section>
    )
  }

  const { dates, cells } = pivot

  return (
    <section id="weekly-rollup" data-tour="weekly-rollup" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">
          Weekly hours — {formatDate(weekStart)} to {formatDate(weekEnd)}
        </h2>
      </div>
      {cells.length === 0 ? (
        <EmptyState
          title="No completed sessions this week"
          description="Check-outs for this week will appear here once staff finish their shifts."
          icon="clock"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-2 pr-4 font-medium text-neutral-600 sticky left-0 bg-white">Staff</th>
                {dates.map((d, i) => (
                  <th key={d} className="text-center py-2 px-2 font-medium text-neutral-600">
                    <span className="hidden sm:inline">{DAY_LABELS[i]}</span>
                    <span className="sm:hidden">{DAY_LABELS[i].slice(0, 1)}</span>
                  </th>
                ))}
                <th className="text-center py-2 pl-4 font-semibold text-neutral-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {cells.map(({ name, dayHours, total }) => (
                <tr key={name} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 pr-4 font-medium text-neutral-900 sticky left-0 bg-white">{name}</td>
                  {dayHours.map((h, i) => (
                    <td key={i} className={`text-center py-2 px-2 ${h > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>
                      {h > 0 ? h.toFixed(1) : '–'}
                    </td>
                  ))}
                  <td className="text-center py-2 pl-4 font-semibold text-primary-700">{total.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

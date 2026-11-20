import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { EmptyState } from '#/components/EmptyState'
import { formatDate, todayDate } from '#/utils/dateTime'
import { AuditEvent, renderAuditEvent, type AuditCategory, type AuditEventItem } from './AuditEvent'
import { FilterChips, Panel } from './kit'

type Filter = 'all' | AuditCategory

/** UK calendar date of an ISO timestamp, for grouping. */
function ukDay(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function dayHeading(day: string, today: string) {
  if (day === today) return 'Today'
  const y = new Date(`${today}T12:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (day === y.toISOString().slice(0, 10)) return 'Yesterday'
  return formatDate(day)
}

export function AuditLogSection({ audit }: { audit: AuditEventItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const today = todayDate()
  const withCategory = audit.map((e) => ({ e, category: renderAuditEvent(e).category }))
  const visible = withCategory.filter((x) => filter === 'all' || x.category === filter)
  const count = (f: Filter) => withCategory.filter((x) => f === 'all' || x.category === f).length

  const groups: { day: string; events: AuditEventItem[] }[] = []
  for (const { e } of visible) {
    const day = ukDay(e.created_at)
    const last = groups.at(-1)
    if (last?.day === day) last.events.push(e)
    else groups.push({ day, events: [e] })
  }

  return (
    <Panel
      tour="audit-log"
      title="Recent activity"
      count={audit.length}
      icon={<ScrollText />}
      description="The latest 50 events across all dates: check-ins, phone approvals, edits and settings. Entries can’t be changed. Staff positions are never logged."
      flush
    >
      {audit.length === 0 ? (
        <EmptyState title="Nothing logged yet" description="Check-ins, phone approvals and admin changes are recorded here." />
      ) : (
        <>
          <div className="relative -mx-1 overflow-x-auto border-b border-hairline-soft px-6 py-3">
            <FilterChips
              label="Filter activity"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'attendance', label: 'Attendance', count: count('attendance') },
                { value: 'phones', label: 'Phones & staff', count: count('phones') },
                { value: 'admin', label: 'Admin changes', count: count('admin') },
              ]}
            />
          </div>
          {groups.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No events of this kind in the latest 50.</p>
          ) : (
            groups.map((g, i) => (
              <section key={`${g.day}-${i}`} aria-label={dayHeading(g.day, today)}>
                <h3 className="sticky top-16 z-[1] border-b border-hairline-soft bg-canvas/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                  {dayHeading(g.day, today)}
                </h3>
                <ul className="divide-y divide-hairline-soft">
                  {g.events.map((e) => (
                    <AuditEvent key={e.id} event={e} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </Panel>
  )
}

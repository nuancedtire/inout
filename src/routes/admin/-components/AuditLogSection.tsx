import { EmptyState } from '#/components/EmptyState'
import { Badge } from '#/components/Badge'
import { AuditEvent, type AuditEventItem } from './AuditEvent'
import { ScrollText } from 'lucide-react'

export function AuditLogSection({ audit }: { audit: AuditEventItem[] }) {
  return (
    <section id="audit-log" data-tour="audit-log" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="w-5 h-5 text-primary-600" />
        <h2 className="font-semibold text-neutral-900">Audit log</h2>
        <Badge variant="neutral">{audit.length}</Badge>
      </div>
      {audit.length === 0 ? (
        <EmptyState title="No events yet" description="Check-ins, check-outs, and admin actions will be logged here." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {audit.map((e) => (
            <AuditEvent key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  )
}

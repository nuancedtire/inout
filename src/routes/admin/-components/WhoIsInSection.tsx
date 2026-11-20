import { formatDateTime, formatTime, relativeTime } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'
import { Building2 } from 'lucide-react'
import { subjectFromPresent, type EvidenceSubject, type PresentStaff } from '#/routes/admin/-types'
import { Panel, StaffAvatar } from './kit'
import { VerificationChip } from './verification'

export function WhoIsInSection({ present, onDetails }: { present: PresentStaff[]; onDetails: (s: EvidenceSubject) => void }) {
  return (
    <Panel
      tour="who-is-in"
      title="Who is in"
      count={present.length}
      icon={<Building2 />}
      description="Checked in and not yet checked out, newest first."
      flush
    >
      {present.length === 0 ? (
        <EmptyState
          title="Nobody is checked in"
          description="People appear here as soon as they check in with the QR code."
          icon="scan"
        />
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {present.map((p) => {
            const subject = subjectFromPresent(p)
            return (
              <li key={p.sessionId} className="flex items-center gap-3 px-5 py-3">
                <StaffAvatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{p.name}</p>
                  <p className="truncate text-sm text-muted">
                    {p.role ? `${p.role} · ` : ''}
                    <span className="tabular-nums" title={formatDateTime(p.check_in_at)}>
                      In {formatTime(p.check_in_at)} · {relativeTime(p.check_in_at)}
                    </span>
                  </p>
                </div>
                <VerificationChip subject={subject} onOpen={() => onDetails(subject)} />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

import { Link } from '@tanstack/react-router'
import { CircleCheck, ShieldCheck, TriangleAlert } from 'lucide-react'
import { formatTime } from '#/utils/dateTime'
import { needsReview, type EvidenceSubject } from '#/routes/admin/-types'
import { linkButtonClass, Panel, StaffAvatar } from './kit'
import { ReasonList } from './verification'

/**
 * Flagged sessions for the selected date that nobody has accepted yet. One tap on Accept opens
 * the note form; Details opens the evidence.
 */
export function NeedsReviewPanel({
  subjects,
  onDetails,
  onAccept,
}: {
  subjects: EvidenceSubject[]
  onDetails: (s: EvidenceSubject) => void
  onAccept: (s: EvidenceSubject) => void
}) {
  const open = subjects.filter(needsReview)
  const accepted = subjects.filter((s) => s.accepted).length
  const verified = subjects.filter((s) => s.verified && !s.accepted).length

  return (
    <Panel
      tour="needs-review"
      title="Needs review"
      count={open.length}
      icon={<TriangleAlert />}
      description={
        open.length
          ? 'Check-ins that could not be fully verified. Nothing was blocked — look at the reason and accept the ones you are happy with.'
          : undefined
      }
      actions={
        subjects.length ? (
          <Link to="/admin/sessions" className={linkButtonClass}>
            All sessions
          </Link>
        ) : null
      }
      flush
    >
      {open.length === 0 ? (
        <div className="flex items-center gap-4 px-5 py-5">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-800">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{subjects.length ? 'All clear' : 'Nothing to review yet'}</p>
            <p className="text-sm text-muted">
              {subjects.length
                ? `${verified} verified${accepted ? ` · ${accepted} accepted` : ''}. Flagged check-ins will appear here.`
                : 'Flagged check-ins for this date will appear here.'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {open.map((s) => (
            <li key={s.sessionId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <StaffAvatar name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate font-semibold text-ink">{s.name}</span>
                    {s.role ? <span className="text-sm text-muted">{s.role}</span> : null}
                  </p>
                  <p className="text-sm tabular-nums text-muted">
                    In {formatTime(s.checkInAt)}
                    {s.checkOutAt ? ` · Out ${formatTime(s.checkOutAt)}` : ' · still in'}
                  </p>
                  <ReasonList reasons={s.reasons} className="mt-1.5" compact />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-13 sm:pl-0">
                <button type="button" onClick={() => onDetails(s)} className={linkButtonClass}>
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => onAccept(s)}
                  className="ui-press inline-flex min-h-11 items-center gap-2 rounded-control border border-hairline bg-canvas px-4 text-sm font-semibold text-ink hover:border-success-700 hover:bg-success-50 hover:text-success-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-10"
                  aria-label={`Accept ${s.name}'s session`}
                >
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Accept
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

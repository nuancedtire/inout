import { ChevronRight, UserRound } from 'lucide-react'
import { initials } from '#/components/checkin/copy'

type IdentityBarProps = {
  staffId: number | null
  staffName: string | null
  staffRole: string | null
  onSelectClick: () => void
  onClear: () => void
}

/** Who this page is showing, with a way to change it. */
export function IdentityBar({ staffId, staffName, staffRole, onSelectClick, onClear }: IdentityBarProps) {
  if (staffId === null || !staffName) {
    return (
      <button
        type="button"
        onClick={onSelectClick}
        className="ui-press flex min-h-16 w-full items-center gap-3.5 rounded-[20px] bg-canvas px-4 py-3 text-left shadow-card hover:shadow-hover"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-muted" aria-hidden="true">
          <UserRound className="size-5" />
        </span>
        <span className="flex-1 font-semibold text-ink">Choose your name</span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex min-h-16 w-full items-center gap-3.5 rounded-[20px] bg-canvas px-4 py-3 shadow-card">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-accent-accessible"
        aria-hidden="true"
      >
        {initials(staffName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{staffName}</p>
        {staffRole ? <p className="truncate text-sm text-muted">{staffRole}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ui-press min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-accent-accessible hover:bg-primary-50"
      >
        Not you?
      </button>
    </div>
  )
}

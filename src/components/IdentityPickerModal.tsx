import { Check } from 'lucide-react'
import { Avatar, Sheet } from '#/components/checkin/ui'

type Entry = { id: number; name: string; role: string | null }

type Props = {
  entries: Entry[]
  staffId: number | null
  onClose: () => void
  onSelect: (id: number) => void
  onClear: () => void
  onReset?: () => void
}

/** Bottom sheet listing today's rota (used by /history to choose whose sessions to show). */
export function IdentityPickerModal({ entries, staffId, onClose, onSelect, onClear, onReset }: Props) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title="Who are you?" description="Choose your name from today’s rota.">
      <ul className="-mx-5 max-h-[55vh] overflow-y-auto border-y border-hairline-soft">
        {entries.map((entry) => {
          const selected = entry.id === staffId
          return (
            <li key={entry.id} className="border-b border-hairline-soft last:border-0">
              <button
                type="button"
                aria-current={selected || undefined}
                onClick={() => { onSelect(entry.id); onClose() }}
                className={`flex min-h-16 w-full items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-surface-soft ${selected ? 'bg-primary-50/60' : ''}`}
              >
                <Avatar name={entry.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{entry.name}</span>
                  {entry.role ? <span className="block truncate text-sm text-muted">{entry.role}</span> : null}
                </span>
                {selected ? <Check className="size-5 shrink-0 text-accent-accessible" aria-label="Selected" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
      {(staffId || onReset) && (
        <div className="mt-3 flex flex-col">
          {staffId ? (
            <button
              type="button"
              onClick={() => { onClose(); onClear() }}
              className="ui-press min-h-11 rounded-control text-sm font-semibold text-ink hover:bg-surface-strong"
            >
              Clear my name
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="ui-press min-h-11 rounded-control text-sm font-medium text-muted hover:bg-surface-strong hover:text-ink"
            >
              Reset this browser
            </button>
          ) : null}
        </div>
      )}
    </Sheet>
  )
}

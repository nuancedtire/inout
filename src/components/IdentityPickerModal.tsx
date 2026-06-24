import { X } from 'lucide-react'
import { Badge } from '#/components/Badge'

type Entry = { id: number; name: string; role: string | null }

type Props = {
  entries: Entry[]
  staffId: number | null
  onClose: () => void
  onSelect: (id: number) => void
  onClear: () => void
  onReset?: () => void
}

export function IdentityPickerModal({ entries, staffId, onClose, onSelect, onClear, onReset }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-picker-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-canvas rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[75vh] overflow-hidden shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-hairline" />
        </div>
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
          <h2 id="identity-picker-title" className="text-base font-semibold text-ink">Who are you?</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-soft text-muted hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[55vh]">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => { onSelect(entry.id); onClose() }}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-soft transition-colors border-b border-hairline-soft last:border-0 ${entry.id === staffId ? 'bg-primary-50' : ''}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                style={{ background: '#ff385c18', color: '#ff385c' }}
              >
                {entry.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{entry.name}</p>
                {entry.role && <p className="text-xs text-muted">{entry.role}</p>}
              </div>
              {entry.id === staffId && <Badge variant="info">You</Badge>}
            </button>
          ))}
        </div>
        {(staffId || onReset) && (
          <div className="px-5 py-4 border-t border-hairline space-y-2">
            {staffId && (
              <button
                type="button"
                onClick={() => { onClose(); onClear() }}
                className="w-full text-sm text-muted hover:text-danger-600 py-1.5 transition-colors"
              >
                Clear my identity
              </button>
            )}
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="w-full text-xs text-muted hover:text-ink py-1 transition-colors"
              >
                Reset everything
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

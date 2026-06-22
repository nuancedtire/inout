import { Fingerprint } from 'lucide-react'

type IdentityBarProps = {
  staffId: number | null
  staffName: string | null
  staffRole: string | null
  onSelectClick: () => void
  onClear: () => void
}

export function IdentityBar({ staffId, staffName, staffRole, onSelectClick, onClear }: IdentityBarProps) {
  if (staffId === null || !staffName) {
    return (
      <button
        type="button"
        onClick={onSelectClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-hairline bg-canvas hover:bg-surface-soft transition-colors cursor-pointer"
        style={{ boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0' }}
      >
        <div className="w-9 h-9 rounded-full bg-surface-strong flex items-center justify-center shrink-0">
          <span className="text-base text-muted">?</span>
        </div>
        <span className="text-sm font-medium text-muted flex-1 text-left">Tap to identify yourself</span>
        <Fingerprint className="w-4 h-4 text-muted shrink-0" />
      </button>
    )
  }

  return (
    <div
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-canvas border border-hairline"
      style={{ boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0' }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
        style={{ background: '#ff385c18', color: '#ff385c' }}
      >
        {staffName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{staffName}</p>
        {staffRole && <p className="text-xs text-muted">{staffRole}</p>}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-xs font-medium text-muted hover:text-danger-600 transition-colors cursor-pointer"
      >
        Not you?
      </button>
    </div>
  )
}

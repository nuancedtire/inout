import { formatDateTime, relativeTime } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'
import { MapPin } from 'lucide-react'

export type PresentStaff = {
  id: number
  name: string
  role: string | null
  check_in_at: string
}

const AVATAR_PALETTES = [
  { bg: '#fff1f4', text: '#e00b41' },
  { bg: '#f0fdf4', text: '#16a34a' },
  { bg: '#eff6ff', text: '#2563eb' },
  { bg: '#fef3c7', text: '#d97706' },
  { bg: '#f5f3ff', text: '#7c3aed' },
  { bg: '#fdf4ff', text: '#a21caf' },
]

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getPalette(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

export function WhoIsInSection({ present }: { present: PresentStaff[] }) {
  return (
    <div
      className="bg-canvas rounded-2xl overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline-soft">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary-500" />
          <h2 className="font-semibold text-ink">Who is in</h2>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-success-100 text-success-700">
          {present.length} present
        </span>
      </div>

      {present.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Nobody checked in"
            description="Check-ins will appear here once staff scan the QR code."
            icon="alert"
          />
        </div>
      ) : (
        <ul>
          {present.map((s, i) => {
            const palette = getPalette(s.name)
            return (
              <li
                key={s.id}
                className={`px-5 py-3.5 flex items-center gap-3.5 hover:bg-surface-soft transition-colors ${i < present.length - 1 ? 'border-b border-hairline-soft' : ''}`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: palette.bg, color: palette.text }}
                >
                  {getInitials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink text-sm truncate">{s.name}</p>
                  {s.role && <p className="text-xs text-muted truncate">{s.role}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-xs text-muted"
                    title={formatDateTime(s.check_in_at)}
                  >
                    {relativeTime(s.check_in_at)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-500 inline-block" />
                    <span className="text-xs text-success-700 font-medium">in</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

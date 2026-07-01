import { HelpCircle } from 'lucide-react'
import { useTour } from '#/lib/tour/TourContext'

export function TourFab() {
  const { start, active } = useTour()

  if (active) return null

  return (
    <button
      onClick={start}
      aria-label="Replay tutorial"
      className="sm:hidden fixed z-40 bottom-24 right-4 w-11 h-11 rounded-full bg-canvas border border-hairline flex items-center justify-center text-primary-600 hover:bg-surface-soft active:scale-95 transition-all"
      style={{ boxShadow: 'var(--shadow-hover)' }}
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  )
}

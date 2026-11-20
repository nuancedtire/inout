import { useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, HelpCircle, Lock } from 'lucide-react'
import { useTour } from '#/lib/tour/TourContext'
import { DatePicker } from '#/components/DatePicker'
import { cn } from '#/lib/utils'
import { formatDate } from '#/utils/dateTime'
import { navItemFor } from './nav'

export type DateNavProps = {
  viewDate: string
  isToday: boolean
  onPrev: () => void
  onNext: () => void
  onDateChange: (d: string) => void
  onToday: () => void
}

const iconButton =
  'ui-press flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus sm:size-10'

function DateNav({ viewDate, isToday, onPrev, onNext, onDateChange, onToday, className }: DateNavProps & { className?: string }) {
  return (
    <div role="group" aria-label={`Showing ${formatDate(viewDate)}`} className={cn('items-center gap-1', className)}>
      <button type="button" aria-label="Previous day" className={iconButton} onClick={onPrev}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <DatePicker value={viewDate} onChange={onDateChange} className="min-h-10 justify-center px-3.5 max-sm:flex-1" />
      <button type="button" aria-label="Next day" className={iconButton} onClick={onNext}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={onToday}
          className="ui-press ml-1 inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Today
        </button>
      )}
    </div>
  )
}

/** Sticky page header: title, the date the page shows (dated pages only) and Lock. */
export function AdminTopBar({ onLogout, ...dateNav }: DateNavProps & { onLogout: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const item = navItemFor(pathname)
  const { start } = useTour()

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-hairline-soft bg-canvas/90 px-4 backdrop-blur-xl sm:px-6">
      <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-ink">{item?.title ?? 'Admin'}</h1>
      <div className="flex-1" />
      {item?.dated ? <DateNav {...dateNav} className="hidden sm:flex" /> : null}
      <div className="hidden h-6 w-px bg-hairline sm:block" aria-hidden="true" />
      {/* Phones have no sidebar footer, so the tour lives here. */}
      <button type="button" onClick={start} aria-label="Replay the tour" className={cn(iconButton, '-mr-2 text-muted md:hidden')}>
        <HelpCircle className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="ui-press inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus sm:min-h-10"
      >
        <Lock className="size-4" aria-hidden="true" />
        Lock
      </button>
    </header>
  )
}

/** On phones the date controls get their own full-width row under the header. */
export function MobileDateBar(props: DateNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  if (!navItemFor(pathname)?.dated) return null
  return <DateNav {...props} className="-mx-1 mb-4 flex sm:hidden" />
}

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'

type DatePickerProps = {
  value: string        // ISO date string "YYYY-MM-DD"
  onChange: (date: string) => void
  className?: string
}

export function DatePicker({ value, onChange, className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const selected = value ? parseISO(value) : undefined
  const displayLabel = selected ? format(selected, 'dd MMM yyyy') : 'Pick a date'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`ui-press flex items-center gap-2 rounded-control border border-hairline bg-canvas px-3 py-1.5 text-sm text-body hover:border-neutral-400 hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
        >
          <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="font-medium">{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-control shadow-overlay border border-hairline" align="end">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

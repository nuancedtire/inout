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
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-hairline bg-canvas hover:bg-surface-soft text-sm text-body transition-colors ${className}`}
        >
          <CalendarDays className="w-4 h-4 text-muted shrink-0" />
          <span className="font-medium">{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl shadow-lg border border-hairline" align="end">
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

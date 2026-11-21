import { useId, useState, type InputHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'
import { normalizeShiftTime, SHIFT_TIME_HINT } from '#/utils/shiftTime'
import { inputClass } from './kit'

/**
 * A shift-time box that takes "0800", "800", "8", "8:00" or "8pm" and tidies it to "08:00" when
 * you leave the field. The keypad stays numeric on phones (no colon needed). Works controlled
 * (`value` + `onValueChange`) or uncontrolled inside a FormData form (`name`).
 */
export function ShiftTimeInput({
  value,
  onValueChange,
  className,
  onBlur,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value?: string
  onValueChange?: (value: string) => void
}) {
  const [invalid, setInvalid] = useState(false)
  const hintId = useId()
  return (
    <span className="flex flex-col gap-1">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={16}
        {...(value !== undefined ? { value } : {})}
        onChange={(e) => {
          if (invalid) setInvalid(false)
          onValueChange?.(e.target.value)
        }}
        onBlur={(e) => {
          const normalized = normalizeShiftTime(e.target.value)
          if (normalized === null) {
            setInvalid(true)
          } else if (normalized !== e.target.value) {
            if (value === undefined) e.target.value = normalized
            onValueChange?.(normalized)
          }
          onBlur?.(e)
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        className={cn(inputClass, 'tabular-nums', invalid && 'border-danger-600 hover:border-danger-600', className)}
      />
      {invalid ? (
        <span id={hintId} className="text-xs text-danger-700" aria-live="polite">
          {SHIFT_TIME_HINT}
        </span>
      ) : null}
    </span>
  )
}

import type { ChangeEvent } from 'react'

export function SessionEditForm({
  checkInAt,
  checkOutAt,
  onChange,
  onSave,
  onCancel,
  className = '',
  inputClassName = '',
}: {
  checkInAt: string
  checkOutAt: string
  onChange: (field: 'checkInAt' | 'checkOutAt', value: string) => void
  onSave: () => void
  onCancel: () => void
  className?: string
  inputClassName?: string
}) {
  const handleCheckIn = (ev: ChangeEvent<HTMLInputElement>) => onChange('checkInAt', ev.target.value)
  const handleCheckOut = (ev: ChangeEvent<HTMLInputElement>) => onChange('checkOutAt', ev.target.value)

  return (
    <div className={className}>
      <input
        type="datetime-local"
        aria-label="Check-in time"
        className={`p-2 border border-neutral-300 rounded-lg text-sm ${inputClassName}`}
        value={checkInAt}
        onChange={handleCheckIn}
      />
      <input
        type="datetime-local"
        aria-label="Check-out time"
        className={`p-2 border border-neutral-300 rounded-lg text-sm ${inputClassName}`}
        value={checkOutAt}
        onChange={handleCheckOut}
      />
      <button className="text-sm text-success-600 font-medium" onClick={onSave}>Save</button>
      <button className="text-sm text-neutral-500" onClick={onCancel}>Cancel</button>
    </div>
  )
}

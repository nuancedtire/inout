import { useId } from 'react'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { inputClass } from './kit'

export function SessionEditForm({
  checkInAt,
  checkOutAt,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  checkInAt: string
  checkOutAt: string
  onChange: (field: 'checkInAt' | 'checkOutAt', value: string) => void
  onSave: () => void
  onCancel: () => void
  saving?: boolean
}) {
  const id = useId()
  return (
    <form
      className="flex flex-col gap-3 rounded-control border border-hairline-soft bg-canvas p-4 sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor={`${id}-in`} className="text-xs font-semibold text-muted">Check-in</label>
        <input id={`${id}-in`} type="datetime-local" required className={inputClass} value={checkInAt} onChange={(e) => onChange('checkInAt', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor={`${id}-out`} className="text-xs font-semibold text-muted">Checkout <span className="font-normal">(empty = still in)</span></label>
        <input id={`${id}-out`} type="datetime-local" className={inputClass} value={checkOutAt} onChange={(e) => onChange('checkOutAt', e.target.value)} />
      </div>
      <div className={cn('flex gap-2 sm:ml-auto')}>
        <button
          type="button"
          onClick={onCancel}
          className="ui-press inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none"
        >
          Cancel
        </button>
        <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
          Save times
        </Button>
      </div>
      <p className="w-full text-xs text-muted">Saved changes are recorded as an admin correction in the audit log.</p>
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

export type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  confirmVariant: 'danger' | 'warning'
  onConfirm: () => Promise<void> | void
} | null

type ConfirmDialogProps = {
  state: ConfirmDialogState
  onClose: () => void
}

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const open = state !== null

  // Focus the safe choice first, close on Escape, and hand focus back when the dialog goes away.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    cardRef.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
    return () => previous?.focus?.()
  }, [open])

  if (!state) return null

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await state.onConfirm()
    } finally {
      setLoading(false)
      onClose()
    }
  }

  const tone = state.confirmVariant === 'danger'
    ? 'bg-danger-50 text-danger-700 ring-danger-100'
    : 'bg-warning-50 text-warning-700 ring-warning-100'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !loading) onClose()
      }}
    >
      {/* overlay */}
      <div className="animate-scrim absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !loading && onClose()} />
      {/* card */}
      <div
        ref={cardRef}
        className="animate-pop relative w-full max-w-sm rounded-card bg-canvas p-6 shadow-overlay"
      >
        <div className="flex items-start gap-4">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${tone}`}>
            <AlertTriangle className="size-5" strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 id="confirm-dialog-title" className="text-lg font-semibold leading-snug text-ink text-balance">{state.title}</h3>
            <p id="confirm-dialog-message" className="mt-1 text-sm leading-relaxed text-muted text-pretty">{state.message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <CancelButton onClose={onClose} disabled={loading} />
          <Button variant={state.confirmVariant} loading={loading} onClick={handleConfirm} className="sm:min-w-24">
            {state.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CancelButton({ onClose, disabled }: { onClose: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      data-cancel=""
      onClick={onClose}
      disabled={disabled}
      className="ui-press inline-flex min-h-11 items-center justify-center rounded-control px-5 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45"
    >
      Cancel
    </button>
  )
}

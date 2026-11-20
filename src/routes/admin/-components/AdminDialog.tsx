import type { ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type DialogTone = 'success' | 'warning' | 'danger' | 'neutral'

const toneClasses: Record<DialogTone, string> = {
  success: 'bg-success-50 text-success-800 ring-success-100',
  warning: 'bg-warning-50 text-warning-800 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  neutral: 'bg-surface-soft text-ink ring-hairline-soft',
}

/**
 * Modal used across the admin area: a bottom sheet on phones, a centred card on larger screens.
 * Radix handles focus trapping, Escape and returning focus. `busy` keeps it open while saving.
 */
export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone = 'neutral',
  busy,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  tone?: DialogTone
  busy?: boolean
  children?: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (busy && !next ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-scrim fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
          <Dialog.Content
            className={cn(
              'animate-pop pointer-events-auto relative flex max-h-[calc(100svh-1.5rem)] w-full flex-col overflow-hidden rounded-lg bg-canvas shadow-overlay focus:outline-none',
              size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md',
            )}
          >
            <div className="flex items-start gap-4 px-6 pb-2 pt-6 pr-16">
              {icon ? (
                <span
                  aria-hidden="true"
                  className={cn('flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset [&_svg]:size-5', toneClasses[tone])}
                >
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0 pt-0.5">
                <Dialog.Title className="text-lg font-semibold leading-snug text-ink text-balance">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted text-pretty">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">Details</Dialog.Description>
                )}
              </div>
            </div>
            <Dialog.Close
              disabled={busy}
              aria-label="Close"
              className="ui-press absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
            {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div> : null}
            {footer ? (
              <div className="flex flex-col-reverse gap-2 border-t border-hairline-soft px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Quiet secondary action for dialog footers. */
export function DialogCancel({ onClick, disabled, children = 'Cancel' }: { onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ui-press inline-flex min-h-11 items-center justify-center rounded-control px-5 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
}

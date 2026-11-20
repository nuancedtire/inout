import type { ErrorComponentProps } from '@tanstack/react-router'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Wordmark } from './brand/Wordmark'

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error && error.message ? error.message : 'Something went wrong'

  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-8 bg-surface-soft px-4 py-12 pt-safe">
      <Wordmark size="md" animate="run" />
      <div
        role="alert"
        className="animate-reveal w-full max-w-sm rounded-card border border-hairline-soft bg-canvas p-6 text-center shadow-card"
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100">
          <AlertCircle className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty break-words">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="ui-press inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent-accessible px-5 text-sm font-semibold text-white hover:bg-accent-accessible-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </button>
          ) : null}
          <a
            href="/"
            className="ui-press inline-flex min-h-11 items-center justify-center rounded-control border border-hairline bg-canvas px-5 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  )
}

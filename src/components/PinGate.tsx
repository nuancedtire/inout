import { useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from './Button'
import { Wordmark } from './brand/Wordmark'

export type PinGateProps = {
  pin: string
  onPinChange: (pin: string) => void
  verifying: boolean
  error: string
  /** Resolves true when the PIN was accepted; false shakes the field. */
  onUnlock: () => Promise<boolean>
  /** Visible page heading under the lockup. Without it the lockup itself is the page's h1. */
  heading?: string
  /** Accessible name of the lockup when it is the h1. */
  label?: string
  subtitle?: string
}

/**
 * The admin PIN screen: running lockup, one card, one field, one button. Shared by /admin and /print-qr so
 * both doors to the admin area look and behave the same.
 */
export function PinGate({
  pin,
  onPinChange,
  verifying,
  error,
  onUnlock,
  heading,
  label = 'InOut admin',
  subtitle = 'Enter your PIN to continue',
}: PinGateProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [reveal, setReveal] = useState(false)
  const [localError, setLocalError] = useState('')
  const [shaking, setShaking] = useState(false)
  const feedback = localError || error

  const shake = () => {
    setShaking(false)
    requestAnimationFrame(() => setShaking(true))
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (verifying) return
    if (!pin.trim()) {
      setLocalError('Enter your PIN to continue.')
      shake()
      return
    }
    setLocalError('')
    if (!(await onUnlock())) shake()
  }

  return (
    <main className="min-h-svh flex items-center justify-center bg-surface-soft px-4 py-12 pt-safe">
      <section className="w-full max-w-[420px] text-center">
        <div className="animate-reveal">
          <Wordmark as={heading ? 'p' : 'h1'} size="lg" label={label} animate="run" className="mx-auto" />
          {heading ? <h1 className="mt-8 text-2xl font-semibold tracking-[-0.01em] text-ink">{heading}</h1> : null}
          <p className={`mx-auto mb-8 max-w-[34ch] text-base text-muted ${heading ? 'mt-1.5' : 'mt-6'}`}>{subtitle}</p>
        </div>

        <form
          noValidate
          onSubmit={submit}
          className="animate-reveal rounded-card border border-hairline-soft bg-canvas p-6 text-left shadow-card [animation-delay:60ms]"
        >
          <label htmlFor="pin-input" className="mb-3 block text-base font-semibold text-ink">
            Admin PIN
          </label>
          <div
            onAnimationEnd={() => setShaking(false)}
            className={[
              'flex items-center gap-1 rounded-control border bg-canvas pr-1 transition-[border-color,box-shadow]',
              feedback
                ? 'border-danger-600 focus-within:shadow-[0_0_0_1px_var(--color-danger-600)]'
                : 'border-hairline hover:border-neutral-400 focus-within:border-ink focus-within:shadow-[0_0_0_1px_var(--color-ink)]',
              shaking ? 'animate-shake' : '',
            ].join(' ')}
          >
            <input
              ref={inputRef}
              id="pin-input"
              name="pin"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-invalid={feedback ? true : undefined}
              aria-describedby="pin-feedback"
              className="block min-h-14 w-full min-w-0 rounded-control bg-transparent px-4 text-lg text-ink outline-none placeholder:text-muted focus-visible:outline-none"
              value={pin}
              onChange={(e) => {
                setLocalError('')
                onPinChange(e.target.value)
              }}
            />
            <button
              type="button"
              aria-label="Show PIN"
              aria-pressed={reveal}
              aria-controls="pin-input"
              onClick={() => setReveal((v) => !v)}
              className="ui-press flex size-11 shrink-0 items-center justify-center rounded-inner text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
            >
              {reveal ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>

          <div id="pin-feedback" aria-live="polite" className="h-14 pt-3 text-sm leading-5">
            {verifying ? (
              <div>
                <p className="text-muted">Checking PIN…</p>
                <div className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-hairline-soft" aria-hidden="true">
                  <div className="animate-progress h-full w-full origin-left rounded-full bg-ink" />
                </div>
              </div>
            ) : feedback ? (
              <p className="text-danger-700">{feedback}</p>
            ) : null}
          </div>

          <Button type="submit" size="lg" fullWidth loading={verifying}>
            Unlock
          </Button>
        </form>
      </section>
    </main>
  )
}

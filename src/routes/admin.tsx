import { useRef, useState } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider } from '#/components/ui/sidebar'
import { AppSidebar } from '#/routes/admin/-components/AppSidebar'
import { AdminDock } from '#/routes/admin/-components/AdminDock'
import { AdminContext, type AdminContextValue } from '#/routes/admin/-context'
import { usePersistentAdminAuth, useAutoDismiss } from '#/routes/admin/-hooks'
import { useLoading } from '#/hooks/useLoading'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '#/components/Button'
import { Wordmark } from '#/components/brand/Wordmark'
import { addDays, todayDate } from '#/utils/dateTime'
import { TourProvider } from '#/lib/tour/TourContext'
import { TourOverlay } from '#/components/TourOverlay'
import { AdminTopBar, MobileDateBar } from '#/routes/admin/-components/AdminTopBar'

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
  errorComponent: ErrorFallback,
  notFoundComponent: () => <NotFound />,
  loader: async () => {
    return { date: todayDate() }
  },
})

function NotFound() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <EmptyState title="Page not found" description="This admin page cannot be found." />
    </main>
  )
}

function AdminLayout() {
  const { date: today } = Route.useLoaderData()
  const { authToken, authenticated, pin, setPin, login, logout } = usePersistentAdminAuth()
  const { message, show, clear } = useAutoDismiss()
  const { loading, withLoading } = useLoading()
  const [viewDate, setViewDate] = useState(today)

  const isToday = viewDate === today

  // ─── PIN login gate ──────────────────────────────────────────────
  if (!authenticated) {
    const handleUnlock = async () => {
      try {
        await withLoading('unlock', async () => login(pin))
        return true
      } catch (err) {
        const text = err instanceof Error ? err.message : ''
        show(!text || /invalid.*pin/i.test(text) ? 'Incorrect PIN. Please try again.' : text)
        return false
      }
    }

    return (
      <PinGate
        pin={pin}
        onPinChange={(value) => {
          setPin(value)
          if (message) clear()
        }}
        verifying={Boolean(loading['unlock'])}
        error={message}
        onUnlock={handleUnlock}
      />
    )
  }

  if (!authToken) return null

  // ─── Context value for child routes ───────────────────────────────
  const contextValue: AdminContextValue = {
    authToken,
    logout,
    viewDate,
    setViewDate,
    today,
  }

  const dateNav = {
    viewDate,
    isToday,
    onPrev: () => setViewDate(addDays(viewDate, -1)),
    onNext: () => setViewDate(addDays(viewDate, 1)),
    onDateChange: setViewDate,
    onToday: () => setViewDate(today),
  }

  return (
    <AdminContext.Provider value={contextValue}>
      <TourProvider>
        <SidebarProvider>
          <AppSidebar />
          <main className="flex min-h-svh w-full min-w-0 flex-col bg-surface-soft">
            <AdminTopBar {...dateNav} onLogout={logout} />
            <div className="flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 md:pb-10">
              <MobileDateBar {...dateNav} />
              <Outlet />
            </div>
          </main>
          <AdminDock />
          <TourOverlay />
        </SidebarProvider>
      </TourProvider>
    </AdminContext.Provider>
  )
}

type PinGateProps = {
  pin: string
  onPinChange: (pin: string) => void
  verifying: boolean
  error: string
  onUnlock: () => Promise<boolean>
}

function PinGate({ pin, onPinChange, verifying, error, onUnlock }: PinGateProps) {
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
          <Wordmark
            as="h1"
            size="lg"
            label="InOut admin"
            animate={verifying ? 'run' : 'idle'}
            className="mx-auto"
          />
          <p className="mx-auto mt-6 mb-8 max-w-[34ch] text-base text-muted">Enter your PIN to continue</p>
        </div>

        <form
          noValidate
          onSubmit={submit}
          className="animate-reveal rounded-lg border border-hairline-soft bg-canvas p-6 text-left shadow-card [animation-delay:60ms]"
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
              className="block min-h-14 w-full min-w-0 rounded-control bg-transparent px-4 text-lg text-ink outline-none placeholder:text-muted-soft focus-visible:outline-none"
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
              className="ui-press flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
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

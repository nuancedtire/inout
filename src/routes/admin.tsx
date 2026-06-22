import { useState } from 'react'
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { SidebarProvider } from '#/components/ui/sidebar'
import { AppSidebar } from '#/routes/admin/-components/AppSidebar'
import { AdminContext, type AdminContextValue } from '#/routes/admin/-context'
import { usePersistentAdminAuth, useAutoDismiss } from '#/routes/admin/-hooks'
import { useLoading } from '#/hooks/useLoading'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Lock, LogOut } from 'lucide-react'
import { Button } from '#/components/Button'
import { Logo } from '#/components/Logo'
import { DatePicker } from '#/components/DatePicker'
import { addDays } from '#/utils/dateTime'

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/roster': 'Roster',
  '/admin/sessions': 'Sessions',
  '/admin/audit': 'Audit',
}

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
  errorComponent: ErrorFallback,
  notFoundComponent: () => <NotFound />,
  loader: async () => {
    return { date: new Date().toISOString().slice(0, 10) }
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
  const { message, show } = useAutoDismiss()
  const { loading, withLoading } = useLoading()
  const [viewDate, setViewDate] = useState(today)

  const isToday = viewDate === today

  // ─── PIN login gate ──────────────────────────────────────────────
  if (!authenticated) {
    const handleUnlock = async () => {
      await withLoading('unlock', async () => login(pin)).catch((err) =>
        show(err instanceof Error ? err.message : 'Invalid PIN'),
      )
    }

    return (
      <main className="min-h-screen flex items-center justify-center bg-surface-soft p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 mb-5">
              <Logo size={52} variant="rausch" glow />
            </div>
            <h1 className="text-2xl font-bold text-ink">InOut Admin</h1>
            <p className="text-sm text-muted mt-1">Enter your PIN to continue</p>
          </div>
          <div
            className="bg-canvas rounded-2xl p-6"
            style={{ boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.08) 0 4px 8px 0' }}
          >
            <label className="block text-sm font-medium text-body mb-2" htmlFor="pin-input">
              Admin PIN
            </label>
            <input
              id="pin-input"
              type="password"
              inputMode="numeric"
              placeholder="••••"
              aria-label="Admin PIN"
              className="w-full px-4 py-3 text-lg tracking-widest border border-hairline rounded-xl mb-4 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-center transition-all"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') await handleUnlock()
              }}
            />
            <Button fullWidth loading={loading['unlock']} onClick={handleUnlock}>
              Unlock
            </Button>
            {message && (
              <div className="mt-3 flex items-center gap-2 p-3 bg-danger-50 rounded-xl border border-danger-100">
                <Lock className="w-4 h-4 text-danger-600 shrink-0" />
                <p className="text-sm text-danger-700">{message}</p>
              </div>
            )}
          </div>
        </div>
      </main>
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

  return (
    <AdminContext.Provider value={contextValue}>
      <SidebarProvider>
        <AppSidebar />
        <main className="w-full min-h-svh bg-surface-soft flex flex-col">
          <TopBar
            viewDate={viewDate}
            isToday={isToday}
            today={today}
            onPrev={() => setViewDate(addDays(viewDate, -1))}
            onNext={() => setViewDate(addDays(viewDate, 1))}
            onDateChange={(d) => setViewDate(d)}
            onToday={() => setViewDate(today)}
            onLogout={logout}
          />
          <div className="flex-1 p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarProvider>
    </AdminContext.Provider>
  )
}

type TopBarProps = {
  viewDate: string
  isToday: boolean
  today: string
  onPrev: () => void
  onNext: () => void
  onDateChange: (d: string) => void
  onToday: () => void
  onLogout: () => void
}

function TopBar({ viewDate, isToday, onPrev, onNext, onDateChange, onToday, onLogout }: TopBarProps) {
  const router = useRouterState()
  const pageTitle = PAGE_TITLES[router.location.pathname] ?? 'Admin'

  return (
    <header className="flex items-center gap-3 px-5 h-16 border-b border-hairline bg-canvas sticky top-0 z-20 shrink-0">
      <h1 className="text-sm font-semibold text-ink">{pageTitle}</h1>

      <div className="flex-1" />

      {/* Date navigation */}
      <div className="flex items-center gap-1">
        <button
          aria-label="Previous day"
          className="p-1.5 rounded-full hover:bg-surface-soft text-muted hover:text-ink transition-all"
          onClick={onPrev}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <DatePicker value={viewDate} onChange={onDateChange} />
        <button
          aria-label="Next day"
          className="p-1.5 rounded-full hover:bg-surface-soft text-muted hover:text-ink transition-all"
          onClick={onNext}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {!isToday && (
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-xs font-semibold rounded-full border border-hairline bg-canvas text-ink hover:bg-surface-soft transition-colors"
        >
          Today
        </button>
      )}

      <div className="w-px h-5 bg-hairline" />

      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-ink hover:bg-surface-soft rounded-full transition-colors"
        onClick={onLogout}
        title="Lock admin"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Lock</span>
      </button>
    </header>
  )
}

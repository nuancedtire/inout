import { useState } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider } from '#/components/ui/sidebar'
import { AppSidebar } from '#/routes/admin/-components/AppSidebar'
import { AdminDock } from '#/routes/admin/-components/AdminDock'
import { AdminContext, type AdminContextValue } from '#/routes/admin/-context'
import { usePersistentAdminAuth, useAutoDismiss } from '#/routes/admin/-hooks'
import { useLoading } from '#/hooks/useLoading'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { PinGate } from '#/components/PinGate'
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

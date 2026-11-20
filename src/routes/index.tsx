import { createFileRoute } from '@tanstack/react-router'
import { getTodayRoster } from '#/utils/rotas.functions'
import { ErrorFallback } from '#/components/ErrorFallback'
import { CheckInFlow } from '#/components/checkin/CheckInFlow'

/**
 * Staff check-in. Arrives from the department QR (`/?token=…`) or the Home Screen (no token: the
 * in-app scanner). The token is moved into memory/sessionStorage and stripped from the address bar.
 * Everything that depends on the browser (stored identity, platform, passkeys) renders after mount.
 */
export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ErrorFallback,
  validateSearch: (s: Record<string, unknown>): { token?: string } =>
    typeof s.token === 'string' && s.token ? { token: s.token } : {},
  loader: () => getTodayRoster(),
})

function HomePage() {
  const data = Route.useLoaderData()
  const { token } = Route.useSearch()
  return <CheckInFlow data={data} urlToken={token} />
}

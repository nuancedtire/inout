import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import QRCode from 'qrcode'
import { CalendarDays } from 'lucide-react'
import { getQrTokenOrSeed } from '#/utils/rotas.functions'
import { todayDate } from '#/utils/dateTime'
import { ErrorFallback } from '#/components/ErrorFallback'
import { EmptyState } from '#/components/EmptyState'
import { Wordmark } from '#/components/brand/Wordmark'
import { WorkingIndicator } from '#/components/brand/WorkingIndicator'

export const Route = createFileRoute('/qr')({
  component: QrPage,
  errorComponent: ErrorFallback,
  notFoundComponent: () => <NotFound />,
  validateSearch: (s: Record<string, unknown>) => ({ date: (s.date as string) || todayDate() }),
  loaderDeps: ({ search }) => ({ date: search.date }),
  loader: async ({ deps }) => {
    return getQrTokenOrSeed({ data: { date: deps.date } })
  },
})

function NotFound() {
  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-surface-soft">
      <EmptyState title="Page not found" description="This QR page cannot be found." />
    </main>
  )
}

function QrPage() {
  const { token } = Route.useLoaderData()
  const { date } = Route.useSearch()
  const navigate = useNavigate({ from: '/qr' })
  const [qrUrl, setQrUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsGenerating(true)
    setQrError(null)

    if (!token) {
      setQrError('No rota exists for this date. Upload a rota first before generating a QR code.')
      setIsGenerating(false)
      return
    }

    const url = `${window.location.origin}/?token=${token}`
    QRCode.toDataURL(url, { width: 600 })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrUrl(dataUrl)
          setIsGenerating(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError('Could not generate QR code. Try a different date.')
          setIsGenerating(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  function changeDate(newDate: string) {
    navigate({ search: (prev) => ({ ...prev, date: newDate }) })
  }

  return (
    <main className="min-h-svh bg-surface-soft px-4 py-8 pt-safe sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <Wordmark size="md" animate="idle" />

        <h1 className="animate-reveal mt-8 text-3xl font-bold tracking-tight text-ink text-balance sm:text-4xl">
          Scan to check in or out
        </h1>
        <p className="animate-reveal mt-2 text-muted text-pretty [animation-delay:40ms]">
          Open your phone camera and point it at the code.
        </p>

        <div className="animate-reveal mt-8 w-full [animation-delay:80ms]">
          {qrError ? (
            <div className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
              <EmptyState title="QR generation failed" description={qrError} icon="alert" />
            </div>
          ) : (
            <figure className="rounded-lg border border-hairline-soft bg-canvas p-5 shadow-card sm:p-6">
              <div className="relative aspect-square w-full overflow-hidden rounded-control">
                {qrUrl && !isGenerating ? (
                  <img
                    src={qrUrl}
                    alt={`QR code for checking in or out on ${longDate(date)}`}
                    className="block size-full [image-rendering:pixelated]"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-surface-soft">
                    <WorkingIndicator label="Generating QR…" size={64} />
                  </div>
                )}
              </div>
              <figcaption className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-body">
                <span className="inline-block size-1.5 rounded-full bg-success-accessible" aria-hidden="true" />
                Valid for {longDate(date)} only
              </figcaption>
              {token && (
                <p className="mt-3 text-sm text-muted">
                  Can't scan? Type this code in InOut:{' '}
                  <span className="font-mono font-semibold tracking-[0.12em] text-ink select-all">{formatCode(token)}</span>
                </p>
              )}
            </figure>
          )}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <label htmlFor="qr-date" className="flex items-center gap-2 text-sm font-medium text-muted">
            <CalendarDays className="size-4" aria-hidden="true" />
            Date
          </label>
          <input
            id="qr-date"
            type="date"
            className="min-h-11 rounded-control border border-hairline bg-canvas px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] hover:border-neutral-400 focus-visible:border-ink focus-visible:shadow-[0_0_0_1px_var(--color-ink)]"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
          />
        </div>
      </div>
    </main>
  )
}

/** "2026-11-20" → "Friday 20 November 2026" (date-only, so formatted in UTC to avoid shifts). */
function longDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

/** "ABCDEFGHJKLM" → "ABCD EFGH JKLM" for reading aloud / typing. */
function formatCode(token: string) {
  return token.replace(/(.{4})(?=.)/g, '$1 ')
}

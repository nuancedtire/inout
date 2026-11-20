import { Link } from '@tanstack/react-router'
import { Printer, QrCode, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/Button'
import { formatDate } from '#/utils/dateTime'
import { errorText, linkButtonClass, Panel } from './kit'

export function QrSection({
  viewDate,
  onGenerate,
}: {
  viewDate: string
  onGenerate: (date: string) => Promise<string>
}) {
  const [qr, setQr] = useState<{ date: string; url: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setError(''), [viewDate])

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      setQr({ date: viewDate, url: await onGenerate(viewDate) })
    } catch (e) {
      setError(errorText(e, 'Could not make the QR code.'))
    } finally {
      setLoading(false)
    }
  }

  const shown = qr && qr.date === viewDate ? qr : null

  return (
    <Panel
      tour="qr-code"
      title="Check-in QR code"
      icon={<QrCode />}
      description={`Staff scan it with their phone camera. It changes every day — this one is for ${formatDate(viewDate)}.`}
      actions={
        <Link to="/print-qr" data-tour="qr-print-link" className={linkButtonClass}>
          <Printer aria-hidden="true" />
          Print
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {shown ? (
          <figure className="animate-reveal flex flex-col items-center gap-2">
            <img src={shown.url} alt={`Check-in QR code for ${formatDate(shown.date)}`} className="size-56 rounded-md border border-hairline-soft" />
            <figcaption className="text-sm text-muted">Print it for the notice board where staff arrive.</figcaption>
          </figure>
        ) : (
          <div className="flex size-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-hairline text-center text-muted">
            <QrCode className="size-10" strokeWidth={1.5} aria-hidden="true" />
            <p className="max-w-[18ch] text-sm">Show the code for {formatDate(viewDate)}</p>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-danger-700">{error}</p> : null}
        <Button onClick={generate} loading={loading} variant="secondary" data-tour="qr-generate-button">
          {loading ? null : <RefreshCw className="size-4" aria-hidden="true" />}
          {shown ? 'Refresh QR code' : 'Show QR code'}
        </Button>
      </div>
    </Panel>
  )
}

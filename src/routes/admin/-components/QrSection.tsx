import { Link } from '@tanstack/react-router'
import { Printer, QrCode, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/Button'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import { errorText, linkButtonClass, Panel } from './kit'

type Code = { token: string; image: string }

/** The department's permanent check-in QR code: print once, replace only if a photo of it leaks. */
export function QrSection({
  onLoad,
  onReplace,
}: {
  onLoad: () => Promise<Code>
  onReplace: () => Promise<Code>
}) {
  const [code, setCode] = useState<Code | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null)

  useEffect(() => {
    let cancelled = false
    onLoad().then(
      (c) => { if (!cancelled) setCode(c) },
      (e) => { if (!cancelled) setError(errorText(e, 'Could not load the QR code.')) },
    )
    return () => { cancelled = true }
    // Load once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const askReplace = () => setConfirm({
    title: 'Replace the check-in QR code?',
    message: 'Every printed poster stops working straight away, and staff phones will ask them to scan the new one. Only do this if a photo of the code has been shared.',
    confirmLabel: 'Replace code',
    confirmVariant: 'danger',
    onConfirm: async () => {
      setError('')
      try {
        setCode(await onReplace())
      } catch (e) {
        setError(errorText(e, 'Could not replace the QR code.'))
      }
    },
  })

  return (
    <Panel
      tour="qr-code"
      title="Check-in QR code"
      icon={<QrCode />}
      description="One permanent code for the department. Print it once for each entrance — it never changes unless you replace it."
      actions={
        <Link to="/print-qr" data-tour="qr-print-link" className={linkButtonClass}>
          <Printer aria-hidden="true" />
          Print poster
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {code ? (
          <figure className="animate-reveal flex flex-col items-center gap-2">
            <img src={code.image} alt="Check-in QR code" className="size-56 rounded-control border border-hairline-soft" />
            <figcaption className="text-center text-sm text-muted">
              Typed code{' '}
              <span className="font-mono font-semibold tracking-[0.12em] text-ink select-all">{code.token.replace(/(.{4})(?=.)/g, '$1 ')}</span>
            </figcaption>
          </figure>
        ) : (
          <div className="flex size-56 items-center justify-center rounded-control border border-dashed border-hairline text-muted">
            <QrCode className="size-10" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-danger-700">{error}</p> : null}
        <Button onClick={askReplace} variant="secondary" disabled={!code}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Replace code
        </Button>
      </div>
      {confirm ? <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} /> : null}
    </Panel>
  )
}

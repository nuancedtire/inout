import { Link } from '@tanstack/react-router'
import { Printer } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/Button'
import { DatePicker } from '#/components/DatePicker'

export function QrSection({
  viewDate,
  onDateChange,
  onGenerate,
}: {
  viewDate: string
  onDateChange: (date: string) => void
  onGenerate: (date: string) => Promise<string>
}) {
  const [qrUrl, setQrUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const dataUrl = await onGenerate(viewDate)
      setQrUrl(dataUrl)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="qr-code" data-tour="qr-code" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">QR code</h2>
        <Link
          to="/print-qr"
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="w-full sm:w-auto">
          <label className="text-xs block text-muted mb-1">Date</label>
          <DatePicker value={viewDate} onChange={onDateChange} className="py-2.5 px-4" />
        </div>
        <Button onClick={generate} loading={loading} variant="secondary">
          Generate / refresh QR
        </Button>
      </div>
      {qrUrl && (
        <div className="mt-4">
          <img src={qrUrl} alt="QR code" className="mx-auto max-w-full" />
          <p className="text-center text-sm text-neutral-600 mt-2">
            Print this and place it on the notice board.
          </p>
        </div>
      )}
    </section>
  )
}

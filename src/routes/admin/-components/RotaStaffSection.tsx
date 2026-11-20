import { useRef, useState } from 'react'
import { CircleCheck, Link2, Upload, UserPlus } from 'lucide-react'
import { Button } from '#/components/Button'
import { formatDate } from '#/utils/dateTime'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/motion/tabs'
import { FileUpload, type FileUploadItem } from '#/components/motion/file-upload'
import { inputClass } from './kit'

export type UploadSummary = { count: number; linked: number; unlinked: number; unparseableShifts: number; date: string }

export function RotaStaffSection({
  onUpload,
  onAdd,
  addLoading,
  date,
  today,
  lastUpload,
}: {
  onUpload: (file: File) => Promise<void>
  onAdd: (form: FormData) => Promise<boolean>
  addLoading: boolean
  date: string
  today: string
  lastUpload: UploadSummary | null
}) {
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  const doUpload = async (items: FileUploadItem[]) => {
    for (const item of items) {
      try {
        await onUpload(item.file)
        setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'success' } : i)))
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Upload failed'
        setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error } : i)))
      }
    }
  }

  const handleRetry = (item: FileUploadItem) => {
    setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', error: undefined } : i)))
    void doUpload([item])
  }

  const summary = lastUpload && lastUpload.date === date ? lastUpload : null

  return (
    <section id="rota-staff" className="min-w-0 rounded-lg border border-hairline-soft bg-canvas p-5 shadow-card">
      <Tabs variant="segment" defaultValue="upload">
        <TabsList className="mb-5 w-full">
          <TabsTrigger value="upload" className="min-h-10">
            <Upload className="size-4" aria-hidden="true" />
            Upload rota
          </TabsTrigger>
          <TabsTrigger value="add" data-tour="add-staff-tab" className="min-h-10">
            <UserPlus className="size-4" aria-hidden="true" />
            Add staff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" data-tour="rota-upload" className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Rota for {formatDate(date)}</h2>
            <p className="mt-0.5 text-sm text-muted text-pretty">
              The first sheet of an Excel allocation sheet, or a simple CSV/Excel with Name, Role and Shift columns. Uploading replaces
              this date’s rota while no one has checked in.{' '}
              <a href="/example-allocation-filled.xlsx" download className="font-semibold text-accent-accessible underline-offset-2 hover:underline">
                Example file
              </a>
            </p>
          </div>
          <FileUpload
            value={uploadItems}
            onValueChange={setUploadItems}
            onFilesAdded={doUpload}
            onRetry={handleRetry}
            accept=".xlsx,.xls,.csv"
            hint="Supports .xlsx, .xls, .csv"
          />
          {summary ? (
            <div role="status" className="animate-reveal flex flex-col gap-2 rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-4" aria-hidden="true" />
                {summary.count} staff uploaded
              </p>
              <p className="flex items-center gap-2 text-body">
                <Link2 className="size-4 shrink-0 text-success-800" aria-hidden="true" />
                {summary.linked} linked to staff profiles
                {summary.unlinked ? ` · ${summary.unlinked} not linked yet (below)` : ''}
              </p>
              {summary.unparseableShifts ? (
                <p className="text-warning-800">
                  {summary.unparseableShifts} {summary.unparseableShifts === 1 ? 'shift time' : 'shift times'} couldn’t be read. Edit them in
                  the roster.
                </p>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="add">
          <form
            ref={formRef}
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              if (await onAdd(new FormData(form))) form.reset()
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <h2 className="text-base font-semibold text-ink">Add someone to today’s rota</h2>
              <p className="mt-0.5 text-sm text-muted">
                For a locum or anyone missing from the upload. Always added to today{date !== today ? `, not ${formatDate(date)}` : ''}.
                Staff can also add themselves when they check in.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-muted">Name</span>
                <input name="name" required autoComplete="off" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-muted">Role <span className="font-normal">(optional)</span></span>
                <input name="role" autoComplete="off" placeholder="e.g. Registrar" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Shift start</span>
                <input name="shiftStart" placeholder="08:00" inputMode="numeric" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Shift end</span>
                <input name="shiftEnd" placeholder="20:00" inputMode="numeric" className={inputClass} />
              </label>
            </div>
            <Button type="submit" loading={addLoading} fullWidth>
              <UserPlus className="size-4" aria-hidden="true" />
              Add to today’s rota
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </section>
  )
}

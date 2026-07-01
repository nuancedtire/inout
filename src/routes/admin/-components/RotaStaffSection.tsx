import { useState, useRef } from 'react'
import { Upload, UserPlus, Loader2 } from 'lucide-react'
import { formatDate } from '#/utils/dateTime'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/motion/tabs'
import { FileUpload, type FileUploadItem } from '#/components/motion/file-upload'
import { ActionSwapButton } from '#/components/motion/action-swap'

export function RotaStaffSection({
  onUpload,
  onAdd,
  addLoading,
  date,
}: {
  onUpload: (file: File) => Promise<void> | void
  onAdd: (form: FormData) => Promise<void> | void
  addLoading: boolean
  date: string
}) {
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  const doUpload = async (items: FileUploadItem[]) => {
    for (const item of items) {
      try {
        await onUpload(item.file)
        setUploadItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'success' } : i)),
        )
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Upload failed'
        setUploadItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error } : i)),
        )
      }
    }
  }

  const handleRetry = (item: FileUploadItem) => {
    setUploadItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', error: undefined } : i)),
    )
    doUpload([item])
  }

  return (
    <section id="rota-staff" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <Tabs variant="segment" defaultValue="upload">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="upload">
            <Upload className="w-3.5 h-3.5" />
            Upload rota
          </TabsTrigger>
          <TabsTrigger value="add" data-tour="add-staff-tab">
            <UserPlus className="w-3.5 h-3.5" />
            Add staff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" data-tour="rota-upload">
          <p className="text-sm text-neutral-500 mb-1">for {formatDate(date)}</p>
          <p className="text-xs text-neutral-400 mb-3">
            Supports the allocation sheet format (.xlsx) or a simple CSV/Excel with Name, Role, Shift columns.{' '}
            <a href="/example-allocation-filled.xlsx" download className="text-primary-600 hover:underline">
              Download example
            </a>
          </p>
          <FileUpload
            value={uploadItems}
            onValueChange={setUploadItems}
            onFilesAdded={doUpload}
            onRetry={handleRetry}
            accept=".xlsx,.xls,.csv"
            hint="Supports .xlsx, .xls, .csv"
          />
        </TabsContent>

        <TabsContent value="add">
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault()
              onAdd(new FormData(e.currentTarget))
              e.currentTarget.reset()
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            <input
              name="name"
              placeholder="Name"
              required
              aria-label="Name"
              className="p-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
            <input
              name="role"
              placeholder="Role"
              aria-label="Role"
              className="p-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
            <input
              name="shiftStart"
              placeholder="Shift start (HH:MM)"
              aria-label="Shift start"
              className="p-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
            <input
              name="shiftEnd"
              placeholder="Shift end (HH:MM)"
              aria-label="Shift end"
              className="p-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
            <div className="sm:col-span-2">
              <ActionSwapButton
                type="submit"
                cycle={false}
                animation="blur"
                disabled={addLoading}
                value={addLoading ? 'loading' : 'idle'}
                items={[
                  {
                    value: 'idle',
                    content: (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Add staff
                      </>
                    ),
                  },
                  {
                    value: 'loading',
                    content: (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding…
                      </>
                    ),
                  },
                ]}
                className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
              />
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </section>
  )
}

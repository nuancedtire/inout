import * as React from 'react'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { Upload, CheckCircle2, XCircle, RefreshCw, X, FileSpreadsheet } from 'lucide-react'
import { EASE_OUT } from '#/lib/ease'

export type FileUploadStatus = 'queued' | 'uploading' | 'success' | 'error'

export interface FileUploadItem {
  id: string
  file: File
  name: string
  size: number
  status: FileUploadStatus
  error?: string
}

export function createFileUploadItem(file: File, index = 0): FileUploadItem {
  return {
    id: `${Date.now()}-${index}`,
    file,
    name: file.name,
    size: file.size,
    status: 'uploading',
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileUploadProps {
  value: FileUploadItem[]
  onValueChange: (items: FileUploadItem[]) => void
  onFilesAdded: (items: FileUploadItem[]) => void
  onRetry?: (item: FileUploadItem) => void
  onRemove?: (item: FileUploadItem) => void
  multiple?: boolean
  maxFiles?: number
  accept?: string
  className?: string
  hint?: string
}

export function FileUpload({
  value,
  onValueChange,
  onFilesAdded,
  onRetry,
  onRemove,
  multiple = false,
  maxFiles = 1,
  accept,
  className,
  hint,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArr = Array.from(files).slice(0, maxFiles)
    const items = fileArr.map((f, i) => createFileUploadItem(f, i))
    onValueChange(multiple ? [...value, ...items] : items)
    onFilesAdded(items)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleRemove = (item: FileUploadItem) => {
    onValueChange(value.filter((i) => i.id !== item.id))
    onRemove?.(item)
  }

  const showDropzone = value.length === 0 || multiple

  return (
    <MotionConfig reducedMotion="user">
      <div className={className}>
        <AnimatePresence initial={false}>
          {showDropzone && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload file — click or drag and drop"
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                className={`border-2 border-dashed rounded-control p-6 text-center cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  isDragOver
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-hairline hover:border-primary-300 hover:bg-surface-soft'
                }`}
              >
                <Upload
                  className={`w-6 h-6 mx-auto mb-2 transition-colors duration-150 ${isDragOver ? 'text-primary-500' : 'text-muted'}`}
                />
                <p className="text-sm font-medium text-ink">Drop file here or click to browse</p>
                {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
              </div>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept={accept}
                multiple={multiple}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {value.map((item) => (
            <FileUploadRow
              key={item.id}
              item={item}
              onRetry={onRetry}
              onRemove={() => handleRemove(item)}
            />
          ))}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

function FileUploadRow({
  item,
  onRetry,
  onRemove,
}: {
  item: FileUploadItem
  onRetry?: (item: FileUploadItem) => void
  onRemove: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="mt-3 flex items-center gap-3 p-3 rounded-control border border-hairline bg-canvas"
    >
      <FileSpreadsheet className="w-8 h-8 text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{item.name}</p>
        <p className="text-xs text-muted">{formatBytes(item.size)}</p>
        {item.status === 'error' && item.error && (
          <p className="text-xs text-danger-600 mt-0.5">{item.error}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <UploadStatusIcon status={item.status} />
        {item.status === 'error' && onRetry && (
          <button
            onClick={() => onRetry(item)}
            className="p-1.5 rounded-inner hover:bg-surface-soft text-muted hover:text-ink transition-colors"
            aria-label="Retry upload"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        {item.status !== 'uploading' && (
          <button
            onClick={onRemove}
            className="p-1.5 rounded-inner hover:bg-surface-soft text-muted hover:text-ink transition-colors"
            aria-label="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  )
}

function UploadStatusIcon({ status }: { status: FileUploadStatus }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === 'uploading' && (
        <motion.div
          key="uploading"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className="w-4 h-4 rounded-full border-2 border-primary-400 border-t-transparent animate-spin"
        />
      )}
      {status === 'success' && (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <CheckCircle2 className="w-4 h-4 text-success-600" />
        </motion.div>
      )}
      {status === 'error' && (
        <motion.div
          key="error"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <XCircle className="w-4 h-4 text-danger-600" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

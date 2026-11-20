import type { ReactNode } from 'react'
import { RunnerMark, type RunnerTone } from './RunnerMark'

export type WorkingIndicatorProps = {
  /** Short caption announced politely to screen readers, e.g. "Checking Face ID…". */
  label?: ReactNode
  /** Runner size in pixels. */
  size?: number
  tone?: RunnerTone
  /** `stack` centres the runner above the caption; `inline` sets them side by side. */
  layout?: 'stack' | 'inline'
  className?: string
}

/** In-progress state: the runner running, with an optional caption. */
export function WorkingIndicator({ label, size = 56, tone = 'brand', layout = 'stack', className }: WorkingIndicatorProps) {
  const stacked = layout === 'stack'
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center',
        stacked ? 'flex-col justify-center gap-3 text-center' : 'gap-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <RunnerMark size={size} animate="run" tone={tone} />
      {label ? (
        <p className="animate-reveal text-sm font-medium text-muted [animation-delay:120ms]">{label}</p>
      ) : (
        <span className="sr-only">Working…</span>
      )}
    </div>
  )
}

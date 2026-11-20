export type SpinnerProps = {
  /** Diameter in pixels. */
  size?: number
  className?: string
}

/** Compact inline progress for buttons and dense controls. Inherits `currentColor`; decorative. */
export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <svg
      className={['spinner shrink-0', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

import { Spinner } from './brand/Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = {
  children: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  className?: string
  'data-tour'?: string
}

// Filled variants use AA-contrast fills for white text (brand #ff385c is only 3.5:1).
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent-accessible text-white hover:bg-accent-accessible-hover',
  secondary: 'bg-canvas text-ink border border-hairline hover:border-ink/40 hover:bg-surface-soft',
  success: 'bg-success-accessible text-white hover:bg-success-800',
  warning: 'bg-warning-700 text-white hover:bg-warning-800',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  ghost: 'bg-transparent text-accent-accessible hover:bg-primary-50',
}

// sm keeps a compact 36px face for toolbars but extends its hit area to 44px.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 text-sm gap-1.5 relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
  md: 'min-h-11 px-5 text-sm gap-2',
  lg: 'min-h-13 px-6 text-base gap-2.5',
}

const spinnerSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  className = '',
  'data-tour': dataTour,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-tour={dataTour}
      className={[
        'ui-press inline-flex items-center justify-center rounded-control font-semibold leading-none select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed',
        loading ? 'cursor-progress' : 'disabled:opacity-45',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading ? <Spinner size={spinnerSize[size]} /> : null}
      {children}
    </button>
  )
}

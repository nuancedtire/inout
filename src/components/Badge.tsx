type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

type BadgeProps = {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

// Text colours all meet 4.5:1 on their tint.
const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-50 text-success-800 ring-success-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  info: 'bg-primary-50 text-accent-accessible ring-primary-200',
  neutral: 'bg-surface-strong text-body ring-hairline',
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-xs font-semibold leading-none tabular-nums whitespace-nowrap ring-1 ring-inset ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}

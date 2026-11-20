import { CalendarDays, ScanLine, AlertCircle, type LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: 'calendar' | 'scan' | 'alert' | React.ReactNode
  children?: React.ReactNode
}

const iconMap: Record<string, LucideIcon> = {
  calendar: CalendarDays,
  scan: ScanLine,
  alert: AlertCircle,
}

export function EmptyState({ title, description, icon = 'alert', children }: EmptyStateProps) {
  const IconComponent = typeof icon === 'string' ? iconMap[icon] ?? AlertCircle : null

  return (
    <div className="animate-reveal mx-auto max-w-sm py-10 px-4 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-canvas text-muted ring-1 ring-hairline-soft shadow-card [&_svg]:size-6"
      >
        {IconComponent ? <IconComponent strokeWidth={1.75} /> : icon}
      </div>
      <p className="text-base font-semibold text-ink text-balance">{title}</p>
      {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted text-pretty">{description}</p> : null}
      {children ? <div className="mt-5 flex justify-center">{children}</div> : null}
    </div>
  )
}

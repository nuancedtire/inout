type CardProps = {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export function Card({ children, className = '', title, action }: CardProps) {
  return (
    <section className={`bg-canvas rounded-lg border border-hairline-soft shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 border-b border-hairline-soft">
          {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : <div />}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

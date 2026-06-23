type CardProps = {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export function Card({ children, className = '', title, action }: CardProps) {
  return (
    <section
      className={`bg-white rounded-2xl border border-hairline ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline-soft">
          {title ? <h2 className="font-semibold text-ink">{title}</h2> : <div />}
          {action ? <div>{action}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

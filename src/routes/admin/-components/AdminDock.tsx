import { Link, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_LAYOUT } from '#/lib/ease'
import { cn } from '#/lib/utils'
import { useAdminContext } from '#/routes/admin/-context'
import { ADMIN_NAV, isActivePath } from './nav'
import { usePendingApprovals } from './pendingApprovals'

/** Bottom navigation below the sidebar breakpoint (768px), so one of the two is always visible. */
export function AdminDock() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const reduce = useReducedMotion()
  const { authToken } = useAdminContext()
  const pending = usePendingApprovals(authToken)

  return (
    <nav aria-label="Admin" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="border-t border-hairline-soft bg-canvas/90 backdrop-blur-xl pb-safe">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 pt-1.5">
          {ADMIN_NAV.map((item) => {
            const active = isActivePath(item, currentPath)
            const badge = item.to === '/admin/staff' && pending > 0 ? pending : 0
            return (
              <Link
                key={item.to}
                to={item.to}
                data-tour={`dock-${item.tourId}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 outline-none',
                  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
                  active ? 'text-accent-accessible' : 'text-muted hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="admin-dock-pill"
                    transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    className="absolute inset-x-1 inset-y-0.5 -z-10 rounded-md bg-primary-50"
                  />
                )}
                <span className="relative">
                  <item.icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.25 : 2} />
                  {badge ? (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-accessible px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-canvas">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className={cn('truncate text-[11px] leading-none', active ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                  {badge ? <span className="sr-only">, {badge} phones waiting for approval</span> : null}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

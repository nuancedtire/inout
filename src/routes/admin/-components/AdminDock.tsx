import { Link, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { LayoutDashboard, ClipboardList, Users, ScrollText } from 'lucide-react'
import { SPRING_LAYOUT } from '#/lib/ease'
import { cn } from '#/lib/utils'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', tourId: 'dock-dashboard' },
  { to: '/admin/roster', icon: ClipboardList, label: 'Roster', tourId: 'dock-roster' },
  { to: '/admin/sessions', icon: Users, label: 'Sessions', tourId: 'dock-sessions' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit', tourId: 'dock-audit' },
]

export function AdminDock() {
  const router = useRouterState()
  const currentPath = router.location.pathname
  const reduce = useReducedMotion()

  // Use a stable id for the active pill shared layout animation
  const pillId = 'admin-dock-pill'

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 sm:hidden">
      {/* Safe-area aware backdrop */}
      <div className="border-t border-hairline bg-canvas/85 backdrop-blur-xl pb-safe">
        <div className="flex items-center justify-around px-2 pt-1 pb-2">
          {navItems.map((item) => {
            const active =
              item.to === '/admin'
                ? currentPath === '/admin'
                : currentPath.startsWith(item.to)

            return (
              <Link
                key={item.to}
                to={item.to}
                data-tour={item.tourId}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl outline-none min-w-0',
                  'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                  active ? 'text-primary-500' : 'text-muted',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId={pillId}
                    transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    className="absolute inset-0 -z-10 rounded-xl bg-primary-50"
                  />
                )}
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

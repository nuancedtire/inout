import { Link, useRouterState } from '@tanstack/react-router'
import { useId } from 'react'
import { motion, MotionConfig } from 'motion/react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '#/components/ui/sidebar'
import { useIsMobile } from '#/hooks/use-mobile'
import { PanelLeftClose, HelpCircle } from 'lucide-react'
import { Wordmark } from '#/components/brand/Wordmark'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { SPRING_LAYOUT } from '#/lib/ease'
import { useTour } from '#/lib/tour/TourContext'
import { useAdminContext } from '#/routes/admin/-context'
import { ADMIN_NAV, isActivePath } from './nav'
import { usePendingApprovals } from './pendingApprovals'

export function AppSidebar() {
  const isMobile = useIsMobile()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const { setOpen } = useSidebar()
  const navId = useId()
  const { start } = useTour()
  const { authToken } = useAdminContext()
  const pending = usePendingApprovals(authToken)

  // On phones the AdminDock handles navigation.
  if (isMobile) return null

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Collapsed: the runner alone; clicking it expands the sidebar. */}
        <button
          className="hidden w-full items-center justify-center rounded-md py-4 group-data-[collapsible=icon]:flex focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => setOpen(true)}
          aria-label="Expand sidebar"
        >
          <RunnerMark size={36} animate="none" />
        </button>
        <div className="flex items-center gap-2 px-3 pb-3 pt-4 group-data-[collapsible=icon]:hidden">
          <Wordmark size="sm" label="InOut admin" />
          <span className="ml-1 rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Admin
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setOpen(false)}
            aria-label="Collapse sidebar"
            className="ui-press flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <MotionConfig reducedMotion="user">
              <SidebarMenu className="gap-1">
                {ADMIN_NAV.map((item) => {
                  const active = isActivePath(item, currentPath)
                  const badge = item.to === '/admin/staff' && pending > 0 ? pending : 0
                  return (
                    <SidebarMenuItem key={item.to}>
                      {active && (
                        <motion.span
                          layoutId={`${navId}-nav-ind`}
                          transition={SPRING_LAYOUT}
                          className="absolute inset-0 rounded-md bg-sidebar-accent"
                        />
                      )}
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={badge ? `${item.label} · ${badge} waiting` : item.label}
                        className="relative z-10 h-11 font-medium text-body data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-accent-accessible"
                      >
                        <Link to={item.to} data-tour={`nav-${item.tourId}`} aria-current={active ? 'page' : undefined}>
                          <span className="relative flex">
                            <item.icon className="size-5" aria-hidden="true" />
                            {badge ? (
                              <span
                                aria-hidden="true"
                                className="absolute -right-1 -top-1 hidden size-2.5 rounded-full bg-accent-accessible ring-2 ring-canvas group-data-[collapsible=icon]:block"
                              />
                            ) : null}
                          </span>
                          <span className="flex-1">{item.label}</span>
                          {badge ? (
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-accessible px-1.5 text-[11px] font-bold tabular-nums text-white group-data-[collapsible=icon]:hidden">
                              {badge}
                              <span className="sr-only"> phones waiting for approval</span>
                            </span>
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </MotionConfig>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <button
            onClick={start}
            className="ui-press flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
            Replay the tour
          </button>
        </div>
        <button
          onClick={start}
          aria-label="Replay the tour"
          className="hidden w-full items-center justify-center rounded-md py-3 text-muted hover:text-ink group-data-[collapsible=icon]:flex focus-visible:outline-2 focus-visible:outline-focus"
        >
          <HelpCircle className="size-5" aria-hidden="true" />
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}

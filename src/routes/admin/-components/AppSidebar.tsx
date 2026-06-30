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
import { LayoutDashboard, ClipboardList, Users, ScrollText, PanelLeftClose } from 'lucide-react'
import { Logo } from '#/components/Logo'
import { SPRING_LAYOUT } from '#/lib/ease'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/roster', icon: ClipboardList, label: 'Roster' },
  { to: '/admin/sessions', icon: Users, label: 'Sessions' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit' },
]

export function AppSidebar() {
  const isMobile = useIsMobile()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const { setOpen } = useSidebar()
  const navId = useId()

  // On mobile the AdminDock handles navigation — no sidebar needed
  if (isMobile) return null

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* In(Logo)Out lockup */}
        {/* Collapsed: logo centered, clicking it expands the sidebar */}
        <button
          className="group-data-[collapsible=icon]:flex hidden w-full items-center justify-center py-5 cursor-pointer"
          onClick={() => setOpen(true)}
          aria-label="Expand sidebar"
        >
          <Logo size={48} variant="rausch" />
        </button>
        {/* Expanded: In + Logo + Out + collapse button */}
        <div className="group-data-[collapsible=icon]:hidden flex items-center gap-0 px-5 py-5">
          <span className="text-3xl font-bold text-ink tracking-tight leading-none">In</span>
          <Logo size={56} variant="rausch" className="-mx-1.5" />
          <span className="text-3xl font-bold text-ink tracking-tight leading-none">Out</span>
          <div className="flex-1" />
          <button
            onClick={() => setOpen(false)}
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-surface-soft transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <MotionConfig reducedMotion="user">
              <SidebarMenu>
                {navItems.map((item) => {
                  const active =
                    item.to === '/admin'
                      ? currentPath === '/admin'
                      : currentPath.startsWith(item.to)
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
                        tooltip={item.label}
                        className="relative z-10 data-[active=true]:bg-transparent"
                      >
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
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
        <div className="px-3 py-3 group-data-[collapsible=icon]:hidden">
          <p className="text-xs text-muted">v1.0</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

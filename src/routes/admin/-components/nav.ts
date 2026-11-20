import { LayoutDashboard, ClipboardList, ListChecks, UsersRound, ScrollText, type LucideIcon } from 'lucide-react'

export type AdminPath = '/admin' | '/admin/roster' | '/admin/sessions' | '/admin/staff' | '/admin/audit'

export type AdminNavItem = {
  to: AdminPath
  icon: LucideIcon
  label: string
  /** Page heading in the top bar. */
  title: string
  /** Pages whose content depends on the date chosen in the top bar. */
  dated: boolean
  /** Suffix for the tour anchors: `nav-<id>` in the sidebar, `dock-<id>` in the dock. */
  tourId: string
}

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', title: 'Dashboard', dated: true, tourId: 'dashboard' },
  { to: '/admin/roster', icon: ClipboardList, label: 'Roster', title: 'Roster', dated: true, tourId: 'roster' },
  { to: '/admin/sessions', icon: ListChecks, label: 'Sessions', title: 'Sessions', dated: true, tourId: 'sessions' },
  { to: '/admin/staff', icon: UsersRound, label: 'Staff', title: 'Staff & phones', dated: false, tourId: 'staff' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit', title: 'Audit log', dated: false, tourId: 'audit' },
]

export function isActivePath(item: AdminNavItem, pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return item.to === '/admin' ? path === '/admin' : path === item.to || path.startsWith(`${item.to}/`)
}

export function navItemFor(pathname: string) {
  return ADMIN_NAV.find((item) => isActivePath(item, pathname))
}

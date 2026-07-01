// Bump this when step content changes meaningfully, so admins who've already
// seen the tour are re-prompted for the new material.
export const TOUR_VERSION = 1

export type TourStep = {
  id: string
  path: '/admin' | '/admin/roster' | '/admin/sessions' | '/admin/audit'
  /** CSS selectors to try in order; the first visible match is highlighted. Null renders a centered card with no spotlight. */
  target: string[] | null
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    path: '/admin',
    target: null,
    title: 'Welcome to InOut Admin',
    body: "This quick tour walks through the daily workflow: uploading the rota, watching who's checked in, editing sessions, and reviewing the audit trail. Takes about a minute — skip anytime.",
  },
  {
    id: 'stat-cards',
    path: '/admin',
    target: ['[data-tour="stat-cards"]'],
    title: 'Today at a glance',
    body: "These cards show who's on the rota, who's checked in, and who's still on site right now — updated live as staff scan the QR code.",
  },
  {
    id: 'daily-summary',
    path: '/admin',
    target: ['[data-tour="daily-summary"]'],
    title: 'Daily summary',
    body: "Spot problems fast: anyone who hasn't checked in, anyone overdue to check out, and late arrivals or early departures flagged against their rota'd shift times.",
  },
  {
    id: 'who-is-in',
    path: '/admin',
    target: ['[data-tour="who-is-in"]'],
    title: 'Who is in',
    body: 'A live list of everyone currently checked in, with how long ago they arrived — the fastest way to see who is actually on the ward right now.',
  },
  {
    id: 'nav-roster',
    path: '/admin',
    target: ['[data-tour="nav-roster"]', '[data-tour="dock-roster"]'],
    title: 'Next: Roster',
    body: 'The Roster page is where you upload the daily rota, register locums and ad-hoc staff, and manage everyone scheduled for the day. Click Next to head there.',
  },
  {
    id: 'qr-code',
    path: '/admin/roster',
    target: ['[data-tour="qr-code"]'],
    title: 'The check-in QR code',
    body: 'Generate the daily QR code here and print it (via the Print link) for the notice board. Staff scan it with their phone to check in and out — no app required.',
  },
  {
    id: 'rota-upload',
    path: '/admin/roster',
    target: ['[data-tour="rota-upload"]'],
    title: 'Upload the daily rota',
    body: "Drop in the ward's Excel/CSV rota and the system parses names, roles, and shift times automatically. This becomes the source of truth for who's expected today.",
  },
  {
    id: 'add-staff-tab',
    path: '/admin/roster',
    target: ['[data-tour="add-staff-tab"]'],
    title: 'Registering a locum',
    body: "Not everyone is on the uploaded rota. This tab adds a locum or ad-hoc staff member by hand — they'll appear on today's roster immediately and can check in straight away.",
  },
  {
    id: 'roster-table',
    path: '/admin/roster',
    target: ['[data-tour="roster-table"]'],
    title: 'The roster',
    body: "Everyone scheduled for the day, with live in/out times and status. Edit or remove an entry, check someone out manually, run auto-checkout for anyone who forgot, or export the day's data to CSV.",
  },
  {
    id: 'weekly-rollup',
    path: '/admin/roster',
    target: ['[data-tour="weekly-rollup"]'],
    title: 'Weekly hours',
    body: 'A Monday-to-Sunday breakdown of hours worked per person — handy for payroll or rota-planning conversations without exporting anything.',
  },
  {
    id: 'nav-sessions',
    path: '/admin/roster',
    target: ['[data-tour="nav-sessions"]', '[data-tour="dock-sessions"]'],
    title: 'Next: Sessions',
    body: 'The Sessions page lists every check-in/check-out pair for the day, so you can fix a mistaken time or remove a duplicate.',
  },
  {
    id: 'session-history',
    path: '/admin/sessions',
    target: ['[data-tour="session-history"]'],
    title: 'Session history',
    body: 'Each row is one check-in/check-out pair. Edit the times if someone forgot to scan, or delete a session entirely — every change is written to the audit log.',
  },
  {
    id: 'nav-audit',
    path: '/admin/sessions',
    target: ['[data-tour="nav-audit"]', '[data-tour="dock-audit"]'],
    title: 'Next: Audit',
    body: "Finally, the Audit page — an immutable record of everything that's happened today.",
  },
  {
    id: 'audit-log',
    path: '/admin/audit',
    target: ['[data-tour="audit-log"]'],
    title: 'Audit log',
    body: "Every check-in, check-out, edit, and rota upload is logged here with who did it and when. Nothing can be altered after the fact — it's the record of truth if a shift is ever queried.",
  },
  {
    id: 'finish',
    path: '/admin/audit',
    target: null,
    title: "You're set",
    body: 'That covers the full admin workflow. Replay this tour anytime from the Help button in the sidebar, or the ? button on mobile.',
  },
]

// Bump this when step content changes meaningfully, so admins who've already
// seen the tour are re-prompted for the new material.
export const TOUR_VERSION = 4

export type TourStep = {
  id: string
  path: '/admin' | '/admin/roster' | '/admin/sessions' | '/admin/staff' | '/admin/audit'
  /**
   * CSS selectors to try in order; the first visible match is highlighted. Null renders a centered card with no spotlight.
   * Steps only ever point at things: every step advances with Next, never by making the admin press a page control.
   */
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
    body: "This quick tour walks through the daily workflow: uploading the rota, reviewing flagged check-ins, approving staff phones, setting the department area and the audit trail. About two minutes — skip anytime.",
  },
  {
    id: 'stat-cards',
    path: '/admin',
    target: ['[data-tour="stat-cards"]'],
    title: 'Today at a glance',
    body: "Who's on the rota, who's checked in, who's on site now, and how many sessions were verified. Reload the page for the latest numbers.",
  },
  {
    id: 'needs-review',
    path: '/admin',
    target: ['[data-tour="needs-review"]'],
    title: 'Needs review',
    body: 'Check-ins are never blocked. When a phone is not yet approved, someone picked their name without Face ID, or the location check did not pass, the session is flagged here with the reason. Tap Accept and add a short note once you are happy.',
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
    body: "This is how staff check in — just a phone camera, no app store. It's one permanent code: print it once. Replace it only if a photo of it is being shared.",
  },
  {
    id: 'qr-print',
    path: '/admin/roster',
    target: ['[data-tour="qr-print-link"]'],
    title: 'Print it for the notice board',
    body: "Print a clean poster with a large QR code and the typed code, and put one up at each staff entrance. After the first scan, phones remember it.",
  },
  {
    id: 'rota-upload',
    path: '/admin/roster',
    target: ['[data-tour="rota-upload"]', '#rota-staff'],
    title: 'Upload the daily rota',
    body: "Drop in the Excel/CSV rota and InOut reads names, roles and shift times. Names that exactly match one staff profile are linked automatically; anything unclear is listed for you to link.",
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
    body: "Everyone scheduled for the day, with in/out times, status and verification. Edit or remove an entry, check someone out, run auto-checkout, or export the day to CSV — the export includes identity, location check and review columns.",
  },
  {
    id: 'weekly-rollup',
    path: '/admin/roster',
    target: ['[data-tour="weekly-rollup"]'],
    title: 'Weekly hours',
    body: 'A Monday-to-Sunday breakdown of hours worked per person, with a mark showing whether each day was verified, flagged or accepted.',
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
    body: 'Each row is one check-in/checkout pair with its verification. Tap the badge to see the evidence, filter to what needs review, edit times or delete a session — every change is logged.',
  },
  {
    id: 'nav-staff',
    path: '/admin/sessions',
    target: ['[data-tour="nav-staff"]', '[data-tour="dock-staff"]'],
    title: 'Next: Staff & phones',
    body: 'Staff link their phone once with Face ID or fingerprint. The Staff page is where you approve those phones and manage profiles.',
  },
  {
    id: 'approvals',
    path: '/admin/staff',
    target: ['[data-tour="approvals"]'],
    title: 'Approve new phones',
    body: "Each new phone waits here. Approve it once you know it's really theirs; a second phone for the same person is called out so you can check with them.",
  },
  {
    id: 'location-tab',
    path: '/admin/staff',
    target: ['[data-tour="location-tab"]'],
    title: 'Department area',
    body: "Set the area once, standing in the department: take a few readings, choose the radius, then test from the corners. Only the department's centre is stored — never staff positions.",
  },
  {
    id: 'nav-audit',
    path: '/admin/staff',
    target: ['[data-tour="nav-audit"]', '[data-tour="dock-audit"]'],
    title: 'Next: Audit',
    body: 'Finally, the Audit page — a record of everything that has happened.',
  },
  {
    id: 'audit-log',
    path: '/admin/audit',
    target: ['[data-tour="audit-log"]'],
    title: 'Audit log',
    body: "Every check-in, phone approval, acceptance, edit and rota upload is logged in plain English with who did it and when. Nothing can be altered after the fact — it's the record of truth if a shift is ever queried.",
  },
  {
    id: 'finish',
    path: '/admin/audit',
    target: null,
    title: "You're set",
    body: 'That covers the full admin workflow. Replay this tour anytime from the Help button in the sidebar, or the ? button on mobile.',
  },
]

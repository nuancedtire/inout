# UI Polish Log

## 2026-06-19

- QR page (`src/routes/qr.tsx`): replaced `window.location.href` full-page reload with TanStack `useNavigate` search-param navigation; removed `useSearch` cast by using `Route.useSearch()`; default date now uses UK `todayDate()`; added clearer QR-generation loading placeholder.
- Created shared date/time formatter (`src/utils/dateTime.ts`) with UK timezone, human-readable formats, relative time, and duration helpers.
- Replaced raw ISO timestamps across admin: Who is in, Session history, Audit log, CSV export.
- Redesigned audit log: event labels, actor badges, color-coded chips, collapsible JSON details, relative timestamps.
- Added admin PIN persistence via `localStorage` with unlock/lock UI and auto-refresh on login.
- Added loading states and auto-dismissing, closable message banners on admin and staff pages.
- Staff page now remembers last selected name and shows relative check-in time.
- Updated server-side `todayDate()` to Europe/London timezone instead of UTC.
- Seeded local D1 with 80 simulated staff and 63 sessions for UI/load testing.
- Added sticky section nav on admin page: 7-section quick-jump bar with `overflow-x-auto` for mobile.
- Added error boundaries / fallback UI (`src/components/ErrorFallback.tsx`, `src/components/EmptyState.tsx`) wired into root and all routes; added retry-capable refresh error banner on admin; added QR generation error state; replaced plain empty copy with `EmptyState` components on admin and staff pages; disabled Export CSV when roster is empty.
- Staff check-in page (`src/routes/index.tsx`): removed the unsafe `useSearch({ from: '/' }) as { token?: string }` cast by adding `validateSearch` to the route and using typed `Route.useSearch()`; `token` now defaults to `''` when absent. Build healthy.
- Split `src/routes/admin.tsx` (~757 lines) into focused route components: `AdminHeader`, `MessageBanner`, `RefreshError`, `SectionNav`, `UploadRotaSection`, `QrSection`, `AddStaffSection`, `WhoIsInSection`, `RosterSection`, `SessionSection`, `AuditLogSection`, plus shared `-hooks.ts` and `-types.ts`. Reduced `admin.tsx` to ~270 lines of orchestration logic. Preserved all behavior, loading states, inline editing, and auto-dismiss banners. Build healthy; dev server returns 200.

## 2026-06-19 (manual pass)

- **Fixed JSON parse crash**: malformed `{date:...}` audit row from an old simulation run caused `adminGetAuditLog` to throw, breaking the whole dashboard. Made `JSON.parse` defensive (`safeJsonParse`) so one bad row can't crash the admin page; fixed the bad row in local D1.
- **Added day-by-day exploration**: admin page now has a date picker with previous/next buttons and a "Today" jump. All data loads (roster, who's in, sessions) and upload/export respect the selected date.
- **Design system**: created `src/theme.css` with Tailwind v4 tokens (primary, success, warning, danger, neutral palettes; typography; radius; shadows). Updated `src/styles.css` to import it and set global focus/transition defaults.
- **Shared components**: added `Button`, `Card`, `Badge`; refactored staff page and all admin sections to use them.
- **Mobile-first admin**: roster and session tables now render as cards on small screens and tables on desktop; section nav is sticky and horizontally scrollable; stats cards summarize on-rota / checked-in / currently-in counts.
- **Icons**: added Lucide icons to headers, buttons, empty states, and action links.
- **Re-seeded simulation**: 100 staff, 80 sessions for load testing.

## 2026-06-19 (cron run)

- UI polish pass complete — no remaining items. All UI/UX items from AUDIT.md (timestamps, audit log, admin login UX, loading states, message toasts, mobile layout/navigation, form polish, empty/error states, QR page UX, admin page UX) have been addressed. Remaining audit items are security/auth/backend architecture or low-priority cleanup, which this cron job skips per instructions.

## 2026-06-19 (cron run)

- QR page (`src/routes/qr.tsx`): replaced hardcoded `gray-*` utility colors with design-system tokens (`neutral-*`, `primary-*`); added accessible `htmlFor`/`id` pairing for the date picker and consistent input focus styling; swapped the plain emoji error icon for the shared `alert` EmptyState icon; improved the QR loading placeholder to a branded skeleton with a `QrCode` icon, rounded corners, and shadow on the generated QR image. Build healthy; dev server restarted and returns 200.

## 2026-06-20 (cron run — feature expansion)

- **Item 6 — `getText` missing `cell.v` fallback** (`src/utils/rotaParser.ts:22`): Added `typeof cell === 'object' && 'v' in cell` check to `getText()`. Formula-result cells in XLSX files (which have `{v: "value"}` but no `w` property) previously fell through to `String(cell)` → `"[object Object]"`. Now they correctly return `String(cell.v).trim()`. Build healthy.

- **Item 1 — Late/early flagging on admin dashboard**: Added late check-in (>15 min after shift_start) and early check-out (>15 min before shift_end) visual flags. `RosterSection.tsx`: now accepts `viewDate` prop, computes late/early per-entry, shows `⚠ Late` / `⚠ Early` badges inline next to check-in/out times in both desktop table and mobile card views. `AttendanceSummary.tsx`: now accepts `entries` + `viewDate` props, computes and displays "Late arrivals" and "Early departures" summary boxes (5-column grid on lg screens). `admin.tsx`: passes `viewDate` and `entries` to both components. Also incidentally completed items 9 (`parseShiftTime`/`addDays` moved to `dateTime.ts`). omp was unresponsive (2 attempts, no file changes); implemented directly via Hermes tools. Build healthy.

## 2026-06-21 (cron run — feature expansion: #7 widen rota parser roles)

- **Item #7 — Widen rota parser role detection** (`src/utils/rotaParser.ts:28`): Added 16 missing NHS role categories to `looksLikeTier` regex: Physiotherapists, Pharmacists, Radiographers, Paramedics, OTs, SALTs, Midwives, Porters, Domestics, Catering, Security, Phlebotomists, Healthcare Scientists, Physician Associates, Anaesthetists, Surgeons, Psychologists, Social Workers. Each gets the optional `s?` suffix for singular/plural matching. Build healthy.

## 2026-06-21 (cron run — #12: PWA / offline resilience)

- **Item #12**: Customized `public/manifest.json` (name: "Attendance QR", short_name: "Attendance", theme_color: "#2563eb"). Created `public/sw.js` with cache-first for static assets (JS/CSS/images/fonts) and network-first for navigation/API calls; offline navigation returns a styled fallback HTML page. Added service worker registration script to `__root.tsx` RootDocument shell (gated on `'serviceWorker' in navigator`). Build healthy.
- **Audit**: Marked #17 (cron stale prompt) as ~done~ — consolidated cron prompt is active, plan file never created. No POLISH_LOG entries to prune (all within 15 days).



## 2026-06-20 (item #2 — Staff check-in history)

- **New server function `getStaffHistory`** in `sessions.functions.ts`: QR-token-gated query joining sessions → roster_entries → rotas to return all completed sessions for a staff member across all dates. Returns `{ date, shiftStart, shiftEnd, checkInAt, checkOutAt, hours }` ordered by most recent first. Hours computed via `julianday` same as `adminExportSessions`.
- **New route `/history`** (`src/routes/history.tsx`): staff-facing page showing personal check-in history. Reuses `useStaffIdentity` hook for identity persistence, `IdentityBar` + identity picker modal, `EmptyState` for no-token/no-data states. Each session card shows date, shift, in/out times, and total hours. Back link to check-in page.
- **Added "View my history →" link** on staff page (`index.tsx`), after the locum section.
- No DB schema changes needed (uses existing tables).
- Build healthy; typecheck clean (pre-existing errors only).

## 2026-06-20 — Weekly rollup (AUDIT.md #3)

- Added `getWeekStart(date)` to `dateTime.ts` — returns Monday of the week containing `date`.
- Added `adminWeeklyRollup` server function in `sessions.functions.ts` — groups completed sessions by staff+date for a given week range, returns hours via `(julianday(check_out_at) - julianday(check_in_at)) * 24`.
- Created `WeeklyRollupSection` component — pivot table with staff names as rows, Mon-Sun as columns, total column. Follows `viewDate`'s week. Loading/error/empty states.
- Wired into admin page and `SectionNav` as "Hours".

## 2026-06-20 — ConfirmDialog (AUDIT.md #4)

- Created `src/components/ConfirmDialog.tsx` — modal with overlay, centered card, AlertTriangle icon, cancel/confirm buttons. Uses `confirmVariant` (danger|warning) for icon + button styling, loading state on confirm.
- Replaced 3 `window.confirm()` calls in `admin.tsx` (`handleDeleteSession`, `handleDeleteEntry`, `handleAutoCheckout`) with `ConfirmDialog` state. Confirm calls stored async handler; dialog closes after handler resolves.
- Build healthy.

## 2026-06-20 — Shift validation warnings (AUDIT.md #5)

- `rotaParser.ts` already propagated `rawShift` on `ParsedEntry` entries — no change needed.
- `rotas.functions.ts` `uploadRota` handler: counts entries where `rawShift` is set but `shiftStart` is null (unparseable shift times), returns `unparseableShifts` in the response.
- `admin.tsx` `handleUpload`: shows warning message with count when `unparseableShifts > 0`, e.g. "Uploaded 45 staff (⚠ 3 had unparseable shift times)".
- Build healthy.

## 2026-06-21 — Extract shared withLoading hook (AUDIT.md #8)

- Created `src/hooks/useLoading.ts` with `useLoading()` hook returning `{ loading: Record<string, boolean>, withLoading }`. Uses `useCallback` for stable reference.
- Updated `src/routes/admin.tsx`: replaced inline `useState<Record<string, boolean>>` + `withLoading` function with `const { loading, withLoading } = useLoading()`.
- Removed duplicate inline implementation. All 12 `withLoading(key, fn)` call sites in admin.tsx remain unchanged.
- Build healthy.

- Already completed by prior cron run. `SessionEditForm.tsx` exists with `checkInAt`, `checkOutAt`, `onChange`, `onSave`, `onCancel`, `className`, `inputClassName` props.
- Used in both desktop table (`className="flex flex-wrap gap-2 items-center"`) and mobile cards (`className="space-y-2 mt-3" inputClassName="w-full"`) in `SessionSection.tsx`.
- Build healthy, no duplicate markup remaining.

## 2026-06-21 — Self-upgrading overhaul (#10, #13, #14, #15, #16, #17)

- **Item #15 (CRITICAL)** — `requireAdmin` auth bypass: `requireAdmin()` in `src/utils/auth.ts:99` never threw on auth failure, silently returning undefined. Every admin endpoint was unauthenticated. Fixed by adding `throw new Error('Unauthorized: invalid or expired admin credentials')`.
- **Item #10** — Rate limiting: in-memory 3-second window per entry+action key added to `checkIn`, `checkOut`, `undoLastAction` in `src/utils/sessions.functions.ts`.
- **Item #13** — Audit log pruning: `adminPruneAuditLog` server function added. Deletes entries older than configurable `retentionDays` (default 90). Admin-only.
- **Item #14** — CSV library: replaced naive `replace(/"/g, '""')` escaping with `papaparse` (`Papa.unparse`) in `src/routes/api/export[.]csv.ts`.
- **Item #16** — Stale AGENTS.md: updated project structure, removed obsolete "Next steps" section.
- **Item #17** — Self-upgrading cron: cron job `cd2592bf56f1` rewritten with two-phase prompt (discovery + implementation via GitHub issues/PRs). GitHub repo `nuancedtire/attendance-qr-cf` created with 6 control labels (`needs-triage`, `auto-fix`, `wont-fix`, `in-progress`, `ready-to-merge`, `question`). ADR-006 added to `docs/adr/`. CONTEXT.md updated with label taxonomy. `AUDIT.md` updated with corrected counters and all changes.
- `.gitignore` updated with `.dev.vars` and `.cta.json`.
- Build healthy.

## 2026-06-21 (cron run — self-upgrading Phase A+B)

**Phase A — Discovery:** Scanned all 8 categories across the codebase. Verified all 17 AUDIT.md items as genuinely done. Discovered 11 new issues:
- #1–#3: doc-code drift (about.tsx scaffold, CSV naive escape, NotFoundPage tokens)
- #4–#5: dead code (Header/Footer/ThemeToggle, getRecentAudit + individual admin endpoints)
- #6: error handling (missing .catch on staff fetches)
- #7–#9: accessibility (form labels, ARIA modals, SlideButton keyboard)
- #10: security (getStatus rate limiting)
- #11: performance (missing audit_log.created_at index)

Issues #1–#6 filed with `auto-fix`; #7–#11 filed as `needs-triage` only.

**Phase B — Implementation (#1):** Replaced `about.tsx` TanStack scaffold starter text with Attendance QR-specific content: project description, how-it-works steps, stack info, GitHub link. Uses design-system tokens from `theme.css` and Lucide icons. Build healthy. PR #12 opened.

## 2026-06-21 (cron run 2 — self-upgrading Phase A+B)

**Phase A — Verification:** Reopened #1 (about.tsx scaffold content) then discovered it was already fixed by a commit on main — closed again. Verified #2–#11 all valid. Scanned for new issues across all 8 categories — found 2: #13 (AGENTS.md doc-code drift) and #14 (dead CSS animations). Human had added `auto-fix` to #7–#11.

**Phase B — Implementation (3 PRs):**

- **PR #15 — Dead code cleanup (#4, #5, #13, #14):** Deleted Header.tsx, Footer.tsx, ThemeToggle.tsx (dead scaffold components). Removed `getRecentAudit` from audit.ts and 4 unused individual admin query endpoints from sessions.functions.ts. Updated AGENTS.md to list only existing components (removed non-existent AddStaffSection/UploadRotaSection, removed deleted Header/Footer/ThemeToggle). Removed ~100 lines of dead CSS slide animation classes from styles.css. 7 files changed, 340 lines deleted. Build ✅.

- **PR #16 — Client fixes + infra (#2, #3, #10, #11):** Replaced naive `replace(/"/g, '""')` CSV escaping in admin.tsx with `Papa.unparse`. Replaced hardcoded Tailwind classes (gray-*, blue-*) in NotFoundPage and body with design tokens (neutral-*, primary-*). Added `checkRateLimit` to getStatus endpoint (3s window, matching existing pattern). Added `idx_audit_created` index on audit_log.created_at in both schema.ts and migration file. 5 files changed. Build ✅.

- **PR #17 — Error handling + accessibility (#6, #7, #8, #9):** Added `.catch()` handlers to getStatus (index.tsx) and getStaffHistory (history.tsx) with user-visible error messages. Added loadError state and error banner to history page. Added `aria-label` to 8 unlabelled inputs across admin.tsx, index.tsx, print-qr.tsx, RotaStaffSection.tsx. Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to 4 modal dialogs (identity picker and PIN entry in index.tsx and history.tsx). Added `role="alertdialog"` to ConfirmDialog. Added `aria-label="Close"` to modal close buttons and `aria-label="Dismiss"` to message toast button. Added keyboard navigation (ArrowLeft/Right, Home/End) and ARIA slider attributes (role, valuenow, valuemin, valuemax, valuetext) to SlideButton component. 7 files changed, 132 insertions. Build ✅.

**Summary:** 11 of 11 auto-fix issues processed across 3 PRs. Issue #1 resolved by human merge. All builds passing.

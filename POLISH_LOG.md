# InOut — Change and Polish Log

## 2026-10-17 — pnpm-only migration

- Supersedes the npm toolchain recorded in the earlier refresh below. Pinned pnpm 12.11.2, imported the verified resolutions into `pnpm-lock.yaml`, removed `package-lock.json` and npm-only settings, and converted the deploy script and current documentation to pnpm.
- Moved engine enforcement, explicit build permissions, and the scoped esbuild override to `pnpm-workspace.yaml`. Kept version-specific release-age exceptions for the already-verified imported packages. Intent remains the skill loader; pnpm's duplicate skill linker is disabled.
- Added an install guard that rejects other package managers. Recreated `node_modules` with `pnpm install --frozen-lockfile` to verify a clean pnpm installation.
- Corrected an unrelated manual-check-in test fixture that supplied valid defaults for its allegedly empty input; empty-object rejection is now tested directly.
- Verification: clean frozen pnpm install, both TypeScript projects, production build, and Intent discovery/loading pass; all 55 tests pass across 9 files; `pnpm audit` reports no known vulnerabilities. The existing non-fatal CSS sourcemap warning remains.
- Earlier npm commands and verification below are historical; current setup instructions are in README.md and AGENTS.md.

## 2026-10-17 — Dependency refresh and documentation review

- Upgraded current stable runtime and development dependencies, including React 19.3, Motion 14, TypeScript 7, Vitest 5, and jsdom 30. SheetJS now uses its official 0.20.3 tarball; a scoped override fixes Drizzle Kit's legacy esbuild. Removed unused devtools adapters and typography. npm audit: 0 vulnerabilities.
- Added the npm lockfile, Node 24/npm 12 constraints, explicit install-script policy, Vite hot-reload development command, built-Worker command, and combined typecheck command.
- Updated package-provided TanStack skills with their dependencies, installed Intent 0.5.5, added its explicit source allowlist, and regenerated the managed AGENTS.md instructions. No project-authored skills directory exists.
- Corrected shadcn's RSC/icon metadata. Inspected upstream UI changes without overwriting customized components.
- Fixed staff status synchronization after locum entry so the UI reflects the reloaded roster instead of showing a saved check-in as outside.
- Browser checks exposed the keyboard slider and session-edit failures. Fixed keyboard completion/checkout confirmation, both timestamp updates, ISO serialization, clearing checkout, admin checkout by roster entry, and deletion of linked sessions. Added regression tests.
- Made unused-rota replacement transactional using D1 batch; imports now refuse to replace attendance records. D1 regression coverage includes an 80-person import and rollback on an invalid later insert.
- Updated the Cloudflare compatibility date to 2026-10-12, matching the installed workerd runtime. Admin defaults now use the UK date helper.
- Limited service worker registration to production, restricted cached files to versioned same-origin assets, and removed the unused Vite devtools integration that caused source-line hydration mismatches and an Intent executable collision. Concurrent branding/icon work in the workspace was preserved.
- Rewrote README.md, AGENTS.md, and CONTEXT.md against current source and runtime behavior. Added current audit findings, marked old issue/PR/cron reports as historical, and clarified ADR-006's external operational status.
- Verification: production build and both TypeScript projects pass; 39 tests pass across 7 files. Build retains a non-fatal Vite CSS sourcemap warning. Local migrations apply; Vite and the built Worker both start. A fresh `npm ci` succeeds and package skills load after reinstall. Restart the built Worker after rebuilding; its previously loaded server modules can otherwise remain stale.


### Browser walkthrough (local data only)

- Vite dev server (5173) and production-built Wrangler server (8787) both start and render the app. Admin PIN login, first-visit tour/skip, and nested Dashboard/Roster/Sessions/Audit navigation work.
- Uploaded a fictional two-person CSV through the upload control. Roster names, roles, shifts, and attendance appeared. Staff keyboard check-in, confirmation checkout, and completed-entry history were exercised.
- Production session editing persisted both ISO timestamps; a check-in at 08:00Z and checkout at 09:00Z produced a 1.00-hour CSV row. Both UI download and authenticated HTTP export worked. Missing/invalid export tokens returned 401.
- Admin manual checkout by roster entry succeeded. Staff undo reopened the closed session. Locum self-entry created a new entry/session and, after the status fix and a full Worker restart, correctly displayed inside.
- Roster QR generation and public `/qr` rendered loaded QR images. `/print-qr` rendered a loaded QR plus the text staff URL. Audit displayed upload, check-in/out, and session-edit events.
- Physical camera scanning, actual printing, touch gestures on a phone, and sustained offline/reconnect behavior were not tested. The development database contains only the fictional walkthrough records created during this review; no existing remote data was accessed.

Older entries are preserved as historical records. They may reference renamed components, obsolete commands, old branding, superseded architecture, or externally managed PR/cron state; they are not current operational instructions.


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
- **Item #17** — Self-upgrading cron: cron job `cd2592bf56f1` rewritten with two-phase prompt (discovery + implementation via GitHub issues/PRs). GitHub repo `nuancedtire/inout` created with 6 control labels (`needs-triage`, `auto-fix`, `wont-fix`, `in-progress`, `ready-to-merge`, `question`). ADR-006 added to `docs/adr/`. CONTEXT.md updated with label taxonomy. `AUDIT.md` updated with corrected counters and all changes.
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

## 2026-06-22 (cron run — Phase A+B)

**Phase A — Discovery:** Scanned all 8 categories. Verified 31 existing issues in `ready-to-merge` state. Discovered 3 new issues:
- #55: manifest.json PWA values outdated (old blue theme_color, old project name)
- #56: Hardcoded box-shadow duplicated across 7 files instead of using `--shadow-card` token
- #57: DailySummary.tsx "Late arrivals" uses old blue #2563eb

**Phase B — Implementation (1 PR):**

- **PR #58 — Design cleanup (#55, #56):** Updated `manifest.json` (theme_color → #ff385c, name → InOut). Replaced 8 instances of hardcoded multi-layer box-shadow string with `var(--shadow-card)` CSS variable reference across 6 TSX files (Card, admin.tsx PIN gate, index.tsx swipe/checkin/manual cards, admin/index.tsx StatCard, DailySummary, WhoIsInSection). Also fixed incidental #57 color in DailySummary (late arrivals accent → warning-600). 7 files changed. Build ✅.

---

## 2026-06-22 (cron run — Phase A only)

**Phase A — Discovery:** Post-massive-refactor scan (Drizzle, shadcn, pnpm, Airbnb redesign). Verified 3 open AUDIT.md items (#55–#57) — all fixed in PR #58 branch but not yet merged to main. Human had closed 15+ stale issues and has 5 PRs awaiting merge.

**New issues:** Found 2 design consistency issues in secondary pages missed by the Airbnb redesign:
- #59: history.tsx — 19 instances of old neutral Tailwind palette instead of design tokens
- #60: qr.tsx — entire page uses old neutral palette and bg-white instead of design tokens

**Phase B:** No `auto-fix` issues available. Nothing to implement.

---

## 2026-06-23 (cron run — Phase A+B)

**Phase A — Discovery:** Scanned all 8 categories. Verified AUDIT.md items: #55 (manifest.json), #56 (box-shadow), #57 (DailySummary #2563eb) still valid — fixed in PR #58 branch, not on main. #59 (history.tsx) and #60 (qr.tsx) verified fixed on main — closed both. #42 (package-lock.json) verified correct (npm project) — closed. #43 (NotFoundPage) verified fixed on main — closed.

**New issues discovered and filed:**
- #61: WhoIsInSection.tsx AVATAR_PALETTES still has old blue #2563eb → `needs-triage, auto-fix`
- #62: ConfirmDialog state type duplicated inline in roster.tsx and sessions.tsx → `needs-triage, auto-fix`
- #63: print-qr.tsx missing QR URL text fallback per ADR-004 → `needs-triage, auto-fix`

**Phase B — Implementation (1 PR):**

| PR | Issues | Branch | Title |
|---|---|---|---|
| #64 | #61, #62, #63 | `agent/issue-group-61-code-cleanup` | Code quality cleanup — design tokens, type dedup, QR text fallback |

5 files changed (+16/−18). Build ✅.

## 2026-06-23 (cron run 2 — Phase A+B)

**Phase A — Discovery:** Scanned all 8 categories. Verified items #55–#57 (PR #58) and #61–#63 (PR #64) still valid in branches.

**New issues discovered and filed:**
- #65: about.tsx uses raw neutral palette instead of semantic tokens → `needs-triage, auto-fix`
- #66: ErrorFallback.tsx uses raw neutral palette instead of semantic tokens → `needs-triage, auto-fix`
- #67: __root.tsx NotFoundPage and body use raw neutral palette instead of semantic tokens → `needs-triage, auto-fix`

**Phase B — Implementation (1 PR):**

- **PR #68 — Design tokens on missed pages (#65, #66, #67):** Replaced ~18 instances of raw `neutral-*` Tailwind classes with semantic design tokens (`text-ink`, `text-muted`, `text-muted-soft`, `text-body`, `bg-canvas`, `bg-surface-soft`, `bg-surface-strong`, `border-hairline`) across `about.tsx`, `ErrorFallback.tsx`, and `__root.tsx`. 3 files, +18/−18. Build ✅.

**Open PRs awaiting human merge:** #44, #45, #48, #49, #58, #64, #68

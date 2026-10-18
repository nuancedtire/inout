# InOut — Verification and Historical Backlog

## Issue follow-up — 18 October 2026

- **#47:** Added server-side input validation and bounded per-client manual check-in throttling (ten well-formed attempts per minute, before database reads/writes). Invalid/expired token attempts also consume the allowance. The limiter uses Cloudflare's client-IP header, shares a fallback when absent, expires old buckets, caps active buckets at 2,048, and fails closed at capacity. This is per-isolate best-effort protection; shared-network clients share the allowance. No distributed enforcement or production deployment is claimed.
- **#54:** Confirmed the existing Radix-backed rota tabs render tablist/tab/tabpanel roles, selected states, and reciprocal panel/trigger IDs. Browser verification confirmed Arrow Right activates Add staff and Home returns to Upload rota.
- **#21:** Confirmed both staff routes use `IdentityPickerModal`; the extraction is already present in commit `794b181`. Selection and clearing were rechecked in the browser.
- **#53:** The duplicated staff PIN/lock modal and associated hook state have been removed. The old extraction request is obsolete; admin PIN login remains a separate feature.
- Validation: `pnpm run typecheck`, `pnpm test` (**55 tests across 9 files**), and `pnpm run build` pass. Build retains the known non-fatal CSS sourcemap warning. Unit tests cover malformed inputs, burst allowance, address isolation/fallback, expiry, and bounded storage. Workers/D1 tests exercise the application validator/handler with mocked RPC transport and real disposable D1, proving throttled requests create no entries, sessions, or audit records. A browser call through the actual RPC transport also confirmed successful manual check-in, incorrect-token rejection, throttling, and unchanged roster counts for rejected requests. Checks were local only.

## Current verification — 17 October 2026

This section describes the checked-out application. June reports below are historical evidence; their issue/PR status and external cron state have not been rechecked. The intended canonical backlog remains GitHub issues, per [ADR-006](docs/adr/0006-self-upgrading-cron.md).

### Verified and updated

- Installed current stable direct dependencies, including React 19.3.1, Motion 14.3.0, TypeScript 7.0.2, Vitest 5.0.5, jsdom 30.1.3, Vite 8.3.4, Wrangler 4.151.1, and current TanStack packages. Node types intentionally match Node 24.
- Replaced npm's obsolete SheetJS 0.18.5 with the official 0.20.3 tarball. Removed unused devtools/typography dependencies and patched Drizzle Kit's transitive esbuild through a scoped override. `pnpm audit` reports **0 vulnerabilities** for the migrated install.
- Migrated the earlier npm setup to pnpm only: committed `pnpm-lock.yaml`, pinned pnpm 12.11.2, moved build permissions/overrides to `pnpm-workspace.yaml`, removed the npm lockfile/configuration, and added a package-manager install guard. A clean frozen-lockfile install succeeds. Local migrations applied successfully from `drizzle/migrations/`.
- Refreshed TanStack Intent to 0.5.5, configured explicit package skill sources, and regenerated its managed AGENTS.md guidance. Package skills are consumed directly from installed dependencies. Authoring validation of upstream skill examples reports upstream example/link errors; it is not an application health check and no package skill files were modified.
- Corrected shadcn metadata to non-RSC React SSR with Lucide icons. Inspected upstream component changes via dry-run; retained customized source components and their design tokens.
- Fixed stale staff status after locum self-entry, keyboard slider completion, and checkout confirmation. Fixed session edits silently discarding check-in changes, converted browser datetime values to ISO on save, and enabled clearing checkout to reopen a session.
- Fixed admin checkout by roster entry and confirmed roster deletion of linked sessions. Rota replacement is now atomic and refuses to replace recorded attendance. Admin's default date now uses the UK date helper.
- Removed the unused Vite devtools integration, which caused root-shell hydration mismatches and shadowed the current Intent executable after a clean install. Production-only service worker registration keeps Vite development out of the app asset cache; production caching is restricted to same-origin `/assets/` files.
- Application and Workers-test TypeScript checks pass. **55 tests pass across 9 files**, including the added keyboard and D1 mutation regressions. Production build passes with a non-fatal Vite CSS sourcemap warning.

Browser walkthrough results are recorded in [POLISH_LOG.md](POLISH_LOG.md). Tests use disposable local D1; the walkthrough uses fictional staff in the separate local development database. No production deployment or remote migration was performed.

### Remaining limitations and follow-ups

1. **Attendance trust and authorization:** QR generation and today's roster/token are public, and staff choose a roster entry without account authentication. `getStatus` is public. Token-gated entry operations do not consistently check that the entry belongs to today's rota. Decide the intended trust model before treating the QR as physical-presence proof.
2. **Secrets and admin access:** source-code fallback PIN/seed remain; production must configure both secrets. Admin PIN verification has no brute-force rate limit. Admin tokens are in localStorage, and changing the PIN alone does not revoke them.
3. **Time boundaries:** `runAutoCheckout` combines date/shift text through SQLite UTC date functions; `parseShiftTime` depends on the host/browser timezone. Overnight and BST transitions need dedicated fixes and regression coverage. Auto-checkout only considers today's rota and records the run time.
4. **Stable identity/history:** personal history only follows one daily roster-entry ID; there is no cross-day staff identity. Admin ad-hoc additions always target today even when another date is selected.
5. **Refresh and errors:** dashboard data does not poll. Roster/Sessions refresh helpers rethrow errors, with some callers lacking catches. Several action components still need a complete error/loading-state review.
6. **Validation and consistency:** many server validators only assert TypeScript shapes. Shift/name parsing has limitations; audit writes and locum entry/session creation are not universally atomic with their associated mutations. Undo has no server-enforced short time window.
7. **Retention and offline:** no scheduled pruning and no offline write queue. The pruning server function has no UI. Physical camera scanning, actual printing, mobile touch gestures, and extended offline/reconnect behavior still require device testing.
8. **Tooling:** Drizzle metadata is ignored, so generation from a fresh checkout can recreate an initial migration; inspect generated SQL. Drizzle Kit retains deprecated esbuild-kit packages despite the fixed esbuild override. Build CSS sourcemap warning remains non-fatal.
9. **External maintenance:** no scheduler configuration or GitHub workflow is checked in. The old scheduler ID, cadence, labels, issue states, and PR states below must be verified with the external owner before reuse.

## Historical reports — June 2026

Statements below describe their dated run, not the current application. In particular, the original PWA item was completed; the old opening counter was stale. Current schema changes use new migrations under `drizzle/migrations/`.


> **What's been done:** Major security/architecture overhaul on 2026-06-20 (see CONTEXT.md for decisions). Auth tokens, race-condition-proof check-ins, atomic rota uploads, batched dashboard queries, public endpoint lockdown. Extensive UI polish: design system, shared components, mobile-responsive admin, day-by-day navigation, human-readable timestamps, audit log UX.
>
> **Historical backlog:** all 17 original items were marked completed by the June 2026 runs. See the current verification above for behavior and remaining gaps.

## Backlog (ordered by impact)

### ~~1. Late/early flagging on admin dashboard~~
**Done.** `RosterSection.tsx` shows ⚠ Late / ⚠ Early badges; `AttendanceSummary.tsx` shows summary counts. Build healthy.

### ~~2. Staff personal check-in history~~
**Done.** New `/history` route (`src/routes/history.tsx`) with `getStaffHistory` server function. Token-gated. Shows date, shift, in/out times, hours. Build healthy.

### ~~3. Weekly hour rollup for admin~~
**Done.** `WeeklyRollupSection.tsx` with Mon-Sun pivot table, `adminWeeklyRollup` server function. Wired into admin nav as "Hours". Build healthy.

### ~~4. Replace `confirm()` with proper confirmation dialogs~~
**Done.** `ConfirmDialog.tsx` component with danger/warning variants, modal overlay. All 3 `window.confirm()` calls in admin replaced. Build healthy.

### ~~5. Shift validation warnings on rota upload~~
**Done.** `uploadRota` returns `unparseableShifts` count; admin sees "⚠ X had unparseable shift times" warning. Build healthy.

### ~~6. `getText` missing `cell.v` fallback in XLSX parser~~
**Done.** `rotaParser.ts` `getText()` now handles formula-result cells with `{v: "value"}` correctly. Build healthy.

### ~~7. Widen rota parser role detection~~
**Done.** 16 new NHS roles added to `looksLikeTier` regex: Physiotherapists, Pharmacists, Radiographers, Paramedics, OTs, SALTs, Midwives, Porters, Domestics, Catering, Security, Phlebotomists, Healthcare Scientists, Physician Associates, Anaesthetists, Surgeons, Psychologists, Social Workers. Build healthy.

### ~~8. Extract shared `withLoading` hook~~
**Done.** `src/hooks/useLoading.ts` created with `useLoading()` hook. `admin.tsx` now uses the hook instead of inline state/function. Build healthy.

### ~~9. Move `addDays` / `parseShiftTime` to `dateTime.ts`~~
**Done.** Completed alongside item 1. Both utilities now in `src/utils/dateTime.ts`. Build healthy.

### ~~10. Rate limiting on check-in/out endpoints~~
**Done (2026-06-21).** In-memory rate limiter added to `checkIn`, `checkOut`, `undoLastAction` in `src/utils/sessions.functions.ts`. 3-second window per entry+action key. Per-isolate best-effort; Cloudflare WAF rules recommended for production.

### ~~11. Single edit form in SessionSection~~
**Done.** `SessionEditForm.tsx` extracted with shared props, used in both desktop table and mobile card views in `SessionSection.tsx`. Build healthy.

### ~~12. PWA / offline resilience~~ ✅ FIXED (2026-06-21)
**What:** Hospital WiFi is unreliable. A service worker with a basic offline fallback would improve reliability for staff check-in.
**Done:** `public/manifest.json` customized with Attendance QR branding; `public/sw.js` with cache-first for static assets + network-first for navigation with offline fallback page; service worker registration added to `__root.tsx`.

### ~~13. Audit log pruning~~
**Done (2026-06-21).** `adminPruneAuditLog` server function added to `src/utils/sessions.functions.ts`. Deletes audit entries older than configurable `retentionDays` (default 90). Admin-only. Logs pruning event to audit log itself.

### ~~14. Proper CSV library~~
**Done (2026-06-21).** Replaced naive `replace(/"/g, '""')` escaping with `papaparse` (`Papa.unparse`) in `src/routes/api/export[.]csv.ts`. Handles commas, newlines, and quotes in field values correctly.

---

## Newly discovered (2026-06-21 review)

### ~~15. CRITICAL: `requireAdmin` auth bypass~~ ✅ FIXED
**What:** `requireAdmin()` in `src/utils/auth.ts` never threw when auth failed — it silently returned `undefined`. Every admin endpoint was effectively unauthenticated. Fixed by adding `throw new Error('Unauthorized: invalid or expired admin credentials')` at the fall-through path.
**Where:** `src/utils/auth.ts:99`.

### ~~16. Stale AGENTS.md project structure~~
**Done (2026-06-21).** Updated AGENTS.md with current project structure including all new routes, components, hooks, utils, and styles. Removed obsolete "Next steps" section.

### ~~17. Cron job failing / stale prompt~~ ✅ FIXED
**Done (2026-06-21).** Cron job `cd2592bf56f1` rewritten with self-upgrading two-phase prompt (discovery + implementation via GitHub issues/PRs). GitHub repo `nuancedtire/inout` created with 6 control labels. ADR-006 added to `docs/adr/`. CONTEXT.md updated with label taxonomy.

---

## For the cron agent

The consolidated cron (`inout-qr-consolidated`, every 3h) is now a self-upgrading two-phase agent. See the cron prompt and `CONTEXT.md` → ADR-006 for full architecture. Key rules:

1. **PHASE A — Discovery:** Scan for doc-code drift, dead code, duplication, error handling, accessibility, security, performance, DX issues. File as GitHub issues with `needs-triage` label.
2. **PHASE B — Implement:** Pick oldest `auto-fix` issue → create branch `agent/issue-{N}-{slug}` → implement → build check → open PR. Never push to main.
3. **Labels as control surface:** `needs-triage` → human adds `auto-fix` → agent sets `in-progress` → PR opened → `ready-to-merge`. `wont-fix` = rejected. `question` = needs clarification.
4. **If nothing to do:** `[SILENT]` — no delivery.
5. Current correction: update `src/db/schema.ts` and generate a new SQL migration in `drizzle/migrations/`; the old `migrations/0001_init.sql` path no longer exists.
6. Append to `POLISH_LOG.md` with date, issue #, what changed, build status.

---

## 2026-06-21 — Phase A discovery (cron run)

All 17 original backlog items verified as genuinely done against the codebase.

**New issues discovered and filed as GitHub issues:**

| # | Category | Title | Labels |
|---|---|---|---|
| #1 | doc-code drift | about.tsx still has TanStack scaffold starter content | needs-triage, auto-fix |
| #2 | doc-code drift | Client-side CSV export uses naive escaping (incomplete fix for AUDIT.md #14) | needs-triage, auto-fix |
| #3 | doc-code drift | __root.tsx NotFoundPage uses hardcoded Tailwind classes instead of design tokens | needs-triage, auto-fix |
| #4 | dead code | Dead components (Header, Footer, ThemeToggle) use non-existent CSS variables and are never rendered | needs-triage, auto-fix |
| #5 | dead code | getRecentAudit and individual admin query endpoints are unused dead code | needs-triage, auto-fix |
| #6 | error handling | Missing .catch() on staff-facing fetch calls (getStaffHistory, getStatus) | needs-triage, auto-fix |
| #7 | accessibility | Missing form labels on admin inputs (PIN, date picker, manual entry fields) | needs-triage |
| #8 | accessibility | Missing ARIA roles on modal dialogs and close buttons | needs-triage |
| #9 | accessibility | SlideButton component lacks keyboard and ARIA support | needs-triage |
| #10 | security | getStatus endpoint has no rate limiting | needs-triage |
| #11 | performance | Missing index on audit_log.created_at for pruning and sorting | needs-triage |

Items #1–#6 are labeled `auto-fix` (clear-cut, well-scoped). Items #7–#11 are `needs-triage` only — human must add `auto-fix` to authorize.

---

## 2026-06-21 — Phase A+B (cron run 2)

**Phase A — Verification:**
- #1: CLOSED (fixed by commit on main — about.tsx now has real content)
- #2–#11: All valid. Human added `auto-fix` to #7–#11.

**New issues discovered:**
- #12: (none — issue numbering skips to #13)
- #13: Doc-code drift — AGENTS.md lists non-existent AddStaffSection/UploadRotaSection. Filed `needs-triage,auto-fix`.
- #14: Dead CSS — ~100 lines of unused slide animation classes in styles.css. Filed `needs-triage,auto-fix`.

**Phase B — Implementation (3 PRs):**

| PR | Issues | Branch | Title |
|---|---|---|---|
| #15 | #4, #5, #13, #14 | `agent/issue-group-4-dead-code-cleanup` | Remove dead code and fix docs |
| #16 | #2, #3, #10, #11 | `agent/issue-group-2-client-fixes` | Client-side fixes + infra hardening |
| #17 | #6, #7, #8, #9 | `agent/issue-group-6-error-handling-accessibility` | Error handling + accessibility |

All 3 PRs built successfully. #1 already resolved by human merge.

---

## 2026-06-22 — Phase A discovery (cron run)

All previous 11 issues (#1–#11) verified as `ready-to-merge` (PRs opened, awaiting human merge). 31 total issues in `ready-to-merge` state from prior runs.

**New issues discovered and filed as GitHub issues:**

| # | Category | Title | Labels |
|---|---|---|---|
| #55 | doc-code drift | manifest.json theme_color and name are outdated pre-redesign values | needs-triage, auto-fix |
| #56 | duplication | Hardcoded box-shadow string duplicated across 7 files instead of using design token | needs-triage, auto-fix |
| #57 | design consistency | DailySummary.tsx "Late arrivals" uses old blue #2563eb instead of warning tone | needs-triage |

**Phase B — Implementation (1 PR):**

| PR | Issues | Branch | Title |
|---|---|---|---|
| #58 | #55, #56 | `agent/issue-group-55-design-cleanup` | Design cleanup — PWA manifest + box-shadow dedup |

Build ✅. 7 files changed across manifest.json + 6 TSX components.

---

## 2026-06-23 — Phase A+B (cron run)

**Phase A — Discovery:** Scanned all 8 categories post-refactor (Drizzle, shadcn, Airbnb redesign).

**Closed as fixed on main:**
- #59 (history.tsx design tokens) — verified using Airbnb neutral tokens on main. Closed.
- #60 (qr.tsx design tokens) — verified using design tokens on main. Closed.
- #42 (package-lock.json stale) — verified npm project, no pnpm lockfile. Closed.
- #43 (NotFoundPage colors) — verified using design tokens on main. Closed.

**Still valid (not on main, in PR branches):**
- #55 (manifest.json) — theme_color #2563eb, name "Attendance QR". In PR #58.
- #56 (box-shadow dedup) — hardcoded in Card.tsx, DailySummary.tsx, admin/index.tsx, roster.tsx, index.tsx. In PR #58.
- #57 (DailySummary #2563eb) — line 133 accentColor. In PR #58.

**New issues discovered and filed:**

| # | Category | Title | Labels |
|---|---|---|---|
| #61 | design consistency | WhoIsInSection.tsx AVATAR_PALETTES still has old blue #2563eb | needs-triage, auto-fix |
| #62 | duplication | ConfirmDialog state type duplicated inline in roster.tsx and sessions.tsx | needs-triage, auto-fix |
| #63 | bug | print-qr.tsx missing QR URL text fallback below QR image | needs-triage, auto-fix |

**Phase B — Implementation (1 PR):**

| PR | Issues | Branch | Title |
|---|---|---|---|
| #64 | #61, #62, #63 | `agent/issue-group-61-code-cleanup` | Code quality cleanup — design tokens, type dedup, QR text fallback |

Build ✅. 5 files, +16/−18 lines.

---

## 2026-06-23 — Phase A+B (cron run 2)

**Phase A — Discovery:** Scanned all 8 categories. Verified all previous AUDIT.md items.

**Items verified in PR branches (not on main):**
- #55 (manifest.json), #56 (box-shadow), #57 (DailySummary #2563eb) — in PR #58
- #61 (AVATAR_PALETTES), #62 (ConfirmDialog type), #63 (print-qr fallback) — in PR #64

**New issues discovered and filed:**

| # | Category | Title | Labels |
|---|---|---|---|
| #65 | design consistency | about.tsx uses raw neutral palette instead of semantic tokens | needs-triage, auto-fix |
| #66 | design consistency | ErrorFallback.tsx uses raw neutral palette instead of semantic tokens | needs-triage, auto-fix |
| #67 | design consistency | __root.tsx NotFoundPage and body use raw neutral palette instead of semantic tokens | needs-triage, auto-fix |

**Phase B — Implementation (1 PR):**

| PR | Issues | Branch | Title |
|---|---|---|---|
| #68 | #65, #66, #67 | `agent/issue-group-65-design-tokens-missed-pages` | Replace raw neutral palette with semantic tokens on missed pages |

3 files, +18/−18. Build ✅.

**Open PRs awaiting human merge:** #44, #45, #48, #49, #58, #64, #68

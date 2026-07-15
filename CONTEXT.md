# Attendance QR — Domain Model & Architecture

## Glossary

| Term | Definition |
|---|---|
| **Rota** | A daily staff schedule. Has a date and a deterministic daily token. |
| **Roster entry** | One person on a rota. Has name, role, shift start/end. Source is "rota" (uploaded) or "manual" (ad-hoc). |
| **Session** | A check-in/check-out pair. One roster entry → at most one open session at a time (enforced by partial unique index). |
| **QR token** | A daily access token derived as `HMAC(date, QR_SEED)`. Deterministic — same every time for a given date. Encoded in the QR code URL as `/?token=...`. |
| **Session token** | A 12-hour stateless HMAC-signed token returned by `adminVerifyPin`. Used to authenticate all admin server functions. No DB storage — verified purely via signature. |
| **Audit log** | Immutable record of every state-changing action: check-in, check-out, admin edit, rota upload, ad-hoc add. |
| **Auto-checkout** | Closes any session whose roster entry's `shift_end + 60 minutes` has passed with no check-out. Admin-triggered, not automatic. |
| **GitHub issue** | A discovered backlog item. Labeled `needs-triage` on creation by the cron. |
| **auto-fix** | GitHub label set by human to authorize agent implementation. |
| **Agent PR** | A pull request opened by the cron from branch `agent/issue-group-{N}-{slug}` (groups) or `agent/issue-{N}-{slug}` (single). Never merged by the agent. |
| **shadcn/ui** | UI component library (Radix primitives + Tailwind). Used for sidebar, calendar, popover, tooltip, dropdown, etc. |
| **Drizzle ORM** | TypeScript-first SQLite ORM. Schema in `src/db/schema.ts`, migrations in `drizzle/migrations/`. |

## Architectural Decisions

### ADR-001: Stateless HMAC session tokens (no sessions table)

**Decision:** Admin authentication uses stateless HMAC-signed tokens derived from `ADMIN_PIN + QR_SEED`. 12-hour TTL. No DB.

**Rationale:** Few admins (2-3), short TTL, no cleanup burden. If a token must be revoked, rotate both secrets.

**Trade-off:** Cannot revoke individual tokens mid-session. Acceptable.

### ADR-002: Deterministic daily QR tokens

**Decision:** QR tokens are `HMAC(date, QR_SEED)`, stable for the entire day. No per-rota-upload rotation.

**Rationale:** Pre-printing for weekends/holidays. Staff trust a stable QR. Token never changes mid-day.

**Trade-off:** If `QR_SEED` leaks, all past/future tokens are compromisable. Mitigation: `QR_SEED` is server-side secret; damage limited to check-in fraud.

### ADR-003: Rota-driven staff list with mandatory check-out

**Decision:** Each day's rota is the source of truth for who should be present. Check-out is mandatory (not optional). Auto-checkout closes stale sessions at shift_end + 60min.

### ADR-004: Print-friendly admin QR page as standalone route

**Decision:** `/print-qr` — standalone route, same admin auth gate as `/admin`. Has date picker. `@media print` hides chrome, maximizes QR. URL displayed below QR as text fallback.

### ADR-005: Consolidated cron-powered feature expansion via omp + ponytail (SUPERSEDED by ADR-006)

**Original Decision:** Single consolidated cron (`inout-qr-consolidated`) runs every 3 hours. Each run: light audit pass (spot-check AUDIT.md vs codebase, prune/add items) + implement one backlog item.

**Status:** Superseded by ADR-006 on 2026-06-21. The cron now uses GitHub issues as the canonical backlog with a two-phase discovery+implementation model.

### ADR-006: Self-upgrading maintenance via GitHub issues + cron

See `docs/adr/0006-self-upgrading-cron.md`. The cron auto-discovers issues, files them as GitHub issues with labels, and implements `auto-fix` labeled items via PRs. The human controls the agent through labels and comments.

### ADR-007: In-app admin onboarding tour, custom-built and localStorage-tracked

**Decision:** A single continuous spotlight/tooltip tour (`src/lib/tour/`, `src/components/TourOverlay.tsx`) walks a new admin across all four sections (Dashboard → Roster → Sessions → Audit) in one pass, auto-navigating between routes as steps advance. Custom-built (motion + existing design tokens) rather than a third-party tour library, to avoid a new dependency and match the existing visual system exactly.

**Trigger:** Auto-starts once per browser on first visit to `/admin` (versioned localStorage flag `inout-admin-tour-seen-v{N}` — bump `TOUR_VERSION` in `src/lib/tour/steps.ts` to re-prompt admins after a substantial content change). Always replayable via the sidebar footer (desktop) or a floating "?" button above `AdminDock` (mobile).

**Rationale:** No user accounts exist (ADR-001, shared PIN), so per-admin progress can only live in the browser, not the DB. A single continuous tour matches the small, fixed feature set better than per-section mini-tours that admins would have to discover individually.

## Deployment

- **Platform:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM
- **Package manager:** pnpm
- **Secrets:** `ADMIN_PIN`, `QR_SEED` via `wrangler secret put` / `.dev.vars`

# InOut — Domain Model and Architecture

Reviewed against the local application on 17 October 2026. Setup, routes, commands, and deployment steps are in [README.md](README.md). Historical maintenance reports are in [AUDIT.md](AUDIT.md) and [POLISH_LOG.md](POLISH_LOG.md).

## Domain model

| Term | Current meaning |
| --- | --- |
| Rota | One row per date, with a stored deterministic QR token. QR generation or an admin ad-hoc addition can create an empty rota before upload. |
| Roster entry | A daily staff record with name, optional role/shift, and source `rota` or `manual`. No stable staff ID connects entries across days. |
| Session | A check-in with optional checkout. A partial unique index permits at most one open session per roster entry. |
| Daily QR token | A custom 12-character encoding derived from SHA-256 of `QR_SEED:date`, stored in `rotas.token` and placed in `/?token=…`. This is distinct from admin HMAC signing. |
| Admin session token | A stateless token containing expiry and a UUID, HMAC-SHA256 signed with `QR_SEED`, valid for 12 hours and saved in browser localStorage. |
| Audit event | A database row with event, JSON details, actor, and creation time. The dashboard reads the latest 50 events globally. Events can be pruned; the log is not immutable storage. |
| Auto-checkout | An admin-triggered operation on today's rota, closing eligible open sessions at the action time after shift end + 60 minutes has passed. |

## Execution and persistence

TanStack Start loaders execute during SSR and client navigation. Loaders call `createServerFn`; handlers enforce admin authorization or the required daily token. `getDb()` lazily obtains the D1 binding from `cloudflare:workers`. Drizzle models are in `src/db/schema.ts`; deployable SQL lives in `drizzle/migrations/`.

Admin is a layout with nested Dashboard, Roster, Sessions, and Audit routes. Authentication and selected date are shared through `AdminContext`. Dashboard reads occur when the route/date changes; there is no live polling. Roster includes QR generation, import, ad-hoc staff, weekly rollup, and export. Admin ad-hoc additions currently use today's date rather than the selected date.

Rota replacement uses one D1 batch with ten-row insert statements. It refuses replacement once sessions exist, preserving attendance and roster IDs. Confirmed roster deletion explicitly deletes linked sessions and the entry in one batch. Session correction updates both timestamps together; admin checkout can locate an open session by roster entry. Browser datetime inputs are converted to ISO timestamps before saving.

Staff select an entry and persist that ID in localStorage. QR-gated check-in, checkout, undo, and locum self-entry write sessions and audit events. A locum submission creates a manual roster entry and opens its session. `/history` returns completed sessions for the selected entry ID; it does not match people by name across rotas.

Manual check-in uses runtime input validation and a separate bounded burst limiter: ten well-formed attempts per client IP per 60 seconds, checked before database access. It reads Cloudflare's `CF-Connecting-IP`, shares a fallback bucket when absent, and shares allowances among users behind the same address. State is per-isolate and best-effort, with at most 2,048 active buckets; expired buckets are reclaimed and capacity exhaustion fails closed. It does not enforce a distributed limit. See `src/utils/manualCheckIn.ts` and README for validation limits.

## Architectural decisions

### ADR-001: Stateless admin tokens

Admin PIN verification issues HMAC-signed tokens with a 12-hour TTL. No admin-session table or individual revocation list exists. Lock removes the token from one browser. The signing key uses `QR_SEED`, not `ADMIN_PIN + QR_SEED`; rotating the PIN alone does not revoke issued tokens. Rotating the seed does revoke those tokens.

### ADR-002: Stored deterministic daily QR tokens

Daily tokens are generated from a seeded SHA-256 digest with custom encoding and are saved on rota creation. Uploads keep the stored token stable, allowing pre-printing. New dates use the current seed; existing dates retain the stored token after a seed change.

QR display and generation are public. The print page's admin login protects its UI only. The public roster response also includes the rota/token. QR possession therefore supports the attendance workflow rather than proving physical presence or staff identity. See the security follow-ups in AUDIT.md.

### ADR-003: Daily roster with explicit checkout

A daily roster defines selectable staff. The database enforces one open session per entry. Check-out and undo are explicit actions; undo is not restricted to a short grace period by the server. Auto-checkout runs only when an admin requests it; no Cloudflare Cron Trigger is configured. Overnight shifts and timezone boundaries need further validation.

### ADR-004: Standalone printable QR route

`/print-qr` shares the browser's admin token, offers date selection, and renders the QR plus its text URL. Print styling hides controls. `/qr?date=…` is the public display route. Both use the browser's current origin in the encoded URL, so printed codes must be generated on the intended staff-facing origin.

### ADR-005: Original consolidated maintenance cron — superseded

The June 2026 consolidated audit/implementation workflow was replaced in the recorded design by ADR-006. Its operational state is not established by this checkout.

### ADR-006: External maintenance via GitHub issues

See [the full ADR](docs/adr/0006-self-upgrading-cron.md). The historical design uses discovery and labeled implementation phases. Labels: `needs-triage`, `auto-fix`, `wont-fix`, `in-progress`, `ready-to-merge`, and `question`. GitHub issues are the intended canonical backlog. The external scheduler, issue states, and old PR states were not verified during this local review. The app itself has no maintenance cron.

### ADR-007: Browser-tracked admin tour

`src/lib/tour/` and `TourOverlay` provide a continuous 16-step tour across the four admin routes. It starts once per browser and is replayable from the desktop sidebar/mobile help control. Seen state uses `inout-admin-tour-seen-v{N}`; `TOUR_VERSION` is currently 2. Shared PIN authentication has no per-admin account, so progress is browser-local.

### ADR-008: Reproducible pnpm toolchain and package-provided skills

The October 2026 refresh uses a committed `pnpm-lock.yaml`, Node 24/pnpm 12 runtime constraints, explicit dependency-build permissions, and the official SheetJS 0.20.3 tarball. The earlier npm setup was superseded by the requested pnpm-only migration. `package.json` pins pnpm 12.11.2; `pnpm-workspace.yaml` records permissions and overrides, and a preinstall guard rejects other package managers. Dependencies stay on stable releases. Node type definitions match the supported Node major. A scoped esbuild override addresses Drizzle Kit's legacy transitive dependency without downgrading the CLI.

TanStack Intent is a project dev dependency. Allowed package skill sources are explicit in `package.json`, and AGENTS.md uses the installed CLI. Skills update with their owning dependencies rather than as copied local manuals. The app uses ordinary React SSR; shadcn configuration records `rsc: false`.

## Retention, offline behavior, and verification

Attendance has no scheduled retention job. Admins can explicitly delete sessions/entries; a server-only `adminPruneAuditLog` function supports configurable retention (default 90 days) but currently has no admin UI control. Audit writes are separate from most attendance mutations, so an audit failure is not universally transactionally coupled to the write.

The production service worker caches same-origin versioned assets and provides a navigation fallback. Attendance writes require connectivity and have no offline queue. Development unregisters the app worker and clears its caches.

Vitest runs Node/jsdom component tests and Cloudflare workerd/D1 tests against real SQL migrations with test credentials and disposable storage. Browser walkthroughs additionally exercise SSR, navigation, RPC, upload, and export. [AUDIT.md](AUDIT.md) records the current verification and remaining gaps.

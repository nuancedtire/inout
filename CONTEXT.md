# InOut — Domain Model and Architecture

Reviewed against the local application on 17 October 2026; verified QR check-in backend (staff records, passkeys, location outcome, evidence) added 20 November 2026 on branch `feat/verified-check-in`, specified in [docs/specs/verified-qr-check-in.md](docs/specs/verified-qr-check-in.md). Setup, routes, commands, and deployment steps are in [README.md](README.md). Historical maintenance reports are in [AUDIT.md](AUDIT.md) and [POLISH_LOG.md](POLISH_LOG.md).

## Domain model

| Term | Current meaning |
| --- | --- |
| Rota | One row per date, with a stored deterministic legacy token. Today's rota is created on first use (the public check-in page, any check-in, an upload or an ad-hoc addition), so a missing upload never blocks attendance. |
| Staff | A stable person record (`staff`): name, normalised name (lowercase, trimmed, whitespace collapsed, accents stripped), optional role, active flag. Created by passkey enrolment; never deleted, only deactivated. Shared with the secure NFC specification. |
| Roster entry | A daily rota row with name, optional role/shift, source `rota` or `manual`, and a nullable `staff_id`. Rota import links an entry only on an exact, unambiguous normalised-name match among active staff (and only when the name appears once in the file); existing rows stay unlinked. A partial unique index allows a staff record at most once per rota. |
| Credential | A WebAuthn passkey (`staff_credentials`): credential ID, public key, counter, transports, device type/backup state, AAGUID and friendly label. Status `pending` → `approved`/`rejected`, `pending`/`approved` → `revoked`; rejected and revoked are final. Pending credentials work immediately but their sessions are flagged. Approval by the shared admin PIN records `reviewed_by = 'admin'`. |
| WebAuthn challenge | A random, single-use, five-minute challenge stored in D1 (`webauthn_challenges`) and taken with one atomic `DELETE … RETURNING`. Expired rows are pruned when a new challenge is issued. |
| Session | A check-in with optional checkout. A partial unique index permits at most one open session per roster entry. Evidence per end: identity (`passkey`, `passkey_pending`, `self_selected`, `admin`), credential used, location outcome (`inside`, `outside`, `denied`, `unavailable`, `not_requested`) and reported accuracy in metres; plus an optional admin review (`accepted`, note). Legacy NULL evidence reads as `self_selected` / `not_requested`. Coordinates are never stored. |
| Verification | Derived, not stored (`src/utils/verification.ts`): verified when identity is `passkey` and location `inside` at check-in, and at checkout once closed; `admin` ends are never flagged. Otherwise flagged with reasons derived from the evidence. Admin acceptance is reported alongside the reasons and does not alter evidence. "Location check passed" never means presence is proven. |
| Site area | One `site_settings` row: department centre, radius (25–2000 m, default 150) and accuracy ceiling (10–500 m, default 100). Inside iff haversine distance − reported accuracy ≤ radius; worse accuracy than the ceiling is `unavailable`. Without a configured centre the outcome is `not_requested`. |
| Staff device token | HMAC-signed (same key as admin tokens, domain-separated purpose and format) token naming a staff ID and credential, valid 90 days. A display hint only: every attendance action needs a fresh passkey assertion. Admin and staff tokens never validate as each other. |
| Check-in code | One permanent, random 12-character base32 code in `site_settings.qr_token`, printed as `/?token=…` on the department poster and remembered by each phone. Admin-only to read; replaceable. Today's legacy daily token (`rotas.token`, SHA-256 of `QR_SEED:date`) is still accepted but no longer published. |
| Admin session token | A stateless token containing expiry and a UUID, HMAC-SHA256 signed with `QR_SEED`, valid for 12 hours and saved in browser localStorage. |
| Audit event | A database row with event, JSON details, actor, and creation time. The dashboard reads the latest 50 events globally. Events can be pruned; the log is not immutable storage. |
| Auto-checkout | An admin-triggered operation on today's rota, closing eligible open sessions at the action time after shift end + 60 minutes has passed. |

## Execution and persistence

TanStack Start loaders execute during SSR and client navigation. Loaders call `createServerFn`; handlers enforce admin authorization or the check-in code. `getDb()` lazily obtains the D1 binding from `cloudflare:workers`. Drizzle models are in `src/db/schema.ts`; deployable SQL lives in `drizzle/migrations/`.

Admin is a layout with nested Dashboard, Roster, Sessions, and Audit routes. Authentication and selected date are shared through `AdminContext`. Dashboard reads occur when the route/date changes; there is no live polling. Roster includes QR generation, import, ad-hoc staff, weekly rollup, and export. Admin ad-hoc additions currently use today's date rather than the selected date.

Rota replacement uses one D1 batch with ten-row insert statements. It refuses replacement once sessions exist, preserving attendance and roster IDs. Confirmed roster deletion explicitly deletes linked sessions and the entry in one batch. Session correction updates both timestamps together; admin checkout can locate an open session by roster entry. Browser datetime inputs are converted to ISO timestamps before saving.

Staff select an entry and persist that ID in localStorage, or enrol a passkey (see ADR-009) and check in with it. QR-gated check-in, checkout, undo, and locum self-entry write sessions with evidence and audit events. Every staff and admin server function validates its input at runtime (`src/utils/validation.ts`). A locum submission creates a manual roster entry and opens its session. `/history` returns completed sessions for the selected entry ID; it does not match people by name across rotas.

Manual check-in uses runtime input validation and a separate bounded burst limiter: ten well-formed attempts per client IP per 60 seconds, checked before database access. It reads Cloudflare's `CF-Connecting-IP`, shares a fallback bucket when absent, and shares allowances among users behind the same address. State is per-isolate and best-effort, with at most 2,048 active buckets; expired buckets are reclaimed and capacity exhaustion fails closed. It does not enforce a distributed limit. See `src/utils/manualCheckIn.ts` and README for validation limits.

## Architectural decisions

### ADR-001: Stateless admin tokens

Admin PIN verification issues HMAC-signed tokens with a 12-hour TTL. No admin-session table or individual revocation list exists. Lock removes the token from one browser. The signing key uses `QR_SEED`, not `ADMIN_PIN + QR_SEED`; rotating the PIN alone does not revoke issued tokens. Rotating the seed does revoke those tokens.

### ADR-002: Stored deterministic daily QR tokens — superseded by ADR-009

Daily tokens are generated from a seeded SHA-256 digest with custom encoding and are saved on rota creation. Uploads keep the stored token stable, allowing pre-printing. New dates use the current seed; existing dates retain the stored token after a seed change.

QR display and generation are public. The print page's admin login protects its UI only. Since 20 November 2026 the public roster response returns only the rota's ID and date, not its token. QR possession therefore supports the attendance workflow rather than proving physical presence or staff identity. See the security follow-ups in AUDIT.md.

### ADR-003: Daily roster with explicit checkout

A daily roster defines selectable staff. The database enforces one open session per entry. Check-out and undo are explicit actions; undo is not restricted to a short grace period by the server. Auto-checkout runs only when an admin requests it; no Cloudflare Cron Trigger is configured. Overnight shifts and timezone boundaries need further validation.

### ADR-004: Standalone printable QR route

`/print-qr` shares the browser's admin token and renders the permanent check-in poster: QR, text URL and the typed code. Print styling hides controls. `/qr` now redirects there. The encoded URL uses the browser's current origin, so posters must be printed from the intended staff-facing origin.

### ADR-005: Original consolidated maintenance cron — superseded

The June 2026 consolidated audit/implementation workflow was replaced in the recorded design by ADR-006. Its operational state is not established by this checkout.

### ADR-006: External maintenance via GitHub issues

See [the full ADR](docs/adr/0006-self-upgrading-cron.md). The historical design uses discovery and labeled implementation phases. Labels: `needs-triage`, `auto-fix`, `wont-fix`, `in-progress`, `ready-to-merge`, and `question`. GitHub issues are the intended canonical backlog. The external scheduler, issue states, and old PR states were not verified during this local review. The app itself has no maintenance cron.

### ADR-007: Browser-tracked admin tour

`src/lib/tour/` and `TourOverlay` provide a continuous 16-step tour across the four admin routes. It starts once per browser and is replayable from the desktop sidebar/mobile help control. Seen state uses `inout-admin-tour-seen-v{N}`; `TOUR_VERSION` is currently 2. Shared PIN authentication has no per-admin account, so progress is browser-local.

### ADR-008: Reproducible pnpm toolchain and package-provided skills

The October 2026 refresh uses a committed `pnpm-lock.yaml`, Node 24/pnpm 12 runtime constraints, explicit dependency-build permissions, and the official SheetJS 0.20.3 tarball. The earlier npm setup was superseded by the requested pnpm-only migration. `package.json` pins pnpm 12.11.2; `pnpm-workspace.yaml` records permissions and overrides, and a preinstall guard rejects other package managers. Dependencies stay on stable releases. Node type definitions match the supported Node major. A scoped esbuild override addresses Drizzle Kit's legacy transitive dependency without downgrading the CLI.

TanStack Intent is a project dev dependency. Allowed package skill sources are explicit in `package.json`, and AGENTS.md uses the installed CLI. Skills update with their owning dependencies rather than as copied local manuals. The app uses ordinary React SSR; shadcn configuration records `rsc: false`.

### ADR-009: Passkey identity and a single location check (pilot)

Implements [the verified QR check-in specification](docs/specs/verified-qr-check-in.md). `@simplewebauthn/server` 14 runs in the Worker (smoke-tested under workerd with real ES256 assertions). Registration requires a resident key, offers EdDSA/ES256/RS256 only (v14's ML-DSA default is unavailable in workerd WebCrypto), requests no attestation, sets no authenticator attachment or hints, and always verifies with user verification required. The RP ID and origin come from `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`, or from the request URL when unset; HTTPS is required except on localhost. Passkeys are bound to the RP ID, so changing the production hostname forces re-enrolment.

Each passkey action writes the session change with its evidence, the audit row, and the credential counter/last-used update in one D1 batch; audit rows inside batches use `INSERT … SELECT … WHERE changes() > 0` (or `last_insert_rowid()` for inserts) so they only record writes that happened. The challenge is consumed atomically before verification rather than inside that batch, which guarantees single use under concurrency. Name-picked undo cannot reverse a passkey action; no staff undo can reverse an admin change. Flags never block attendance.

### ADR-009: One permanent check-in QR (21 November 2026)

With passkey identity and a location check on every action, a QR that changes daily added printing work without adding meaningful assurance. The department now has one permanent, random code (`site_settings.qr_token`), created on first admin request and readable only through admin functions (`adminGetCheckInCode`, `adminReplaceCheckInCode`). Phones keep it in localStorage after the first scan or typed entry, so a Home Screen launch goes straight to the slider. Replacing the code invalidates every poster and every remembered copy; phones then return to the scanner. Today's legacy daily token stays valid for continuity, but no public endpoint returns it; `getQrTokenOrSeed` and the public `/qr` display were removed. A photographed poster used off site is flagged by the location check, not prevented.

Open sessions carry over midnight: for passkey and name-picked staff, checkout and undo follow the person's latest session started within 20 hours, even on yesterday's rota, and check-in is refused while such a session is open. Older open sessions are treated as forgotten checkouts for the coordinator and never block a new check-in.

## Retention, offline behavior, and verification

Attendance has no scheduled retention job. Admins can explicitly delete sessions/entries; a server-only `adminPruneAuditLog` function supports configurable retention (default 90 days) but currently has no admin UI control. Audit writes are separate from most attendance mutations, so an audit failure is not universally transactionally coupled to the write.

The production service worker caches same-origin versioned assets and provides a navigation fallback. Attendance writes require connectivity and have no offline queue. Development unregisters the app worker and clears its caches.

Vitest runs Node/jsdom component tests and Cloudflare workerd/D1 tests against real SQL migrations with test credentials and disposable storage. Browser walkthroughs additionally exercise SSR, navigation, RPC, upload, and export. [AUDIT.md](AUDIT.md) records the current verification and remaining gaps.

<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# InOut — Contributor Context

Last verified: 17 October 2026. Read [README.md](README.md) for setup and daily workflows; [CONTEXT.md](CONTEXT.md) records architecture. [AUDIT.md](AUDIT.md) contains current findings followed by historical reports.

## Package manager

Use **pnpm exclusively** for dependency installation, package scripts, and CLI tools in this repository. Do not use npm, npx, yarn, or bun.

- Install dependencies with `pnpm install`; use `pnpm install --frozen-lockfile` when a current `pnpm-lock.yaml` exists.
- Run scripts with `pnpm run <script>` and installed tools with `pnpm exec <tool>`.
- Use `pnpm dlx <package>` only when a one-off tool is needed and downloading it is appropriate.
- Commit dependency changes with `pnpm-lock.yaml`; do not create or update `package-lock.json` or other package-manager lockfiles.
- `package.json` pins pnpm 12.11.2; `pnpm-workspace.yaml` contains engine checks, approved dependency builds, and overrides. The install guard rejects other package managers. Use Corepack (`corepack enable pnpm`) if the pnpm shim is missing.

## Stack and tooling

- TanStack Start + React 19, TypeScript 7, Vite 8.
- Cloudflare Workers through `@cloudflare/vite-plugin`; D1 via Drizzle ORM.
- Tailwind CSS v4, Radix/shadcn components, Motion 14, Lucide icons.
- Leaflet with OpenStreetMap tiles for the department-area map (`src/components/maps/AreaMap.tsx`, imported client-side only, brand divIcons); admin place search uses OSM Nominatim on submit only.
- SheetJS 0.20.3 from its official tarball for Excel/CSV; `qrcode` for generation; Papa Parse for CSV export.
- Phone camera scans the QR URL. There is no active in-app html5-qrcode scanner; its declaration file is legacy.
- Node 24.15+ (Node 24 line), pnpm 12.11.2. Follow the package-manager rule above for installs, scripts, and lockfiles.
- Project skills live in installed TanStack packages. The locked Intent CLI and explicit `intent.skills` allowlist govern discovery. Use `pnpm run skills:list` and `pnpm run skills:install`; do not copy package skills into the repository or edit `node_modules`.

## Source map

```text
src/
  components/                Shared controls, identity picker, SlideToAction, TourOverlay
    ui/                      Radix/shadcn source components
    motion/                  Animated controls
  db/
    schema.ts                Drizzle tables, indexes, inferred types
    client.ts                Lazy Worker D1 client
    attendance.ts            Session edits, linked deletions, atomic rota replacement
    reminders.ts             Shift-end push reminder job (called by the cron handler)
  hooks/                     Loading tracker and mobile breakpoint
  lib/tour/                  Tour state and versioned step definitions
  routes/
    __root.tsx               Document, error/404 UI, icons/manifest, service worker setup
    index.tsx                Staff check-in/out and locum self-entry
    -hooks.ts                Browser-persisted staff identity
    history.tsx              Completed sessions for a roster entry
    qr.tsx                   Redirect to /print-qr (legacy URL)
    print-qr.tsx             Standalone print page with admin UI gate
    about.tsx                Project information
    admin.tsx                PIN gate, sidebar/dock, date context, tour, Outlet
    admin/
      index.tsx              Dashboard
      roster.tsx             Upload, staff, QR, weekly rollup, export
      sessions.tsx           Session editing/deletion
      audit.tsx              Recent audit events
      -components/           Admin sections and controls
      -context.tsx           Shared authentication/date context
      -hooks.ts              Persistent admin token and messages
      -types.ts              Admin data types
    api/export[.]csv.ts       Authenticated CSV server route
  utils/
    auth.ts                  PIN, legacy daily token derivation, HMAC admin/staff tokens
    audit.ts                 Audit writes
    dateTime.ts              UK display/date and shift helpers
    rotaParser.ts            First-sheet Excel/CSV parsing
    rotas.functions.ts       Roster/QR server functions
    sessions.functions.ts    Attendance/admin server functions and rate limiting
    passkeyAssertion.ts      Shared passkey-assertion and staff-token checks (server-only)
    push.ts                  VAPID config, push-service allowlist, Web Push sending (server-only)
    reminders.functions.ts   Push subscribe/unsubscribe, forgotten and reported check-outs
    shiftEnd.ts              Expected session end (UK time, overnight, BST) and reminder windows
  server.ts                  Worker entry: Start fetch handler + Cron Trigger `scheduled`
  theme.css                  Tailwind design tokens
  styles.css                 Global styles
  router.tsx                 Router factory
  routeTree.gen.ts           Generated; do not edit by hand

drizzle/migrations/          SQL migrations (Wrangler and test source of truth)
test/unit/                   Node/jsdom tests
test/workers/                workerd/D1 tests and isolated setup
public/                      Icons, manifest, service worker (caching, push, notification click), example spreadsheets
scripts/generate-vapid-keys.mjs  VAPID key pair for shift-end reminders (WebCrypto, run with node)
```

## Commands

```bash
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm run dev                  # Vite + local Worker, http://localhost:5173
pnpm run typecheck            # App and Workers-test compiler projects
pnpm test                     # Unit/component + Workers/D1 tests
pnpm run build
pnpm run dev:worker           # Built Worker, http://localhost:8787; stop/rebuild/restart after edits
pnpm audit
```

The old Node 24 registerHooks workaround is obsolete on the verified stack. The production build currently has a non-fatal Vite CSS sourcemap warning. The unused Vite devtools plugin was removed: its transitive Intent binary conflicted with the installed CLI, and root-shell source annotations caused hydration mismatches.

## Database changes

Edit `src/db/schema.ts`, run `pnpm run db:generate`, inspect the SQL, and apply with `pnpm run db:migrate:local`. Add new SQL migrations under `drizzle/migrations/`; never modify an already-applied migration. Drizzle snapshot metadata is currently ignored, so inspect diffs for accidental table recreation or duplicate initial migrations. There is no `migrations/0001_init.sql`.

Use D1 `batch` for atomic multi-statement changes, keeping each insert below its parameter limit. Rota imports use ten-row statements in one batch, and refuse replacement if attendance exists. Roster deletion explicitly deletes linked sessions before the entry in one batch. Workers tests use disposable storage and the actual migrations; no remote access is required.

Remote operations are separate: `pnpm run db:migrate:remote` and `pnpm run deploy`. Confirm the target account/database before any production operation. This local review did not deploy or change remote data.

## Configuration and boundaries

- `DB` is the D1 binding in `wrangler.jsonc`. Server functions call `getDb()`; do not query D1 in an isomorphic loader or read `process.env.DB` at module scope.
- `ADMIN_PIN` and `QR_SEED` belong in `.dev.vars` locally and Wrangler secrets remotely. `vars` is empty. Existing fallback values are documented in README; set both secrets for production.
- Admin server functions validate credentials inside their handlers. UI gates are not an authorization boundary. New server inputs need real runtime validation; a typed identity validator alone does not validate input.
- Admin tokens are HMAC-SHA256 signed using `QR_SEED`, expire in 12 hours, and persist under `inout-admin-token-v2` in localStorage. PIN rotation alone does not revoke issued tokens.
- The check-in QR is one permanent random 12-character code in `site_settings.qr_token` (see `src/db/checkInCode.ts`), readable and replaceable only by admins. Legacy daily tokens in `rotas.token` are still accepted but never published. Today's rota is auto-created on first use. Open sessions carry over midnight for up to 20 hours.
- Staff location is required. `getCheckInArea` and `previewLocation` (check-in-code gated, rate limited) expose only the department centre and radius for staff maps; staff coordinates are evaluated and discarded, never stored or logged. Staff maps stay non-interactive and framed on the department. Whether staff may check in without location (flagged `denied`) is the single constant `ALLOW_CHECKIN_WITHOUT_LOCATION` in `src/lib/locationPolicy.ts`.
- Staff choose a roster entry; there are no staff accounts. History is limited to completed sessions for that entry ID. Do not describe it as cross-day personal history or strong identity verification.
- Auto-checkout requires an admin action, acts on today's rota, and stamps closure with the action time; the cron never closes sessions. Overnight/BST behavior of auto-checkout remains a known limitation.
- `wrangler.jsonc` `main` is `src/server.ts`, which re-exports Start's fetch handler and adds `scheduled` for the `*/5 * * * *` Cron Trigger (ADR-011). It sends shift-end push reminders only; it must never throw. `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (secrets) and optional `VAPID_SUBJECT` enable it; without keys reminders report `enabled: false` and the cron does nothing. Push endpoints are accepted only at known push-service hosts (SSRF guard) and are never logged or audited.
- A staff-entered ("reported") check-out sets `sessions.checkout_source = 'reported'` and is always flagged `checkout_reported`; it needs a fresh passkey assertion. Admin correction or undo clears it.
- Admin ad-hoc additions target today, regardless of the selected date. Dashboard reads do not poll. Audit shows the latest 50 events globally.
- Service workers register only in production. Offline UI does not submit or queue attendance. Keep RPCs and Vite modules out of asset caching.
- Preserve design customizations in `components/ui/`. Inspect upstream shadcn diffs before merging source changes. `components.json` uses Radix, Lucide, and `rsc: false`.

## Documentation and maintenance

Update all affected docs with verified behavior, commands, and limitations. Preserve dated audit/polish entries as history; never treat old build/PR/cron status as live evidence. ADR-006 describes an external maintenance design, not a scheduler provisioned by this repository. Do not create issues, send messages, or configure recurring jobs merely because a historical document describes them.

This project was initially scaffolded with the TanStack CLI for React + Cloudflare. Current configuration and installed package skills take precedence over old scaffold instructions.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for nuancedtire/inout.
See `docs/agents/issue-tracker.md`.

### Triage labels

Use needs-triage, needs-info, ready-for-agent, ready-for-human,
and wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with a root glossary and docs/adr/.
See `docs/agents/domain.md`.

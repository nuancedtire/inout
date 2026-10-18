# InOut

Daily QR check-in and check-out for ward staff, built with TanStack Start, React 19, Cloudflare Workers, and D1. Last reviewed: 17 October 2026.

## Run locally

Use Node 24.15+ within the Node 24 line and pnpm 12.11.2 (`.node-version` and `package.json` record the supported runtime).

```bash
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm run dev
```

Open http://localhost:5173. Vite runs the Worker locally with the D1 binding and hot reload. No Cloudflare account is needed for local migrations, tests, or development. Local D1 data lives under `.wrangler/state`.

To run the production build locally instead:

```bash
pnpm run build
pnpm run dev:worker
```

Open http://localhost:8787. After source changes, stop the Worker, rebuild, and restart it so its imported server modules are refreshed. `pnpm run preview` is also available through Vite. The old Node 24 `registerHooks` workaround is no longer needed with the verified dependencies.

The committed `pnpm-lock.yaml` makes installs reproducible. `package.json` pins pnpm 12.11.2; if the pnpm command is unavailable, enable the Corepack shim with `corepack enable pnpm`. `pnpm-workspace.yaml` holds engine checks, explicit `esbuild`/`workerd` build permissions, and the scoped esbuild override. Version-specific release-age exceptions preserve the verified packages imported during migration. Skills are loaded through Intent, so pnpm's separate skill linker is disabled.

Use `pnpm install` when intentionally changing dependencies, then commit the pnpm lockfile. The install guard rejects other package managers. Do not create npm, Yarn, or Bun lockfiles.

## Configuration

Local secrets belong in an untracked `.dev.vars` file:

```dotenv
ADMIN_PIN=choose-a-local-pin
QR_SEED=choose-a-long-random-local-seed
```

`wrangler.jsonc` contains the `DB` binding, D1 ID, compatibility date, and public settings; its `vars` object is empty. The existing code falls back to `Wh!ppscross` for the PIN and `default-qr-seed-change-me` for the seed when unset. Configure both secrets before production use.

Admin login returns a signed token valid for 12 hours, saved in browser localStorage. Lock clears that browser's token. Rotating `QR_SEED` invalidates issued admin tokens; changing only `ADMIN_PIN` does not. Existing daily QR tokens are stored in D1, so seed rotation alone does not replace those stored tokens.

## Daily workflow

1. Unlock `/admin`, then open **Roster**.
2. Choose the date and upload a CSV, XLSX, or XLS rota. Add or edit individual staff as needed. Admin ad-hoc additions apply to **today**, even if a different day is selected.
3. Generate the QR in Roster, or use `/print-qr` for the printable sheet and URL fallback. Generate printed codes using the address staff will actually open, not a localhost development address.
4. Staff scan with their phone's camera, choose their name, and slide to check in. Slide left and confirm to check out. Keyboard users can use arrow keys or End for check-in and Home for checkout.
5. Staff can undo their latest action. Locum/bank staff can use **Not on the rota?** to enter their name and role and check in with today's QR.
6. Use Dashboard for attendance summaries, Roster for weekly hours and CSV export, Sessions for corrections/deletions, and Audit for recent activity.

Rota replacement is atomic and is rejected once any attendance exists for that rota. Edit entries individually instead. Deleting a roster entry explicitly deletes its linked sessions after confirmation.

Locum self-entry validates names (1–200 characters after trimming, with a 200-character input cap), optional roles (up to 100 input characters), and the daily QR token on the server. Manual check-in allows ten well-formed attempts per client IP in a 60-second window before database access, including attempts with an incorrect or expired token. Cloudflare supplies the client address through [`CF-Connecting-IP`](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip); absent addresses share a fallback bucket. Staff sharing a network address share the allowance. This is best-effort protection per Worker isolate, resets on isolate restart, and is not a distributed limit. The limiter retains at most 2,048 active buckets, expires old buckets, and rejects new buckets when full. Stronger cross-isolate enforcement remains a separate deployment concern.

Auto-checkout is an **admin-triggered action**, not a background scheduler. It closes eligible sessions on today's rota when shift end + 60 minutes has passed, recording the action time. Overnight/BST boundary behavior still needs dedicated validation; see [AUDIT.md](AUDIT.md).

Dashboard data loads on navigation/date changes; there is no live polling. Reload or navigate to refresh after another device makes changes. The first admin login offers a 16-step tour; replay it from the sidebar or mobile help button.

## Rota formats

Only the first worksheet is read. The parser recognizes a `Name` header in the first ten rows, optional `Role`/`Notes`, and `Shift`/`Time`. It also handles allocation sheets with role headers and a time axis. Recognized role section headings supply roles when a row has none; `Tier A` grouping labels are skipped in the simple format.

Example CSV:

```csv
Name,Role,Shift
Alice Example,Nurse,0800-1800
Bob Example,Consultant,09:00-17:00
```

Supported examples include `0800-1800`, `08-1800`, `13:00-23:45`, and `08:00-20:00`. Upload warns when a provided shift cannot be parsed. The parser is permissive and does not fully validate time ranges. Names currently require Latin letters. Download the bundled [example allocation spreadsheet](public/example-allocation-filled.xlsx) from the upload panel; `sample-rota.xlsx` is not tracked.

## Routes

| Route | Purpose |
| --- | --- |
| `/` or `/?token=…` | Staff identity and attendance; mutations require today's QR token |
| `/history?token=…` | Completed sessions for the selected roster entry, not cross-day identity history |
| `/admin` | PIN-gated dashboard and shared admin shell |
| `/admin/roster` | Upload, QR generation, staff management, weekly hours, CSV export |
| `/admin/sessions` | Edit both timestamps, reopen, or delete sessions |
| `/admin/audit` | Latest 50 audit events across all dates |
| `/qr?date=YYYY-MM-DD` | Public QR display; creates a rota for the date if absent |
| `/print-qr` | Admin UI for date selection, printable QR, and text URL |
| `/about` | Project information |
| `/api/export.csv?start=YYYY-MM-DD&end=YYYY-MM-DD&token=…` | Admin-token-authenticated CSV download |

The print page has a client-side login gate; the underlying QR function is public. The CSV endpoint uses ISO timestamps; the Roster export formats them for UK display. Both use Papa Parse.

## Checks

```bash
pnpm test                 # Unit/component tests and Workers/D1 integration tests
pnpm run test:unit
pnpm run test:workers
pnpm run test:watch
pnpm run typecheck        # Application and Workers test TypeScript projects
pnpm run build
pnpm audit
```

`vitest.config.ts` separates Node/jsdom tests from Cloudflare workerd tests. Workers tests apply the real migrations to disposable local D1 storage and use test-only credentials. They import application database/auth modules; a browser walkthrough additionally checks SSR, navigation, RPC calls, uploads, and downloads.

The October 2026 upgrade uses React 19.3, Motion 14, TypeScript 7, Vitest 5, jsdom 30, Vite 8, and current stable TanStack/Cloudflare packages. Node type definitions stay on major 24 to match the supported runtime. SheetJS 0.20.3 comes from its [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), because npm's `xlsx` release is outdated. An override updates Drizzle Kit's legacy esbuild dependency; unused devtools adapters and typography dependencies were removed. See the lockfile for exact resolved versions.

Builds currently emit a non-fatal Vite CSS sourcemap warning. See [AUDIT.md](AUDIT.md) for verification results and remaining limitations.

## Database and deployment

Schema: `src/db/schema.ts`. Migrations: `drizzle/migrations/`, configured in both `drizzle.config.ts` and `wrangler.jsonc`. There is no `migrations/0001_init.sql`.

For your own Cloudflare account, create a database and replace the existing ID in `wrangler.jsonc`:

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create inout-db
```

For schema changes, generate a new migration, inspect its SQL, and apply it locally. Do not edit an already-applied migration.

```bash
pnpm run db:generate
pnpm run db:migrate:local
```

Drizzle's D1 HTTP configuration references `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN`; ordinary local migration application uses Wrangler and does not require them. Drizzle snapshot metadata is currently ignored by Git, so review generated migrations carefully against existing SQL before accepting them.

Production actions require your Cloudflare credentials and the intended target database:

```bash
pnpm run db:migrate:remote
pnpm exec wrangler secret put ADMIN_PIN
pnpm exec wrangler secret put QR_SEED
pnpm run deploy
```

`deploy` builds and then deploys the Worker. Local verification does not deploy or migrate production. See [Wrangler's command reference](https://developers.cloudflare.com/workers/wrangler/commands/) for account and CLI operations.

## Offline behavior and skills

The manifest supports installation. In production, `/sw.js` caches same-origin versioned `/assets/` files and shows an offline fallback when navigation fails. Attendance requires a network connection: writes are neither queued nor synchronized offline. Development unregisters this app's service worker and clears its asset caches to keep Vite modules fresh.

Project skills ship with the installed TanStack packages and are refreshed by dependency updates. `@tanstack/intent` is a locked dev dependency; `package.json` explicitly lists permitted skill sources.

```bash
pnpm run skills:list
pnpm exec intent load @tanstack/react-start#react-start
pnpm exec intent load @tanstack/start-client-core#start-core/server-functions
pnpm run skills:install   # Refresh the managed instructions in AGENTS.md
```

See [AGENTS.md](AGENTS.md) for contributor guidance, [CONTEXT.md](CONTEXT.md) for architecture, [AUDIT.md](AUDIT.md) for findings, and [POLISH_LOG.md](POLISH_LOG.md) for the historical change log.

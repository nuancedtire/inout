# InOut

QR, passkey and location-checked check-in and check-out for ward staff, built with TanStack Start, React 19, Cloudflare Workers, and D1. Last reviewed: 17 October 2026.

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

Passkeys (WebAuthn) use three optional settings, as `.dev.vars` entries locally or Wrangler vars/secrets remotely:

| Variable | Default when unset | Purpose |
| --- | --- | --- |
| `WEBAUTHN_RP_ID` | Hostname of the request URL | Relying party ID. Passkeys are bound to it permanently. |
| `WEBAUTHN_ORIGIN` | Origin of the request URL | Expected origin in each passkey response, e.g. `https://inout.example.nhs.uk`. |
| `WEBAUTHN_RP_NAME` | `InOut` | Name shown by the phone's passkey provider. |

Deriving them from the request makes `localhost`, preview URLs and a custom domain work without configuration. Passkeys require HTTPS, except on `localhost` (use `http://localhost:5173`, not an IP address or LAN hostname). For the pilot, serve from a stable custom hostname and set both `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` to it: a passkey created on one hostname (including a `workers.dev` preview) does not work on another, and changing the hostname forces every staff member to re-enrol.

Shift-end reminders (Web Push) use three more settings. Without both keys the feature reports `enabled: false` and the cron does nothing:

| Variable | Default when unset | Purpose |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | — (reminders off) | VAPID public key, base64url uncompressed P-256 point. Secret not required, but store it with the private key. |
| `VAPID_PRIVATE_KEY` | — (reminders off) | VAPID private key, base64url (32 bytes). **Secret.** |
| `VAPID_SUBJECT` | `https://inout.fzn.workers.dev` | Contact for push services: a `mailto:` or `https:` URL (Apple rejects anything else). |

Generate a key pair with `node scripts/generate-vapid-keys.mjs` (WebCrypto only) and paste the output into `.dev.vars` for local use. Replacing the keys invalidates every existing push subscription, so phones must turn reminders on again. Workers tests generate their own throwaway keys.

Admin login returns a signed token valid for 12 hours, saved in browser localStorage. Lock clears that browser's token. Rotating `QR_SEED` invalidates issued admin tokens; changing only `ADMIN_PIN` does not. The permanent check-in code is random and stored in D1; seed rotation does not change it. Replace it from **Roster → Check-in QR code → Replace code**.

## Daily workflow

1. Unlock `/admin`, then open **Roster**.
2. Choose the date and upload a CSV, XLSX, or XLS rota. Add or edit individual staff as needed. Admin ad-hoc additions apply to **today**, even if a different day is selected.
3. Generate the QR in Roster, or use `/print-qr` for the printable sheet and URL fallback. Generate printed codes using the address staff will actually open, not a localhost development address.
4. Staff scan with their phone's camera. On a first visit they choose their name from today's rota (locum/bank staff type name and role), set up Face ID / fingerprint / screen lock as a passkey, read a short location explainer, and are checked in with that one prompt. Afterwards they slide to check in or out and confirm with Face ID; the location check runs alongside. The QR is permanent: print it once from `/print-qr` (or Roster → Print poster). Phones remember the code after the first scan, so a Home Screen launch goes straight to the slider. A phone without a remembered code shows an in-app QR scanner with a typed-code fallback (the 12-character code is printed under the QR).
5. Staff can undo their latest action within 30 seconds (Face ID again). Phones without passkey support can use **Check in without Face ID** (pick a name); those sessions are flagged.
6. Approve new phones in **Staff → Approvals**, set the department area in **Staff → Location** (search or drag the pin on the map from anywhere, or take GPS readings while standing in the department), and review flagged sessions on the Dashboard (**Needs review → Accept** with a note).
7. Use Dashboard for attendance summaries, Roster for weekly hours and CSV export, Sessions for corrections/deletions, and Audit for activity.

Rota replacement is atomic and is rejected once any attendance exists for that rota. Edit entries individually instead. Deleting a roster entry explicitly deletes its linked sessions after confirmation.

Locum self-entry validates names (1–200 characters after trimming, with a 200-character input cap), optional roles (up to 100 input characters), and the check-in code on the server. Manual check-in allows ten well-formed attempts per client IP in a 60-second window before database access, including attempts with an incorrect or expired token. Cloudflare supplies the client address through [`CF-Connecting-IP`](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip); absent addresses share a fallback bucket. Staff sharing a network address share the allowance. This is best-effort protection per Worker isolate, resets on isolate restart, and is not a distributed limit. The limiter retains at most 2,048 active buckets, expires old buckets, and rejects new buckets when full. Stronger cross-isolate enforcement remains a separate deployment concern.

### Verified check-in (passkeys and location check)

The [verified QR check-in specification](docs/specs/verified-qr-check-in.md) is implemented on branch `feat/verified-check-in`: server functions in `src/utils/passkeys.functions.ts` (staff) and `src/utils/staff.functions.ts` (admin), the staff flow in `src/components/checkin/` and `src/lib/`, and admin screens under `/admin/staff` and the Dashboard. It has been exercised with a virtual authenticator and mocked geolocation in Chromium, not yet on physical iPhone/Android devices inside the department.

- **Enrolment.** With the check-in code, a person chooses their rota entry (or enters name and role, for locums), then creates a passkey with Face ID, fingerprint or the phone passcode. This links the entry to a stable staff record (reusing a single active record with the same normalised name, otherwise creating one). The new passkey is `pending`: it works at once, but its sessions are flagged "Phone awaiting approval" until an administrator approves it. Enrolment can also check the person in with the same prompt. Every additional phone needs fresh approval.
- **Check-in and checkout.** The phone signs a single-use, five-minute challenge with its passkey (user verification required). The server checks the check-in code, challenge, origin, RP ID, user verification, credential status and signature counter, then writes the session, its evidence, the counter update and the audit event together. A staff member with no entry on today's rota gets a linked `manual` entry. Rejected or revoked passkeys are refused with a message pointing to the coordinator. Undo needs the same evidence as the action it reverses: picking a name cannot undo a passkey action, and staff cannot undo an administrator's change.
- **Fallback.** The name-selection route remains for phones without a usable passkey. Those sessions record identity `self_selected` and are always flagged. Locum self-entry still works and is also recorded as `self_selected`.
- **Location check.** The client may send one reading per check-in or checkout. The server compares it with the department area and stores only the outcome (`inside`, `outside`, `denied`, `unavailable`, `not_requested`) and the reported accuracy in metres; coordinates are never written to D1, the audit log or logs. A reading is inside when distance minus reported accuracy is within the radius; accuracy worse than the ceiling counts as unavailable. Until an administrator sets the department centre, the outcome is `not_requested`. Radius (25–2000 m, default 150) and accuracy ceiling (10–500 m, default 100) are pilot tuning values.
- **Area map.** `src/components/maps/AreaMap.tsx` draws the area on OpenStreetMap tiles (`tile.openstreetmap.org`) with Leaflet, loaded client-side only. Admin **Staff → Location** can search places through OSM Nominatim (on submit only, at most one request a second), tap or drag the pin, or use readings; it falls back to a scale diagram when tiles can't load. Tile and search requests go from the browser to the OpenStreetMap Foundation's servers, so they reveal the viewed area and the client IP to them. Non-interactive maps frame the department area, never the person, and point to a distant position with an edge arrow. Staff positions are never stored or shown to administrators.
- **Staff location screens.** Location is required for staff check-in and checkout. Home shows a small map card ("Are you in the department?"): the department circle, the person's own dot and accuracy halo, and a plain verdict (in the department / about 310 m away / location off / not precise). It checks by itself only when the phone already allows location (on iPhone, which reports `prompt` until a page asks, once the phone has shared a reading with InOut before); the reading goes to `previewLocation`, which records nothing. Before the browser's first location prompt, an explainer shows the department on the map with one **Continue** button (no "Not now"). If the phone or browser blocks location, a **Turn on location** screen gives device-specific steps with pictures of each settings screen: iPhone Safari (Settings › Privacy & Security › Location Services, Safari Websites › While Using the App, Precise Location, then the page menu or `aA` › Website Settings › Location › Allow), iPhone Chrome and Home Screen web apps, Android Chrome (quick-settings Location, site settings › Permissions › Location, Settings › Apps › Chrome › Permissions › Location with Use precise location) and Samsung Internet (☰ › Settings › Sites and downloads › Site permissions › Location). It notices when location comes back (Permissions API `change` where it fires, and a silent re-try whenever the page becomes visible again, since iOS Safari doesn't fire `change`), and offers **Try again**. Sliding while location is known to be off shows these steps before Face ID; a refusal discovered mid check-in parks the check-in there. `ALLOW_CHECKIN_WITHOUT_LOCATION` in `src/lib/locationPolicy.ts` (currently `true`, pending an owner decision) adds a low-emphasis "Can't turn it on? Check in anyway — the coordinator will be told", which records location `denied` and flags the session; set it to `false` to block. The working screen shows the dot land on the map while saving, and the result screen a small map with "In the department" or "Outside the area". Staff maps are never interactive and frame the department only.
- **Staff map endpoints.** `getCheckInArea({ token })` returns `{ area: { latitude, longitude, radiusM } | null }` so maps render before any reading; `previewLocation({ token, location })` returns `{ outcome, accuracyM, awayM, area }`. Both are gated by the check-in code, validate input at runtime, are rate limited per client IP (60 a minute per isolate), and expose only the public department centre and radius (never the accuracy ceiling). Staff coordinates are evaluated and discarded, never stored or logged.
- **Layouts.** The staff screens are one 440 px column on phones (iPhone SE 375 × 667 up to Pro Max 440 × 956, Galaxy Z Fold cover 344 px). From 640 px wide (Fold inner screens, landscape, tablets) Home, the location screens, working and result open into two columns. On a half-folded device that reports `horizontal-viewport-segments: 2`, the columns line up with the two screen segments so nothing sits across the hinge; single-column screens move to the right-hand segment. Map heights follow the viewport height, side padding includes safe-area insets, and the screens reflow at 200% text.
- **Review.** A session is verified when identity is an approved passkey and the location check passed, at check-in and (once closed) at checkout. Admin-made times and auto-checkout are recorded as `admin` and not flagged. Anything else is flagged with reasons derived from the stored evidence. Administrators can accept a flagged session with a note; the evidence is unchanged and the acceptance is audited. The dashboard returns evidence, verification and reasons per row and a count of pending enrolments; the CSV export and weekly rollup add Identity in, Location in, Identity out, Location out, Verified, Flags and Review columns.
- **Rota import.** Uploads link entries to staff only on an exact, unambiguous normalised-name match among active staff, and only when the name appears once in the file. The upload result lists unlinked entries with the reason (`no_match` or `ambiguous`) for the administrator to resolve.

Honest assurance: a passkey shows that an enrolled phone, unlocked by its owner, signed the request; it does not prove who that owner is beyond the administrator's approval. A reported position is untrusted client input and can be faked; "location check passed" means the phone reported a position in the area, not that the person was present. A photograph of the QR used elsewhere is flagged, not prevented.

Passkey requests are rate limited per client IP (60 per minute for starting, 60 per minute for finishing, per Worker isolate) with the same best-effort limiter as manual check-in. No public endpoint returns the check-in code or a daily token. Today's rota is created automatically on first use. Sessions carry over midnight: checkout and undo follow a session started within the last 20 hours, even on yesterday's rota.

Auto-checkout is an **admin-triggered action**, not a background scheduler. It closes eligible sessions on today's rota when shift end + 60 minutes has passed, recording the action time. Overnight/BST boundary behavior still needs dedicated validation; see [AUDIT.md](AUDIT.md). The Cron Trigger below never closes sessions.

### Shift-end reminders and forgotten check-outs

- **"Still at work?" reminder.** A Cron Trigger (`*/5 * * * *`, UTC) runs `scheduled` in `src/server.ts`. About 15 minutes after a shift should have ended, a person whose session is still open gets one notification on each phone that turned reminders on: "Still at work? Your shift ended at 20:00. Tap to check out." Tapping it opens InOut. The expected end is the rota's shift end in UK time on the rota date (next day for overnight shifts, BST handled), or check-in + 12 hours when the entry has no shift times. Only sessions started within 24 hours, linked to an active staff record with a passkey-bound subscription, are considered; each gets at most one reminder, even if the cron overlaps or runs again. A run handles at most 200 due sessions and 40 push requests and leaves the rest for the next run. Subscriptions the push service reports gone (404/410) are deleted; others are dropped after ten consecutive failures. One `checkout_reminders_sent` audit row per run records counts only.
- **Turning reminders on.** Server functions in `src/utils/reminders.functions.ts`: `getPushConfig()` returns `{ enabled, publicKey }` for `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`; `subscribePush({ token, staffToken, subscription })` stores the subscription against the staff record named by the phone's staff token (passkey pending/approved, staff active), at most five per person; `unsubscribePush({ token, staffToken, endpoint })` removes it. Endpoints are accepted only over HTTPS at known push services (`fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`) and are never logged or audited. Android Chrome and Samsung Internet work in the browser or installed; **iPhone and iPad need InOut added to the Home Screen (iOS/iPadOS 16.4+)** and the permission prompt must come from a tap.
- **"You didn't check out."** `getForgottenCheckout({ token, staffToken })` returns the person's most recent open session that is more than 60 minutes past its expected end (started within 7 days), or `null`, with `canCheckOutNow` when an ordinary check-out would still close it. `reportForgottenCheckout({ token, response, sessionId, leftAt })` saves the time they left after a fresh Face ID (challenge from `beginPasskeyAuth`): `leftAt` must be an ISO time after check-in, not in the future and within 24 hours of check-in, and the session must be theirs and still open. It is recorded with passkey identity, location `not_requested` and check-out source `reported`, audited as `checkout_reported`, and always flagged **Check-out time entered later** on the dashboard, rollup and CSV for the coordinator. An administrator correcting the time, or an undo, clears the flag.
- **What staff see.** After a check-in with Face ID/fingerprint, and on Home until they decide, a card offers **Remind me to check out** with a preview of the notification. The button asks for notification permission from the tap, subscribes and calls `subscribePush`; the card then confirms "Reminders are on". "Not now" hides the card for 7 days; turning reminders off hides it for good. The account menu (tap your name) has a **Shift-end reminders** On/Off switch; Off calls `unsubscribePush` and drops the browser subscription, and "Not you? Sign out" does the same for the person leaving. If notifications are blocked, the card explains where to allow them (iPhone: Settings › Notifications › InOut; Chrome: ⋮ › Settings › Site settings › Notifications; Samsung Internet: ☰ › Settings › Sites and downloads › Notifications; installed Android app: Settings › Apps › InOut › Notifications). In an iPhone/iPad browser tab the Home Screen card is worded "Add InOut to your Home Screen to get reminders" and the menu item opens the same steps. Every app open where permission is granted and the person chose reminders re-sends the current subscription. Reminders are offered only with a passkey (not "without Face ID"), when `getPushConfig` reports `enabled`, and in production builds (the service worker is production-only; `pnpm run dev` hides them). Tapping a notification opens `/`, which goes straight to Home with the slider ready to check out (the check-in code is remembered).
- **"You didn't check out" screen.** On a passkey phone, Home asks `getForgottenCheckout` once per visit (and again when the app returns after a minute or more away). A forgotten shift is shown first: "You didn't check out after your shift yesterday", check-in time and shift. **I left at 19:30** saves the expected end; **I left at a different time** opens a large time picker limited to between check-in and now (at most 24 hours after check-in), with a day choice when that range crosses midnight (UK time, BST-aware); **I'm still at work** appears only while an ordinary check-out would still close the shift and returns to Home for this visit. Saving needs Face ID/fingerprint and ends with "Check-out saved · 19:30 — marked for your coordinator to confirm". Times outside the range are caught before Face ID; a cancelled Face ID keeps the screen. "Without Face ID" mode skips this (the server requires a passkey).
- **Limitations.** Reminders are best-effort: push services may delay or drop messages, phones may be off or have notifications disabled, a reminder is not retried, and nothing happens without VAPID keys. iOS requires the Home Screen web app. A subscription that the browser rotates is only refreshed when the app re-sends it on its next launch. Reminders never close sessions.

Test the cron locally: with `pnpm run dev`, open `http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`; with the built Worker, run `pnpm exec wrangler dev --local --test-scheduled` and request the same path on port 8787. The Worker logs a JSON `checkout_reminders` summary.

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
| `/` or `/?token=…` | Staff check-in: passkey sign-up and check-in/out, location check, in-app QR scanner; the token is kept in session storage and stripped from the address bar |
| `/history` | Completed sessions for the selected roster entry, not cross-day identity history; reads today's code from the tab's session storage (a `?token=` is accepted and stripped) |
| `/admin/staff` | Phone approvals, staff profiles and passkeys (revoke, deactivate), department location setup |
| `/admin` | PIN-gated dashboard and shared admin shell |
| `/admin/roster` | Upload, QR generation, staff management, weekly hours, CSV export |
| `/admin/sessions` | Edit both timestamps, reopen, or delete sessions |
| `/admin/audit` | Latest 50 audit events across all dates |
| `/qr` | Redirects to `/print-qr` (the public daily display was removed) |
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
pnpm exec wrangler secret put VAPID_PUBLIC_KEY    # from node scripts/generate-vapid-keys.mjs
pnpm exec wrangler secret put VAPID_PRIVATE_KEY
pnpm exec wrangler secret put VAPID_SUBJECT       # optional, e.g. mailto:coordinator@example.nhs.uk
pnpm run deploy
```

Apply migration `0003_shift_end_reminders.sql` before deploying code that uses it. `deploy` builds and then deploys the Worker, including the `*/5 * * * *` Cron Trigger from `wrangler.jsonc`. Local verification does not deploy or migrate production. See [Wrangler's command reference](https://developers.cloudflare.com/workers/wrangler/commands/) for account and CLI operations.

## Offline behavior and skills

The manifest supports installation. In production, `/sw.js` shows shift-end push notifications (with fallback text if a payload is missing) and focuses or opens InOut when one is tapped. It also caches same-origin versioned `/assets/` files, ignores cross-origin requests (map tiles, place search), and shows an offline fallback when navigation fails. Attendance requires a network connection: writes are neither queued nor synchronized offline. Development unregisters this app's service worker and clears its asset caches to keep Vite modules fresh.

Project skills ship with the installed TanStack packages and are refreshed by dependency updates. `@tanstack/intent` is a locked dev dependency; `package.json` explicitly lists permitted skill sources.

```bash
pnpm run skills:list
pnpm exec intent load @tanstack/react-start#react-start
pnpm exec intent load @tanstack/start-client-core#start-core/server-functions
pnpm run skills:install   # Refresh the managed instructions in AGENTS.md
```

See [AGENTS.md](AGENTS.md) for contributor guidance, [CONTEXT.md](CONTEXT.md) for architecture, [AUDIT.md](AUDIT.md) for findings, and [POLISH_LOG.md](POLISH_LOG.md) for the historical change log.

<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Attendance QR — Project Context

## Scaffolding

Generated with TanStack CLI:

```bash
npx @tanstack/cli@latest create attendance-qr-cf --agent --framework react --no-examples --deployment cloudflare --force
```

Then TanStack Intent was wired:

```bash
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
npx @tanstack/intent@latest load @tanstack/react-start#react-start
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/deployment
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-functions
```

## Stack

- **Framework:** TanStack Start + React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Deployment:** Cloudflare Workers via `@cloudflare/vite-plugin`
- **Database:** Cloudflare D1 (SQLite)
- **QR scanning:** html5-qrcode (CDN)
- **Excel parsing:** xlsx (SheetJS)
- **QR generation:** qrcode

## Project structure

```
src/
  components/        # Shared UI components (Button, Card, Badge, ConfirmDialog,
                     #   EmptyState, ErrorFallback, IdentityBar, SlideButton)
  db/
    schema.ts        # SQL schema and migration helpers
    client.ts        # D1 access helper
  hooks/
    useLoading.ts    # Loading-state tracker for async operations
  routes/
    __root.tsx       # Root layout (error boundaries, theme)
    index.tsx        # Staff check-in page
    qr.tsx           # Public QR display page
    history.tsx      # Staff personal check-in history
    print-qr.tsx     # Print-friendly QR page (standalone route)
    about.tsx        # About page
    admin.tsx        # Admin dashboard (~464 lines orchestration)
    admin/
      -components/   # Section components (AdminHeader, AttendanceSummary,
                     #   AuditEvent, AuditLogSection, MessageBanner,
                     #   QrSection, RefreshError, RosterSection,
                     #   RotaStaffSection, SectionNav, SessionEditForm,
                     #   SessionSection, WeeklyRollupSection,
                     #   WhoIsInSection)
      -hooks.ts      # Admin page shared hooks
      -types.ts      # Admin page shared types
    api/
      export[.]csv.ts  # CSV export endpoint (uses papaparse)
  utils/
    auth.ts          # Admin PIN check, HMAC tokens, rate limiting
    audit.ts         # Audit log writer
    dateTime.ts      # UK timezone dates, relative time, shift parsing
    rotaParser.ts    # Excel/CSV rota parsing
    rotas.functions.ts     # Server functions for rotas
    sessions.functions.ts  # Server functions: check-in/out, admin dashboard,
                           #   rate limiting, audit pruning, CSV export
  theme.css          # Tailwind v4 design tokens
  styles.css         # Global styles importing theme.css
  router.tsx         # TanStack Router config
  routeTree.gen.ts   # Auto-generated route tree
```

## Environment variables / secrets

Configured in `wrangler.jsonc` (plain vars) and `.dev.vars` (local secrets):

- `ADMIN_PIN` — default `Wh!ppscross`
- `QR_SEED` — secret salt used to derive deterministic daily QR codes from the date

For production, override with Wrangler secrets:

```bash
npx wrangler secret put ADMIN_PIN
npx wrangler secret put QR_SEED
```

## D1 setup

1. Create the database:
   ```bash
   npx wrangler d1 create attendance-qr-db
   ```
2. Copy the database ID into `wrangler.jsonc`.
3. Run migrations:
   ```bash
   npx wrangler d1 migrations apply attendance-qr-db --local
   npx wrangler d1 migrations apply attendance-qr-db --remote
   ```

Schema is managed in `src/db/schema.ts` and mirrored in `migrations/0001_init.sql`.

## Local dev

```bash
npm run build
npx wrangler dev --local
```

Then open http://localhost:8787.

Note: `npm run dev` may fail on Node 24 with a `registerHooks` error in `@cloudflare/vite-plugin`. Use `npx wrangler dev --local` after building instead.

## Deploy

```bash
npm run deploy
```

## Key architectural decisions

1. **Isomorphic-by-default:** TanStack Start code runs on both client and server. All DB access and secrets live inside `createServerFn` handlers.
2. **Daily static QR:** One QR code per day, printed and placed on the notice board. The QR encodes a URL with a day token validated server-side. Tokens are derived deterministically from the date using `QR_SEED`, so codes can be pre-printed for weekends/holidays.
3. **Rota-driven staff list:** Each morning the admin uploads the daily rota Excel. Staff names/roles/shifts are parsed and stored in D1.
4. **Ad-hoc staff / locums:** Admin can add manual staff entries from the admin page. A "Not on the rota?" link on the staff page tells locums to ask an admin.
5. **Check-out policy:** Mandatory checkout; auto-close sessions at scheduled shift end + 60 minutes; admin can edit or delete sessions.
6. **Accidental check-in/out:** Staff can tap "Undo last check-in/out" immediately. Admin can also delete or edit sessions from the dashboard.
7. **Audit log:** Every check-in, check-out, admin edit, and rota upload is written to `audit_log` and shown on the admin page.
8. **Data retention:** Indefinite until manually exported/deleted by admin.

## Known gotchas

- D1 bindings are per-request in Cloudflare Workers. Do not read `process.env.DB` at module scope; use the request-scoped binding via `getRequest()` / `cloudflare:workers`.
- Server functions are public RPC endpoints. Admin PIN checks must happen inside the handler.
- Loaders are isomorphic; do not put DB queries directly in loaders. Wrap them in `createServerFn`.
- `html5-qrcode` is loaded from unpkg CDN to avoid bundling camera permissions into the server bundle.

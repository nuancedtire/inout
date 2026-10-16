# Attendance QR

QR-code based check-in/check-out for a department ward. Built with TanStack Start + Cloudflare Workers + D1.

## Flow

1. Admin uploads the daily rota Excel on `/admin`.
2. The system generates a daily QR code on `/qr`.
3. Print the QR code and put it on the notice board.
4. Staff scan the QR with their phone camera, select their name, and tap Check In / Check Out.
5. Admin dashboard shows who is in and exports CSV.

## Stack

- TanStack Start (React)
- Cloudflare Workers (Nitro `cloudflare-module` preset)
- Cloudflare D1
- xlsx (SheetJS) for rota parsing
- qrcode for QR generation

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a D1 database:
   ```bash
   npx wrangler d1 create inout-db
   ```
   Copy the `database_id` into `wrangler.jsonc`.

3. Apply migrations:
   ```bash
   npx wrangler d1 migrations apply inout-db
   ```

4. Run locally:
   ```bash
   npm run build
   npx wrangler dev --local
   ```
   Then open http://localhost:8787

   Note: `npm run dev` may fail on Node 24 due to a `@cloudflare/vite-plugin` compatibility issue. Use `npx wrangler dev --local` instead.

5. Deploy:
   ```bash
   npm run build
   npx wrangler deploy
   ```

## Admin PIN

Default: `Wh!ppscross`

Set a different PIN via the `ADMIN_PIN` environment variable:
```bash
npx wrangler secret put ADMIN_PIN
```

## Testing

```bash
pnpm test             # Run all tests
pnpm test:watch       # Rerun tests as files change
pnpm test:unit        # Pure logic and React component tests
pnpm test:workers     # Workers runtime and D1 integration tests
```

The standalone `vitest.config.ts` keeps the app's build plugins out of tests.
Put pure logic tests in `test/unit/*.test.ts`; component tests use `.test.tsx`
with a `// @vitest-environment jsdom` comment. Put tests needing Cloudflare
bindings in `test/workers/*.test.ts`.

Workers tests use [Cloudflare's Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
to run locally in workerd with the compatibility settings and D1 binding from
`wrangler.jsonc`. They apply the real SQL migrations, override credentials with
test-only values, and use disposable storage. Each test starts with empty app
tables. No Cloudflare login or remote database is needed.

These tests import application modules directly; the test Worker entry is empty
because TanStack's SSR entry requires the app build. HTTP routing, server-function
RPC, browser navigation, and camera scanning need separate end-to-end coverage.

The initial suite covers rota imports, UK date formatting, confirmation behavior,
admin authentication and expiry, D1 session constraints, and audit writes. Parser
fixtures are generated in memory, so no sample spreadsheets are required.

Check TypeScript for both environments with:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p test/workers/tsconfig.json
```

## Rota Excel format

The parser is flexible. It looks for a header row containing `Name` and `Shift`, detects tier/role section headers like `Tier A`, `Consultants`, `Nurses`, and extracts staff below each tier.

Supported shift formats:
- `0800-1800`
- `08-1800`
- `13:00-23:45`
- `08:00-20:00`

A sample file is included: `sample-rota.xlsx`

## Routes

- `/` — staff check-in/check-out
- `/admin` — rota upload, QR code, ad-hoc staff, live dashboard, CSV export
- `/qr` — printable QR code for the notice board
- `/api/export.csv` — CSV export endpoint

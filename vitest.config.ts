import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const resolve = {
  alias: {
    '#': fileURLToPath(new URL('./src', import.meta.url)),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve,
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            // These tests import server modules directly; Start's SSR entry needs its build plugins.
            main: './test/workers/entry.ts',
            miniflare: {
              bindings: {
                ADMIN_PIN: 'test-admin-pin',
                QR_SEED: 'test-qr-seed',
                TEST_MIGRATIONS: await readD1Migrations('./drizzle/migrations'),
              },
            },
          })),
        ],
        test: {
          name: 'workers',
          include: ['test/workers/**/*.test.ts'],
          setupFiles: ['./test/workers/setup.ts'],
        },
      },
    ],
  },
})

import type { D1Migration } from '@cloudflare/vitest-plugin'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      ADMIN_PIN: string
      QR_SEED: string
      VAPID_PUBLIC_KEY: string
      VAPID_PRIVATE_KEY: string
      VAPID_SUBJECT: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach } from 'vitest'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

// Workers storage is isolated per file. Clear rows between tests in FK order.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM webauthn_challenges'),
    env.DB.prepare('DELETE FROM staff_credentials'),
    env.DB.prepare('DELETE FROM roster_entries'),
    env.DB.prepare('DELETE FROM rotas'),
    env.DB.prepare('DELETE FROM staff'),
    env.DB.prepare('DELETE FROM site_settings'),
    env.DB.prepare('DELETE FROM audit_log'),
  ])
})

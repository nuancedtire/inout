/**
 * The department's permanent check-in code. Posters carry `/?token=<code>`; phones remember it.
 * The code is random (not derived from a secret), stored in `site_settings.qr_token`, returned
 * only to administrators, and replaceable when a photo of it circulates. Every attendance action
 * also carries passkey and location evidence, so the code alone is never proof of presence.
 *
 * Daily rota tokens (`rotas.token`) are still accepted so codes printed before the switch keep
 * working for their day, but no public endpoint returns them any more.
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from './schema'
import { rotas, siteSettings, type Rota } from './schema'
import { deriveTokenForDate } from '#/utils/auth'
import { todayDate } from '#/utils/dateTime'

type Db = DrizzleD1Database<typeof schema>

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 12 random RFC 4648 base32 characters (60 bits), matching the existing token format. */
export function randomCheckInCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => BASE32[b & 31]).join('')
}

export async function getOrCreateCheckInCode(db: Db): Promise<string> {
  const read = async () => (await db.select({ code: siteSettings.qrToken }).from(siteSettings).where(eq(siteSettings.id, 1)).get())?.code
  const existing = await read()
  if (existing) return existing
  // Concurrent first requests converge on one code: an existing value always wins.
  const code = randomCheckInCode()
  await db.insert(siteSettings).values({ id: 1, qrToken: code }).onConflictDoNothing()
  await db.update(siteSettings).set({ qrToken: code }).where(and(eq(siteSettings.id, 1), isNull(siteSettings.qrToken)))
  return (await read()) ?? code
}

/** Issue a new permanent code; every existing poster stops working at once. */
export async function replaceCheckInCode(db: Db): Promise<string> {
  const code = randomCheckInCode()
  await db.insert(siteSettings).values({ id: 1, qrToken: code })
    .onConflictDoUpdate({ target: siteSettings.id, set: { qrToken: code } })
  return code
}

/** The rota row for a date, created on first use (sessions always hang off a dated rota). */
export async function ensureRotaForDate(db: Db, date: string): Promise<Rota> {
  const existing = await db.select().from(rotas).where(eq(rotas.date, date)).get()
  if (existing) return existing
  await db.insert(rotas).values({ date, token: await deriveTokenForDate(date) }).onConflictDoNothing()
  const created = await db.select().from(rotas).where(eq(rotas.date, date)).get()
  if (!created) throw new Error('Failed to create rota')
  return created
}

/**
 * Validate a check-in code and return today's rota (created if missing, so a day without an
 * uploaded rota never blocks attendance). Accepts the permanent code or today's legacy daily token.
 */
export async function requireCheckInCode(db: Db, code: string): Promise<Rota> {
  const rota = await ensureRotaForDate(db, todayDate())
  if (code && code === rota.token) return rota
  const permanent = (await db.select({ code: siteSettings.qrToken }).from(siteSettings).where(eq(siteSettings.id, 1)).get())?.code
  if (permanent && code === permanent) return rota
  throw new Error('Invalid or expired QR code')
}

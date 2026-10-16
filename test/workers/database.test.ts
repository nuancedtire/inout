import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '#/db/client'
import { auditLog, rosterEntries, rotas, sessions } from '#/db/schema'
import { logAudit } from '#/utils/audit'

async function seedStaff() {
  const db = await getDb()
  const [rota] = await db.insert(rotas).values({ date: '2026-10-16', token: 'test-token' }).returning()
  const [staff] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Alice Smith' }).returning()
  return { db, rota, staff }
}

describe('D1 with production migrations', () => {
  it('persists a check-in and check-out through the application database client', async () => {
    const { db, staff } = await seedStaff()
    const [session] = await db.insert(sessions).values({ rosterEntryId: staff.id, checkInAt: '2026-10-16T08:00:00Z' }).returning()
    await db.update(sessions).set({ checkOutAt: '2026-10-16T16:00:00Z' }).where(eq(sessions.id, session.id))
    expect(await db.select().from(sessions)).toMatchObject([
      { rosterEntryId: staff.id, checkInAt: '2026-10-16T08:00:00Z', checkOutAt: '2026-10-16T16:00:00Z' },
    ])
  })

  it('allows only one open session per staff member, then permits another after checkout', async () => {
    const { db, staff } = await seedStaff()
    const checkIn = { rosterEntryId: staff.id, checkInAt: '2026-10-16T08:00:00Z' }
    const [session] = await db.insert(sessions).values(checkIn).returning()
    await expect(env.DB.prepare('INSERT INTO sessions (roster_entry_id, check_in_at) VALUES (?, ?)').bind(staff.id, checkIn.checkInAt).run())
      .rejects.toThrow(/UNIQUE constraint failed/)
    await db.update(sessions).set({ checkOutAt: '2026-10-16T12:00:00Z' }).where(eq(sessions.id, session.id))
    await db.insert(sessions).values({ ...checkIn, checkInAt: '2026-10-16T13:00:00Z' })
    expect(await db.select().from(sessions)).toHaveLength(2)
  })

  it('cascades roster deletion when an unused rota is removed', async () => {
    const { db, rota } = await seedStaff()
    await db.delete(rotas).where(eq(rotas.id, rota.id))
    expect(await db.select().from(rosterEntries)).toEqual([])
  })

  it('writes audit details and actor through the application audit writer', async () => {
    await logAudit('check_in', { rosterEntryId: 42 }, 'Alice Smith')
    const db = await getDb()
    expect(await db.select().from(auditLog)).toMatchObject([
      { event: 'check_in', details: '{"rosterEntryId":42}', actor: 'Alice Smith' },
    ])
  })
})

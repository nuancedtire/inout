import { describe, expect, it, vi } from 'vitest'
import { getDb } from '#/db/client'
import { rotas, siteSettings } from '#/db/schema'
import { todayDate } from '#/utils/dateTime'
import { adminToken, freshIp } from './harness'

vi.mock('@tanstack/react-start', async () => (await import('./harness')).startMock)
vi.mock('@tanstack/react-start/server', async () => (await import('./harness')).startServerMock)

describe('permanent check-in code', () => {
  it('is admin-only, stable, accepted for attendance and replaceable', async () => {
    freshIp()
    const { adminGetCheckInCode, adminReplaceCheckInCode, getTodayRoster } = await import('#/utils/rotas.functions')
    const { beginPasskeyAuth } = await import('#/utils/passkeys.functions')
    const authToken = await adminToken()

    await expect(adminGetCheckInCode({ data: { authToken: 'nope' } })).rejects.toThrow(/Unauthorized/)
    const { token } = await adminGetCheckInCode({ data: { authToken } })
    expect(token).toMatch(/^[A-Z2-7]{12}$/)
    expect((await adminGetCheckInCode({ data: { authToken } })).token).toBe(token)

    // The public roster creates today's rota but never reveals any code.
    const roster = await getTodayRoster()
    expect(roster.rota?.date).toBe(todayDate())
    expect(JSON.stringify(roster)).not.toContain(token)

    await expect(beginPasskeyAuth({ data: { token } })).resolves.toHaveProperty('optionsJSON')

    const replaced = (await adminReplaceCheckInCode({ data: { authToken } })).token
    expect(replaced).not.toBe(token)
    await expect(beginPasskeyAuth({ data: { token } })).rejects.toThrow(/Invalid or expired QR/)
    await expect(beginPasskeyAuth({ data: { token: replaced } })).resolves.toHaveProperty('optionsJSON')
  })

  it('keeps a saved department area when the code is created, and vice versa', async () => {
    const db = await getDb()
    const { adminGetCheckInCode } = await import('#/utils/rotas.functions')
    await db.insert(siteSettings).values({ id: 1, latitude: 51.5, longitude: -0.12, radiusM: 120, accuracyCeilingM: 80 })
    const { token } = await adminGetCheckInCode({ data: { authToken: await adminToken() } })
    const [row] = await db.select().from(siteSettings)
    expect(row).toMatchObject({ latitude: 51.5, radiusM: 120, qrToken: token })
    expect(await db.select().from(rotas)).toHaveLength(0)
  })
})

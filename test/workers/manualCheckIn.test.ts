import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '#/db/client'
import { auditLog, rosterEntries, rotas, sessions } from '#/db/schema'
import { todayDate } from '#/utils/dateTime'
import { manualCheckIn } from '#/utils/sessions.functions'

// Exercise the application's validator and handler with real D1. Only the RPC
// transport/request context are replaced; HTTP behaviour is checked in-browser.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => ({
      handler: (handler: (args: { data: unknown }) => unknown) => async ({ data }: { data: unknown }) => handler({ data: validate(data) }),
    }),
  }),
}))
const request = vi.hoisted(() => ({ ip: '192.0.2.1' as string | undefined }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: (name: string) => name === 'CF-Connecting-IP' ? request.ip : undefined,
}))

afterEach(() => vi.restoreAllMocks())

const input = { name: ' Alice Example ', role: ' Nurse ', token: 'ABCDEFGHIJKL' }

describe('manual check-in handler', () => {
  it('blocks excess submissions before writes, isolates clients, and permits retries after expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    request.ip = '192.0.2.1'
    const db = await getDb()
    await db.insert(rotas).values({ date: todayDate(), token: input.token })
    for (let i = 0; i < 10; i++) await manualCheckIn({ data: { ...input, name: `Staff ${i}` } })
    await expect(manualCheckIn({ data: { ...input, name: 'Different name' } })).rejects.toThrow(/Too many check-ins/)
    expect(await db.select().from(rosterEntries)).toHaveLength(10)
    expect(await db.select().from(sessions)).toHaveLength(10)
    expect(await db.select().from(auditLog)).toHaveLength(10)
    request.ip = '192.0.2.2'
    await expect(manualCheckIn({ data: input })).resolves.toMatchObject({ ok: true })
    expect(await db.select().from(rosterEntries)).toContainEqual(expect.objectContaining({ name: 'Alice Example', role: 'Nurse' }))
    request.ip = '192.0.2.1'
    now.mockReturnValue(1_060_000)
    await expect(manualCheckIn({ data: input })).resolves.toMatchObject({ ok: true })
    expect(await db.select().from(sessions)).toHaveLength(12)
  })

  it('rejects malformed inputs, missing rotas and incorrect tokens without creating records', async () => {
    request.ip = '192.0.2.3'
    const db = await getDb()
    await expect(manualCheckIn({ data: { ...input, name: ' ' } })).rejects.toThrow(/name/)
    await expect(manualCheckIn({ data: input })).rejects.toThrow(/No rota/)
    await db.insert(rotas).values({ date: todayDate(), token: 'MNOPQRSTUVWX' })
    for (let i = 0; i < 9; i++) await expect(manualCheckIn({ data: input })).rejects.toThrow(/Invalid or expired/)
    await expect(manualCheckIn({ data: input })).rejects.toThrow(/Too many check-ins/)
    expect(await db.select().from(rosterEntries)).toEqual([])
    expect(await db.select().from(sessions)).toEqual([])
    expect(await db.select().from(auditLog)).toEqual([])
  })
})

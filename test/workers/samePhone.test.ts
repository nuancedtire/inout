import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rosterEntries, sessions, staffCredentials } from '#/db/schema'
import { hashDeviceId } from '#/utils/deviceMarker'
import { todayDate } from '#/utils/dateTime'
import { act, adminToken, enrol, freshIp, seedTodayRota, TOKEN } from './harness'

vi.mock('@tanstack/react-start', async () => (await import('./harness')).startMock)
vi.mock('@tanstack/react-start/server', async () => (await import('./harness')).startServerMock)

beforeEach(() => freshIp())

const PHONE_A = 'phoneAAAAAAAAAAAAAAAAA'
const PHONE_B = 'phoneBBBBBBBBBBBBBBBBB'

async function enrolments() {
  const { adminListEnrolments } = await import('#/utils/staff.functions')
  return (await adminListEnrolments({ data: { authToken: await adminToken(), status: 'all' } })).enrolments
}

async function dashboard() {
  const { adminGetDashboard } = await import('#/utils/sessions.functions')
  return adminGetDashboard({ data: { authToken: await adminToken(), date: todayDate() } })
}

describe('same-phone marker', () => {
  it('stores only a hash, and shows each enrolment who else the phone was set up for', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrol({ name: 'Alice' }, { deviceId: PHONE_A })
    const bob = await enrol({ name: 'Bob' }, { deviceId: PHONE_A })
    const cara = await enrol({ name: 'Cara' }, { deviceId: PHONE_B })
    await enrol({ name: 'Dev' })

    const creds = await db.select({ id: staffCredentials.id, hash: staffCredentials.deviceHash }).from(staffCredentials)
    expect(creds.find((c) => c.id === alice.finished.credential.id)?.hash).toBe(await hashDeviceId(PHONE_A))
    expect(JSON.stringify(creds)).not.toContain(PHONE_A)

    const byName = Object.fromEntries((await enrolments()).map((e) => [e.staffName, e.samePhoneAs]))
    expect(byName).toEqual({ Alice: ['Bob'], Bob: ['Alice'], Cara: [], Dev: [] })
    expect(bob.finished.credential.status).toBe('pending')
    expect(cara.finished.staff.name).toBe('Cara')
  })

  it('flags sessions when one phone checks in two people, including a name-picked check-in', async () => {
    const { db, rota } = await seedTodayRota()
    const alice = await enrol({ name: 'Alice' }, { deviceId: PHONE_A })
    await act(alice.authenticator, 'check_in', { deviceId: PHONE_A, location: { status: 'denied' } })
    const [bob] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Bob' }).returning()
    const { checkIn } = await import('#/utils/sessions.functions')
    await checkIn({ data: { token: TOKEN, rosterEntryId: bob.id, deviceId: PHONE_A } })
    const [cara] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Cara' }).returning()
    await checkIn({ data: { token: TOKEN, rosterEntryId: cara.id, deviceId: PHONE_B } })

    const dash = await dashboard()
    const byName = Object.fromEntries(dash.sessions.map((s) => [s.name, s]))
    expect(byName.Alice.samePhoneWith).toEqual(['Bob'])
    expect(byName.Alice.reasons).toContain('shared_phone')
    expect(byName.Bob.samePhoneWith).toEqual(['Alice'])
    expect(byName.Bob.reasons).toContain('shared_phone')
    expect(byName.Cara.samePhoneWith).toEqual([])
    expect(byName.Cara.reasons).not.toContain('shared_phone')
    expect(dash.present.find((p) => p.name === 'Bob')?.samePhoneWith).toEqual(['Alice'])

    const { adminExportSessions } = await import('#/utils/sessions.functions')
    const exported = await adminExportSessions({ data: { authToken: await adminToken(), startDate: todayDate(), endDate: todayDate() } })
    expect(exported.rows.find((r) => r.name === 'Bob')?.same_phone_with).toEqual(['Alice'])
    expect((await enrolments())[0].samePhoneAs).toEqual(['Bob'])
  })

  it('does not flag one person checking in and out on the same phone, or sessions far apart', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrol({ name: 'Alice' }, { deviceId: PHONE_A })
    await act(alice.authenticator, 'check_in', { deviceId: PHONE_A })
    await act(alice.authenticator, 'check_out', { deviceId: PHONE_A })
    await act(alice.authenticator, 'check_in', { deviceId: PHONE_A })
    expect((await dashboard()).sessions.flatMap((s) => s.reasons)).not.toContain('shared_phone')

    // Bob used the phone two days ago: outside the 12-hour window for today's sessions.
    const bob = await enrol({ name: 'Bob' })
    await act(bob.authenticator, 'check_in', { deviceId: PHONE_A })
    await db.update(sessions).set({ checkInAt: new Date(Date.now() - 48 * 3_600_000).toISOString() })
      .where(eq(sessions.credentialIdIn, bob.finished.credential.id))
    expect((await dashboard()).sessions.flatMap((s) => s.reasons)).not.toContain('shared_phone')
  })

  it('ignores a missing or malformed marker without blocking the shift', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrol({ name: 'Alice' }, { deviceId: 'not a marker!' })
    const res = await act(alice.authenticator, 'check_in', { deviceId: 'x' })
    expect(res.result?.action).toBe('check_in')
    expect(await db.select({ a: sessions.deviceHashIn }).from(sessions)).toEqual([{ a: null }])
    expect(await db.select({ h: staffCredentials.deviceHash }).from(staffCredentials)).toEqual([{ h: null }])
  })
})

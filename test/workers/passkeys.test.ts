import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAttendanceEntry } from '#/db/attendance'
import { auditLog, rosterEntries, sessions, staffCredentials, webauthnChallenges } from '#/db/schema'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { SoftAuthenticator } from './softAuthenticator'
import { act, adminToken, enrol, freshIp, ORIGIN, passkeyFns, RP_ID, request, seedTodayRota, TOKEN } from './harness'

vi.mock('@tanstack/react-start', async () => (await import('./harness')).startMock)
vi.mock('@tanstack/react-start/server', async () => (await import('./harness')).startServerMock)

beforeEach(() => freshIp())

async function setStatus(credentialId: string, status: 'approved' | 'rejected' | 'revoked') {
  const { adminSetCredentialStatus } = await import('#/utils/staff.functions')
  return adminSetCredentialStatus({ data: { authToken: await adminToken(), credentialId, status } })
}

describe('passkey enrolment (SimpleWebAuthn v14 under workerd)', () => {
  it('creates a pending credential linked to a stable staff record and today\'s entry', async () => {
    const { db, rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Alice Example', role: 'Nurse' }).returning()

    const { begun, finished, authenticator } = await enrol({ rosterEntryId: entry.id })

    expect(begun.optionsJSON).toMatchObject({
      rp: { id: RP_ID, name: 'InOut' },
      user: { name: 'Alice Example', displayName: 'Alice Example' },
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      pubKeyCredParams: [{ alg: -8 }, { alg: -7 }, { alg: -257 }],
    })
    expect(begun.optionsJSON.authenticatorSelection).not.toHaveProperty('authenticatorAttachment')
    expect(begun.optionsJSON.hints ?? []).toEqual([])
    expect(isoBase64URL.toUTF8String(begun.optionsJSON.user.id)).toBe(`inout-staff-${begun.staff.id}`)

    expect(finished).toMatchObject({ staff: { name: 'Alice Example', role: 'Nurse' }, credential: { id: authenticator.credentialId, status: 'pending' } })
    expect(finished.status).toMatchObject({ checkedIn: false, rosterEntryId: entry.id })
    expect(finished.session).toBeUndefined()
    const [cred] = await db.select().from(staffCredentials)
    expect(cred).toMatchObject({ status: 'pending', staffId: begun.staff.id, counter: 0, label: 'iPhone', deviceType: 'multiDevice', backedUp: true })
    expect(JSON.parse(cred.transports!)).toEqual(['internal', 'hybrid'])
    expect(await db.select({ staffId: rosterEntries.staffId }).from(rosterEntries)).toEqual([{ staffId: begun.staff.id }])
    expect(await db.select().from(webauthnChallenges)).toEqual([])
    expect((await db.select().from(auditLog)).map((a) => a.event)).toEqual(['passkey_enrolled'])
  })

  it('enrols a locum by name, creates a linked manual entry and checks in with one Face ID', async () => {
    const { db } = await seedTodayRota()
    const { finished } = await enrol({ name: ' Dr Locum ', role: 'Registrar' }, { checkIn: { location: { status: 'denied' } } })
    expect(finished.session).toMatchObject({ action: 'check_in', identity: 'passkey_pending', location: 'not_requested', verified: false })
    expect(finished.session?.reasons).toEqual(['identity_pending', 'location_not_checked'])
    const [entry] = await db.select().from(rosterEntries)
    expect(entry).toMatchObject({ name: 'Dr Locum', role: 'Registrar', source: 'manual', staffId: finished.staff.id })
    expect(await db.select().from(sessions)).toMatchObject([{ rosterEntryId: entry.id, identityIn: 'passkey_pending', credentialIdIn: finished.credential.id }])
    expect(finished.status).toMatchObject({ checkedIn: true, rosterEntryId: entry.id })
  })

  it('requires user verification at enrolment and rejects a reused registration', async () => {
    const { db } = await seedTodayRota()
    await expect(enrol({ name: 'No UV' }, { overrides: { userVerified: false } })).rejects.toThrow(/couldn't be checked/)
    expect(await db.select().from(staffCredentials)).toEqual([])

    const { authenticator } = await enrol({ name: 'Twice' })
    await expect(enrol({ name: 'Twice' }, { authenticator })).rejects.toThrow(/already set up/)
    expect(await db.select().from(staffCredentials)).toHaveLength(1)
  })

  it('excludes existing credentials and keeps a second phone pending even after approval of the first', async () => {
    const { db, rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Bea' }).returning()
    const first = await enrol({ rosterEntryId: entry.id })
    await setStatus(first.authenticator.credentialId, 'approved')
    const second = await enrol({ rosterEntryId: entry.id })
    expect(second.begun.optionsJSON.excludeCredentials).toEqual([{ id: first.authenticator.credentialId, type: 'public-key', transports: ['internal', 'hybrid'] }])
    expect(second.finished.credential.status).toBe('pending')
    expect(second.finished.staff.id).toBe(first.finished.staff.id)
  })
})

describe('admin approval, rejection and revocation', () => {
  it('approves, then revokes; recorded sessions keep their original assurance', async () => {
    const { db } = await seedTodayRota()
    const { authenticator, finished } = await enrol({ name: 'Cara' })
    const id = authenticator.credentialId

    expect((await act(authenticator, 'check_in')).result).toMatchObject({ identity: 'passkey_pending' })
    await setStatus(id, 'approved')
    const out = await act(authenticator, 'check_out')
    expect(out).toMatchObject({ credentialStatus: 'approved', result: { action: 'check_out', identity: 'passkey' } })
    await expect(setStatus(id, 'approved')).rejects.toThrow(/cannot be approved/)

    await setStatus(id, 'revoked')
    await expect(act(authenticator, 'check_in')).rejects.toThrow(/turned off/)
    expect(await db.select({ i: sessions.identityIn, o: sessions.identityOut }).from(sessions)).toEqual([{ i: 'passkey_pending', o: 'passkey' }])
    const events = (await db.select().from(auditLog)).map((a) => a.event)
    expect(events).toEqual(expect.arrayContaining(['passkey_enrolled', 'passkey_approved', 'passkey_revoked']))

    const { getStaffStatus } = await passkeyFns()
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: finished.staffToken } })).toEqual({ staff: null })
  })

  it('rejects a pending credential so it is no longer accepted', async () => {
    await seedTodayRota()
    const { authenticator } = await enrol({ name: 'Dan' })
    await setStatus(authenticator.credentialId, 'rejected')
    await expect(act(authenticator, 'identify')).rejects.toThrow(/turned off/)
    await expect(setStatus(authenticator.credentialId, 'approved')).rejects.toThrow(/rejected/)
  })

  it('requires admin credentials', async () => {
    const { adminSetCredentialStatus, adminListEnrolments } = await import('#/utils/staff.functions')
    await expect(adminSetCredentialStatus({ data: { authToken: 'nope', credentialId: 'abc', status: 'approved' } })).rejects.toThrow(/Unauthorized/)
    await expect(adminListEnrolments({ data: { authToken: 'nope' } })).rejects.toThrow(/Unauthorized/)
  })

  it('treats a deactivated staff record like a revoked passkey, and restores it on reactivation', async () => {
    const { db, rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Fay' }).returning()
    const { authenticator, finished } = await enrol({ rosterEntryId: entry.id })
    await setStatus(authenticator.credentialId, 'approved')
    const { adminSetStaffActive } = await import('#/utils/staff.functions')
    const { getStaffStatus, beginEnrolment } = await passkeyFns()

    await adminSetStaffActive({ data: { authToken: await adminToken(), staffId: finished.staff.id, active: false } })
    for (const action of ['identify', 'check_in'] as const) {
      await expect(act(authenticator, action)).rejects.toThrow('This profile has been turned off. Ask the coordinator.')
    }
    expect(await db.select().from(sessions)).toEqual([])
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: finished.staffToken } })).toEqual({ staff: null })
    await expect(beginEnrolment({ data: { token: TOKEN, rosterEntryId: entry.id } })).rejects.toThrow(/turned off/)

    // A set-up started before deactivation cannot be finished afterwards.
    await adminSetStaffActive({ data: { authToken: await adminToken(), staffId: finished.staff.id, active: true } })
    const begun = await beginEnrolment({ data: { token: TOKEN, rosterEntryId: entry.id } })
    await adminSetStaffActive({ data: { authToken: await adminToken(), staffId: finished.staff.id, active: false } })
    const second = await SoftAuthenticator.create(RP_ID, ORIGIN)
    const { finishEnrolment } = await passkeyFns()
    await expect(finishEnrolment({ data: { token: TOKEN, response: await second.register(begun.optionsJSON) } })).rejects.toThrow(/turned off/)
    expect(await db.select().from(staffCredentials)).toHaveLength(1)

    await adminSetStaffActive({ data: { authToken: await adminToken(), staffId: finished.staff.id, active: true } })
    expect((await act(authenticator, 'check_in')).result).toMatchObject({ action: 'check_in', identity: 'passkey' })
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: finished.staffToken } })).toMatchObject({ staff: { id: finished.staff.id } })
  })

  it('lists pending enrolments with staff details', async () => {
    await seedTodayRota()
    const { authenticator } = await enrol({ name: 'Eve', role: 'HCA' })
    const { adminListEnrolments } = await import('#/utils/staff.functions')
    const { enrolments } = await adminListEnrolments({ data: { authToken: await adminToken() } })
    expect(enrolments).toMatchObject([{ credentialId: authenticator.credentialId, staffName: 'Eve', staffRole: 'HCA', status: 'pending', label: 'iPhone', sessionsCount: 0, otherApprovedCount: 0 }])
  })
})

describe('passkey-signed actions', () => {
  it('identifies, checks in, checks out and undoes, updating counter and last use in the same batch', async () => {
    const { db } = await seedTodayRota()
    const { authenticator, finished } = await enrol({ name: 'Finn' })
    await setStatus(authenticator.credentialId, 'approved')

    const who = await act(authenticator, 'identify')
    expect(who).toMatchObject({ staff: { id: finished.staff.id, name: 'Finn' }, credentialStatus: 'approved', status: { checkedIn: false } })
    expect(who.result).toBeUndefined()
    expect(await db.select().from(sessions)).toEqual([])

    const checkIn = await act(authenticator, 'check_in')
    expect(checkIn.result).toMatchObject({ action: 'check_in', identity: 'passkey', location: 'not_requested', verified: false, reasons: ['location_not_checked'] })
    expect(checkIn.status).toMatchObject({ checkedIn: true, hasUndoableAction: true })
    await expect(act(authenticator, 'check_in')).rejects.toThrow("You're already checked in")

    expect((await act(authenticator, 'undo')).result?.action).toBe('checkin_undone')
    expect(await db.select().from(sessions)).toEqual([])
    await act(authenticator, 'check_in')
    expect((await act(authenticator, 'check_out')).result?.action).toBe('check_out')
    expect((await act(authenticator, 'undo')).result?.action).toBe('checkout_undone')
    expect(await db.select({ out: sessions.checkOutAt, idOut: sessions.identityOut }).from(sessions)).toEqual([{ out: null, idOut: null }])

    const [cred] = await db.select().from(staffCredentials)
    expect(cred.counter).toBe(authenticator.counter)
    expect(cred.lastUsedAt).not.toBeNull()
    const events = (await db.select().from(auditLog)).map((a) => a.event)
    expect(events.filter((e) => e === 'checked_in')).toHaveLength(2)
    const checkInAudit = (await db.select().from(auditLog).where(eq(auditLog.event, 'checked_in')))[0]
    expect(JSON.parse(checkInAudit.details!)).toMatchObject({ identity: 'passkey', staffId: finished.staff.id, credentialId: authenticator.credentialId, sessionId: expect.any(Number) })
  })

  it('creates a linked manual entry when the staff member is not on today\'s rota', async () => {
    const { db } = await seedTodayRota()
    const { authenticator, finished } = await enrol({ name: 'Gail' })
    const [original] = await db.select().from(rosterEntries)
    await deleteAttendanceEntry(db, original.id)
    await expect(act(authenticator, 'check_out')).rejects.toThrow("You're not checked in")
    expect(await db.select().from(rosterEntries)).toEqual([])
    const res = await act(authenticator, 'check_in')
    const [entry] = await db.select().from(rosterEntries)
    expect(entry).toMatchObject({ name: 'Gail', source: 'manual', staffId: finished.staff.id })
    expect(res.status.rosterEntryId).toBe(entry.id)
  })

  it('records exactly one session for a concurrent double check-in', async () => {
    const { db } = await seedTodayRota()
    const { authenticator } = await enrol({ name: 'Hal' })
    const { beginPasskeyAuth, passkeyAction } = await passkeyFns()
    const [a, b] = await Promise.all([beginPasskeyAuth({ data: { token: TOKEN } }), beginPasskeyAuth({ data: { token: TOKEN } })])
    const ra = await authenticator.assert(a.optionsJSON)
    const rb = await authenticator.assert(b.optionsJSON)
    const results = await Promise.allSettled([
      passkeyAction({ data: { token: TOKEN, action: 'check_in', response: ra } }),
      passkeyAction({ data: { token: TOKEN, action: 'check_in', response: rb } }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe("You're already checked in")
    expect(await db.select().from(sessions)).toHaveLength(1)
    expect(await db.select().from(auditLog).where(eq(auditLog.event, 'checked_in'))).toHaveLength(1)
    expect(await db.select().from(rosterEntries)).toHaveLength(1)
  })

  it('refuses a name-picked undo of a passkey action, and a passkey undo of an admin change', async () => {
    const { db } = await seedTodayRota()
    const { authenticator } = await enrol({ name: 'Ivy' })
    await act(authenticator, 'check_in')
    const [entry] = await db.select().from(rosterEntries)
    const { undoLastAction, adminUpdateSession } = await import('#/utils/sessions.functions')
    await expect(undoLastAction({ data: { rosterEntryId: entry.id, token: TOKEN } })).rejects.toThrow(/recorded with a passkey/)
    await adminUpdateSession({ data: { authToken: await adminToken(), rosterEntryId: entry.id, checkOutAt: new Date().toISOString() } })
    await expect(act(authenticator, 'undo')).rejects.toThrow(/administrator/)
    expect(await db.select({ o: sessions.identityOut, l: sessions.locationOut }).from(sessions)).toEqual([{ o: 'admin', l: 'not_requested' }])
  })
})

describe('assertion verification failures', () => {
  async function approvedStaff() {
    const { db } = await seedTodayRota()
    const { authenticator } = await enrol({ name: 'Jo' })
    await setStatus(authenticator.credentialId, 'approved')
    return { db, authenticator }
  }

  it('rejects an unknown (never stored) challenge', async () => {
    const { db, authenticator } = await approvedStaff()
    const { passkeyAction } = await passkeyFns()
    const response = await authenticator.assert({ challenge: isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32))) })
    await expect(passkeyAction({ data: { token: TOKEN, action: 'check_in', response } })).rejects.toThrow(/expired or was already used/)
    expect(await db.select().from(sessions)).toEqual([])
  })

  it('rejects a reused challenge', async () => {
    const { db, authenticator } = await approvedStaff()
    const { beginPasskeyAuth, passkeyAction } = await passkeyFns()
    const { optionsJSON } = await beginPasskeyAuth({ data: { token: TOKEN } })
    const response = await authenticator.assert(optionsJSON)
    await passkeyAction({ data: { token: TOKEN, action: 'check_in', response } })
    await expect(passkeyAction({ data: { token: TOKEN, action: 'check_out', response } })).rejects.toThrow(/expired or was already used/)
    expect(await db.select({ out: sessions.checkOutAt }).from(sessions)).toEqual([{ out: null }])
  })

  it('rejects an expired challenge and prunes expired rows on the next begin', async () => {
    const { db, authenticator } = await approvedStaff()
    const { beginPasskeyAuth, passkeyAction } = await passkeyFns()
    const { optionsJSON } = await beginPasskeyAuth({ data: { token: TOKEN } })
    await db.update(webauthnChallenges).set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    await expect(passkeyAction({ data: { token: TOKEN, action: 'check_in', response: await authenticator.assert(optionsJSON) } })).rejects.toThrow(/expired/)
    await beginPasskeyAuth({ data: { token: TOKEN } })
    await db.update(webauthnChallenges).set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    await beginPasskeyAuth({ data: { token: TOKEN } })
    expect(await db.select().from(webauthnChallenges)).toHaveLength(1)
  })

  it.each([
    ['wrong origin', { origin: 'https://evil.test' }],
    ['wrong relying party ID', { rpId: 'evil.test' }],
    ['missing user verification', { userVerified: false }],
    ['wrong clientData type', { type: 'webauthn.create' }],
    ['mismatched user handle', { userHandle: isoBase64URL.fromUTF8String('inout-staff-999999') }],
  ])('rejects %s without recording attendance', async (_label, overrides) => {
    const { db, authenticator } = await approvedStaff()
    await expect(act(authenticator, 'check_in', { overrides })).rejects.toThrow(/couldn't be checked/)
    expect(await db.select().from(sessions)).toEqual([])
  })

  it('rejects a regressed signature counter and audits it', async () => {
    const { db, authenticator } = await approvedStaff()
    await act(authenticator, 'identify', { overrides: { counter: 10 } })
    await expect(act(authenticator, 'check_in', { overrides: { counter: 5 } })).rejects.toThrow(/could not be trusted/)
    await expect(act(authenticator, 'check_in', { overrides: { counter: 10 } })).rejects.toThrow(/could not be trusted/)
    expect(await db.select().from(sessions)).toEqual([])
    expect(await db.select().from(auditLog).where(eq(auditLog.event, 'passkey_counter_regression'))).toHaveLength(2)
    await expect(act(authenticator, 'check_in', { overrides: { counter: 11 } })).resolves.toMatchObject({ result: { action: 'check_in' } })
  })

  it('accepts authenticators that always report a zero counter', async () => {
    const { authenticator } = await approvedStaff()
    await act(authenticator, 'check_in', { overrides: { counter: 0 } })
    await expect(act(authenticator, 'check_out', { overrides: { counter: 0 } })).resolves.toMatchObject({ result: { action: 'check_out' } })
  })

  it('rejects an unknown credential', async () => {
    await approvedStaff()
    const stranger = await SoftAuthenticator.create(RP_ID, ORIGIN)
    await expect(act(stranger, 'check_in')).rejects.toThrow(/isn't set up/)
  })

  it('rejects a wrong QR token before touching the challenge', async () => {
    const { db, authenticator } = await approvedStaff()
    const { beginPasskeyAuth, passkeyAction } = await passkeyFns()
    const { optionsJSON } = await beginPasskeyAuth({ data: { token: TOKEN } })
    const response = await authenticator.assert(optionsJSON)
    await expect(passkeyAction({ data: { token: 'MNOPQRSTUVWX', action: 'check_in', response } })).rejects.toThrow(/Invalid or expired QR/)
    expect(await db.select().from(webauthnChallenges)).toHaveLength(1)
    await expect(beginPasskeyAuth({ data: { token: 'MNOPQRSTUVWX' } })).rejects.toThrow(/Invalid or expired QR/)
  })

  it('refuses passkeys on a non-HTTPS public origin', async () => {
    await seedTodayRota()
    request.url = 'http://inout.test/_serverFn/x'
    const { beginPasskeyAuth } = await passkeyFns()
    await expect(beginPasskeyAuth({ data: { token: TOKEN } })).rejects.toThrow(/HTTPS/)
  })
})

describe('remembered staff token', () => {
  it('returns the staff record and status, and nothing for a forged or foreign token', async () => {
    await seedTodayRota()
    const { finished } = await enrol({ name: 'Kit' }, { checkIn: {} })
    const { getStaffStatus } = await passkeyFns()
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: finished.staffToken } })).toMatchObject({
      staff: { id: finished.staff.id, name: 'Kit' }, credentialStatus: 'pending', status: { checkedIn: true },
    })
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: await adminToken() } })).toEqual({ staff: null })
    expect(await getStaffStatus({ data: { token: TOKEN, staffToken: `${finished.staffToken}x` } })).toEqual({ staff: null })
  })
})

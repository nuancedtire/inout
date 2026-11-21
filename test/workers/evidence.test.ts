import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '#/db/client'
import { auditLog, rosterEntries, rotas, sessions, siteSettings, staff } from '#/db/schema'
import { todayDate } from '#/utils/dateTime'
import { buildAttendanceCsv } from '#/utils/exportCsv'
import type { LocationReading } from '#/utils/location'
import { normalizeName } from '#/utils/staffNames'
import { act, adminToken, enrol, freshIp, seedTodayRota, TOKEN } from './harness'

vi.mock('@tanstack/react-start', async () => (await import('./harness')).startMock)
vi.mock('@tanstack/react-start/server', async () => (await import('./harness')).startServerMock)

beforeEach(() => freshIp())

// Department centre and readings. Reading digits are distinctive so persistence can be scanned for.
const CENTRE = { latitude: 51.4, longitude: -0.2 }
const R = 6_371_008.8
const metresNorth = (m: number) => CENTRE.latitude + (m / R) * (180 / Math.PI)
function reading(metres: number, accuracy: number): LocationReading {
  return { status: 'ok', latitude: metresNorth(metres), longitude: CENTRE.longitude, accuracy }
}

async function configureSite(radiusM = 100, accuracyCeilingM = 50) {
  const { adminSetSiteSettings } = await import('#/utils/staff.functions')
  return adminSetSiteSettings({ data: { authToken: await adminToken(), ...CENTRE, radiusM, accuracyCeilingM } })
}

async function approvedPasskey(name: string) {
  const { authenticator } = await enrol({ name })
  const { adminSetCredentialStatus } = await import('#/utils/staff.functions')
  await adminSetCredentialStatus({ data: { authToken: await adminToken(), credentialId: authenticator.credentialId, status: 'approved' } })
  return authenticator
}

describe('location check outcomes', () => {
  it('evaluates inside, outside, the radius boundary, the accuracy ceiling, denial and unavailability', async () => {
    const { db } = await seedTodayRota()
    expect(await configureSite(100, 50)).toMatchObject({ configured: true, radiusM: 100, accuracyCeilingM: 50 })
    const cases: [LocationReading, string, number | null][] = [
      [reading(60, 10), 'inside', 10],
      [reading(109.9, 10), 'inside', 10],
      [reading(110.1, 10), 'outside', 10],
      [reading(2_000, 20), 'outside', 20],
      [reading(10, 50.2), 'unavailable', 51],
      [{ status: 'denied' }, 'denied', null],
      [{ status: 'timeout' }, 'unavailable', null],
      [{ status: 'unsupported' }, 'unavailable', null],
    ]
    for (const [i, [location, outcome, accuracy]] of cases.entries()) {
      const authenticator = await approvedPasskey(`Case ${String.fromCharCode(65 + i)}`)
      const res = await act(authenticator, 'check_in', { location })
      expect(res.result).toMatchObject({ location: outcome, verified: outcome === 'inside' })
      const [row] = await db.select({ l: sessions.locationIn, a: sessions.accuracyInM }).from(sessions)
        .innerJoin(rosterEntries, eq(rosterEntries.id, sessions.rosterEntryId)).where(eq(rosterEntries.staffId, res.staff.id))
      expect(row).toEqual({ l: outcome, a: accuracy })
    }
  })

  it('records not_requested when the area is not configured or no reading is sent', async () => {
    await seedTodayRota()
    const authenticator = await approvedPasskey('Unconfigured')
    expect((await act(authenticator, 'check_in', { location: reading(0, 5) })).result).toMatchObject({ location: 'not_requested', reasons: ['location_not_checked'] })
    await configureSite()
    expect((await act(authenticator, 'check_out')).result).toMatchObject({ location: 'not_requested' })
  })

  it('verifies a passkey session inside at both ends', async () => {
    const { db } = await seedTodayRota()
    await configureSite()
    const authenticator = await approvedPasskey('Verified Person')
    await act(authenticator, 'check_in', { location: reading(10, 5) })
    const out = await act(authenticator, 'check_out', { location: reading(20, 5) })
    expect(out.result).toMatchObject({ verified: true, reasons: [] })
    const { adminGetDashboard } = await import('#/utils/sessions.functions')
    const dash = await adminGetDashboard({ data: { date: todayDate(), authToken: await adminToken() } })
    expect(dash.sessions).toMatchObject([{ identityIn: 'passkey', identityOut: 'passkey', locationIn: 'inside', locationOut: 'inside', verified: true, reasons: [] }])
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('validates site settings ranges', async () => {
    const { adminSetSiteSettings, adminGetSiteSettings } = await import('#/utils/staff.functions')
    const authToken = await adminToken()
    expect(await adminGetSiteSettings({ data: { authToken } })).toMatchObject({ configured: false, radiusM: 150, accuracyCeilingM: 100 })
    await expect(adminSetSiteSettings({ data: { authToken, ...CENTRE, radiusM: 2001, accuracyCeilingM: 50 } })).rejects.toThrow(/Radius/)
    await expect(adminSetSiteSettings({ data: { authToken, latitude: 95, longitude: 0, radiusM: 100, accuracyCeilingM: 50 } })).rejects.toThrow(/latitude/)
    await configureSite(25, 10)
    await configureSite(2000, 500)
    expect(await (await getDb()).select().from(siteSettings)).toMatchObject([{ id: 1, radiusM: 2000, accuracyCeilingM: 500 }])
  })

  it('previews the outcome for the staff screen without recording anything', async () => {
    const { previewLocation } = await import('#/utils/passkeys.functions')
    await seedTodayRota()
    await configureSite(100, 50)
    const before = JSON.stringify(await (await getDb()).select().from(auditLog))
    const area = { ...CENTRE, radiusM: 100 }
    expect(await previewLocation({ data: { token: TOKEN, location: reading(60, 20) } })).toEqual({ outcome: 'inside', accuracyM: 20, awayM: null, area })
    expect(await previewLocation({ data: { token: TOKEN, location: reading(460, 20) } })).toEqual({ outcome: 'outside', accuracyM: 20, awayM: 360, area })
    expect((await previewLocation({ data: { token: TOKEN, location: reading(60, 80) } })).outcome).toBe('unavailable')
    expect((await previewLocation({ data: { token: TOKEN, location: { status: 'denied' } } })).outcome).toBe('denied')
    await expect(previewLocation({ data: { token: 'WRONGTOKENXX', location: reading(60, 20) } })).rejects.toThrow(/Invalid or expired/)
    const db = await getDb()
    expect(await db.select().from(sessions)).toEqual([])
    expect(JSON.stringify(await db.select().from(auditLog))).toBe(before)
  })

  it('returns no area from a preview when the department is not configured', async () => {
    const { previewLocation } = await import('#/utils/passkeys.functions')
    await seedTodayRota()
    expect(await previewLocation({ data: { token: TOKEN, location: reading(60, 20) } })).toEqual({ outcome: 'not_requested', accuracyM: 20, awayM: null, area: null })
  })

  it('gives staff maps the department area behind the QR code, and nothing else', async () => {
    const { getCheckInArea } = await import('#/utils/passkeys.functions')
    await seedTodayRota()
    expect(await getCheckInArea({ data: { token: TOKEN } })).toEqual({ area: null })
    await configureSite(120, 40)
    const res = await getCheckInArea({ data: { token: TOKEN } })
    expect(res).toEqual({ area: { ...CENTRE, radiusM: 120 } })
    // The accuracy ceiling and timestamps stay private to the admin.
    expect(Object.keys(res.area ?? {}).sort()).toEqual(['latitude', 'longitude', 'radiusM'])
    await expect(getCheckInArea({ data: { token: 'WRONGTOKENXX' } })).rejects.toThrow(/Invalid or expired/)
    await expect(getCheckInArea({ data: { token: 'short' } })).rejects.toThrow(/Invalid or expired/)
    await expect(getCheckInArea({ data: null })).rejects.toThrow(/Invalid request/)
    await expect(getCheckInArea({ data: { token: 42 } })).rejects.toThrow(/Invalid or expired/)
  })

  it('rate limits area lookups per client', async () => {
    const { getCheckInArea } = await import('#/utils/passkeys.functions')
    await seedTodayRota()
    for (let i = 0; i < 60; i++) await getCheckInArea({ data: { token: TOKEN } })
    await expect(getCheckInArea({ data: { token: TOKEN } })).rejects.toThrow(/Too many requests/)
  })

  it('tells the public check-in page only whether a location check applies', async () => {
    const { getTodayRoster } = await import('#/utils/rotas.functions')
    // Today's rota is created on first use, so the page never stops at "no rota".
    expect(await getTodayRoster()).toMatchObject({ rota: { date: todayDate() }, locationCheck: false })
    expect((await getTodayRoster()).locationCheck).toBe(false)
    await configureSite()
    const roster = await getTodayRoster()
    expect(roster.locationCheck).toBe(true)
    // Never the department coordinates or radius.
    const body = JSON.stringify(roster)
    expect(body).not.toContain(String(CENTRE.latitude))
    expect(body).not.toContain(String(CENTRE.longitude))
  })
})

describe('name-selection fallback', () => {
  it('records self_selected identity with the location outcome, and stays flagged', async () => {
    const { db, rota } = await seedTodayRota()
    await configureSite()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Fallback Person' }).returning()
    const { checkIn, checkOut, undoLastAction, getStatus } = await import('#/utils/sessions.functions')
    const res = await checkIn({ data: { rosterEntryId: entry.id, token: TOKEN, location: reading(5, 5) } })
    expect(res.result).toMatchObject({ identity: 'self_selected', location: 'inside', verified: false, reasons: ['identity_self_selected'] })
    expect(await getStatus({ data: { rosterEntryId: entry.id } })).toMatchObject({ checkedIn: true, hasUndoableAction: true })
    await expect(undoLastAction({ data: { rosterEntryId: entry.id, token: TOKEN } })).resolves.toEqual({ ok: true, action: 'checkin_undone' })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000) // past the per-entry burst limit
    await checkIn({ data: { rosterEntryId: entry.id, token: TOKEN } })
    const out = await checkOut({ data: { rosterEntryId: entry.id, token: TOKEN, location: { status: 'denied' } } })
    expect(out.result).toMatchObject({ location: 'denied', reasons: ['identity_self_selected', 'location_denied'] })
    vi.restoreAllMocks()
    expect(await db.select({ i: sessions.identityIn, li: sessions.locationIn, o: sessions.identityOut, lo: sessions.locationOut }).from(sessions))
      .toEqual([{ i: 'self_selected', li: 'not_requested', o: 'self_selected', lo: 'denied' }])
  })

  it('rejects malformed fallback input and entries from another day', async () => {
    const { db } = await seedTodayRota()
    const [old] = await db.insert(rotas).values({ date: '2020-01-01', token: 'QQQQQQQQQQQQ' }).returning()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: old.id, name: 'Old' }).returning()
    const { checkIn } = await import('#/utils/sessions.functions')
    await expect(checkIn({ data: { rosterEntryId: String(entry.id), token: TOKEN } })).rejects.toThrow()
    await expect(checkIn({ data: { rosterEntryId: entry.id, token: TOKEN, location: { status: 'ok', latitude: 'x' } } })).rejects.toThrow(/location/)
    await expect(checkIn({ data: { rosterEntryId: entry.id + 0, token: TOKEN } })).rejects.toThrow(/Staff not found/)
    expect(await db.select().from(sessions)).toEqual([])
  })

  it('manual locum check-in records self_selected identity and location', async () => {
    const { db } = await seedTodayRota()
    await configureSite()
    const { manualCheckIn } = await import('#/utils/sessions.functions')
    const res = await manualCheckIn({ data: { name: 'Walk In', token: TOKEN, location: reading(500, 10) } })
    expect(res.result).toMatchObject({ identity: 'self_selected', location: 'outside' })
    expect(await db.select({ i: sessions.identityIn, l: sessions.locationIn }).from(sessions)).toEqual([{ i: 'self_selected', l: 'outside' }])
    expect(await db.select({ s: rosterEntries.staffId, src: rosterEntries.source }).from(rosterEntries)).toEqual([{ s: null, src: 'manual' }])
  })
})

describe('coordinates are never persisted', () => {
  it('leaves no submitted latitude or longitude in any table, the audit log or console output', async () => {
    const logged: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
    }
    const { db, rota } = await seedTodayRota()
    await configureSite()
    const lat = 51.40012345
    const lng = -0.20067891
    const location = { status: 'ok' as const, latitude: lat, longitude: lng, accuracy: 7.25 }
    const { finished } = await enrol({ name: 'Private Person' }, { checkIn: { location } })
    expect(finished.session?.location).toBe('inside') // ~49 m away with 7.25 m accuracy
    const authenticator = await approvedPasskey('Second Person')
    await act(authenticator, 'check_in', { location })
    await act(authenticator, 'check_out', { location })
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Third Person' }).returning()
    const { checkIn, manualCheckIn } = await import('#/utils/sessions.functions')
    await checkIn({ data: { rosterEntryId: entry.id, token: TOKEN, location } })
    await manualCheckIn({ data: { name: 'Fourth Person', token: TOKEN, location } })
    await expect(checkIn({ data: { rosterEntryId: entry.id, token: TOKEN, location: { ...location, latitude: 99.40012345 } } })).rejects.not.toThrow(/40012345/)

    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string }>()
    expect(tables.results.map((t) => t.name)).toEqual(expect.arrayContaining(['sessions', 'audit_log', 'staff_credentials', 'site_settings', 'webauthn_challenges']))
    let rows = 0
    for (const { name } of tables.results) {
      const all = await env.DB.prepare(`SELECT * FROM "${name}"`).all()
      rows += all.results.length
      const text = JSON.stringify(all.results)
      for (const fragment of ['40012345', '20067891', '7.25']) expect(text, `${name} contains ${fragment}`).not.toContain(fragment)
    }
    expect(rows).toBeGreaterThan(10)
    for (const fragment of ['40012345', '20067891']) expect(logged.join('\n')).not.toContain(fragment)
    vi.restoreAllMocks()
  })
})

describe('admin review, dashboard and corrections', () => {
  it('accepts a flagged session with a note without altering its evidence', async () => {
    const { db, rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Flagged' }).returning()
    const { checkIn, adminGetDashboard } = await import('#/utils/sessions.functions')
    const { sessionId } = await checkIn({ data: { rosterEntryId: entry.id, token: TOKEN } })
    const before = await db.select().from(sessions)
    const { adminReviewSession } = await import('#/utils/staff.functions')
    const authToken = await adminToken()
    await expect(adminReviewSession({ data: { authToken, sessionId, note: ' ' } })).rejects.toThrow(/note/)
    await adminReviewSession({ data: { authToken, sessionId, note: 'Signal poor in resus' } })
    await expect(adminReviewSession({ data: { authToken, sessionId, note: 'again' } })).rejects.toThrow(/already been accepted/)
    await expect(adminReviewSession({ data: { authToken, sessionId: 999_999, note: 'x' } })).rejects.toThrow(/not found/)
    const [after] = await db.select().from(sessions)
    expect(after).toMatchObject({ ...before[0], reviewState: 'accepted', reviewNote: 'Signal poor in resus', reviewedBy: 'admin', reviewedAt: expect.any(String) })
    expect(await db.select({ e: auditLog.event }).from(auditLog).where(eq(auditLog.event, 'session_accepted'))).toHaveLength(1)

    const dash = await adminGetDashboard({ data: { date: todayDate(), authToken } })
    expect(dash.sessions[0]).toMatchObject({ verified: false, accepted: true, reviewState: 'accepted', reasons: ['identity_self_selected', 'location_not_checked'] })
    expect(dash.present[0]).toMatchObject({ id: entry.id, sessionId, accepted: true })
    expect(dash.entries[0]).toMatchObject({ id: entry.id, sessionId, identityIn: 'self_selected', staffId: null })
  })

  it('reports pending enrolments and marks admin-made sessions as admin', async () => {
    const { db, rota } = await seedTodayRota()
    await enrol({ name: 'Pending One' })
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Admin Made' }).returning()
    const { adminGetDashboard, adminUpdateSession } = await import('#/utils/sessions.functions')
    const authToken = await adminToken()
    await adminUpdateSession({ data: { authToken, rosterEntryId: entry.id, checkInAt: '2026-01-01T08:00:00.000Z' } })
    const dash = await adminGetDashboard({ data: { date: todayDate(), authToken } })
    expect(dash.pendingEnrolments).toBe(1)
    expect(dash.sessions.find((s) => s.name === 'Admin Made')).toMatchObject({ identityIn: 'admin', locationIn: 'not_requested', verified: true, reasons: [] })
    await expect(adminGetDashboard({ data: { date: 'today', authToken } })).rejects.toThrow('Invalid date')
    await expect(adminUpdateSession({ data: { authToken, sessionId: 1, checkInAt: 'soon' } })).rejects.toThrow('Invalid time')
  })

  it('auto-checkout records admin identity and no location check', async () => {
    const { db, rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Night', shiftStart: '00:00', shiftEnd: '00:01' }).returning()
    await db.insert(sessions).values({ rosterEntryId: entry.id, checkInAt: new Date().toISOString(), identityIn: 'self_selected' })
    const { runAutoCheckout } = await import('#/utils/sessions.functions')
    const { closed } = await runAutoCheckout({ data: { authToken: await adminToken() } })
    const expected = new Date() > new Date(`${todayDate()}T01:01:00Z`) ? 1 : 0
    expect(closed).toBe(expected)
    if (closed) expect(await db.select({ o: sessions.identityOut, l: sessions.locationOut }).from(sessions)).toEqual([{ o: 'admin', l: 'not_requested' }])
  })
})

describe('export and weekly rollup', () => {
  it('adds identity, location, verified, flag and review columns to the CSV', async () => {
    const { db, rota } = await seedTodayRota()
    await configureSite()
    const authenticator = await approvedPasskey('Export Passkey')
    await act(authenticator, 'check_in', { location: reading(5, 5) })
    await act(authenticator, 'check_out', { location: reading(5_000, 5) })
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: '=Formula Name' }).returning()
    const { checkIn, checkOut, adminExportSessions, adminWeeklyRollup } = await import('#/utils/sessions.functions')
    const { sessionId } = await checkIn({ data: { rosterEntryId: entry.id, token: TOKEN } })
    await checkOut({ data: { rosterEntryId: entry.id, token: TOKEN, location: { status: 'denied' } } })
    const { adminReviewSession } = await import('#/utils/staff.functions')
    const authToken = await adminToken()
    await adminReviewSession({ data: { authToken, sessionId, note: 'Known locum' } })

    const { rows } = await adminExportSessions({ data: { startDate: todayDate(), endDate: todayDate(), authToken } })
    expect(rows.find((r) => r.name === 'Export Passkey')).toMatchObject({
      identity_in: 'passkey', location_in: 'inside', identity_out: 'passkey', location_out: 'outside', verified: false, reasons: ['location_outside'],
    })
    const weekly = await adminWeeklyRollup({ data: { weekStart: todayDate(), weekEnd: todayDate(), authToken } })
    expect(weekly.rows.find((r) => r.name === '=Formula Name')).toMatchObject({ identity_in: 'self_selected', location_out: 'denied', accepted: true, review_note: 'Known locum' })

    // Same rows and builder as /api/export.csv.
    const csv = buildAttendanceCsv(rows)
    const [header, ...lines] = csv.trim().split(/\r?\n/)
    expect(header).toBe('Name,Role,Check in,Check out,Hours,Identity in,Location in,Identity out,Location out,Verified,Flags,Review')
    expect(lines.find((l) => l.startsWith('Export Passkey'))).toMatch(/,passkey,inside,passkey,outside,No,Outside the department,$/)
    const locum = lines.find((l) => l.includes('Formula Name'))!
    expect(locum.startsWith(`"'=Formula Name"`) || locum.startsWith(`'=Formula Name`)).toBe(true)
    expect(locum).toMatch(/self_selected,not_requested,self_selected,denied,No,Picked name without Face ID; Location not checked; Location permission refused,Accepted: Known locum$/)

    await expect(adminExportSessions({ data: { startDate: 'bad', endDate: todayDate(), authToken } })).rejects.toThrow('Invalid date')
    await expect(adminExportSessions({ data: { startDate: todayDate(), endDate: todayDate(), authToken: 'nope' } })).rejects.toThrow(/Unauthorized/)
  })
})

describe('stable staff records and rota linking', () => {
  it('links rota entries only on an exact unambiguous match among active staff', async () => {
    const db = await getDb()
    const mk = (name: string, active = true) => ({ name, normalizedName: normalizeName(name), active })
    await db.insert(staff).values([mk('Alice Example'), mk('Bob Example'), mk('bob  example'), mk('Carol Example', false), mk('Erin Example')])
    const csv = 'Name,Role,Shift\nALICE  EXAMPLE,Nurse,0800-1800\nBob Example,Doctor,0800-1800\nCarol Example,HCA,0800-1800\nDave Example,Nurse,0800-1800\nErin Example,Nurse,0800-1200\nErin Example,Nurse,1300-1800\n'
    const { uploadRota, getTodayRoster } = await import('#/utils/rotas.functions')
    const res = await uploadRota({ data: { authToken: await adminToken(), date: todayDate(), fileBase64: btoa(csv), fileName: 'rota.csv' } })
    expect(res.linked).toBe(1)
    expect(res.unlinked.map(({ name, reason }) => [name, reason]).sort()).toEqual([
      ['Bob Example', 'ambiguous'], ['Carol Example', 'no_match'], ['Dave Example', 'no_match'], ['Erin Example', 'ambiguous'], ['Erin Example', 'ambiguous'],
    ])
    const [alice] = await db.select().from(staff).where(eq(staff.name, 'Alice Example'))
    expect(await db.select({ s: rosterEntries.staffId }).from(rosterEntries).where(eq(rosterEntries.name, 'ALICE  EXAMPLE'))).toEqual([{ s: alice.id }])

    // The public roster never exposes the QR token.
    const roster = await getTodayRoster()
    expect(roster.rota).toEqual({ id: expect.any(Number), date: todayDate() })
    expect(JSON.stringify(roster)).not.toContain(res.token)

    const { adminListUnlinkedEntries, adminLinkRosterEntry, adminListStaff, adminSetStaffActive } = await import('#/utils/staff.functions')
    const authToken = await adminToken()
    const { unlinked } = await adminListUnlinkedEntries({ data: { authToken, date: todayDate() } })
    expect(unlinked).toHaveLength(5)
    const dave = unlinked.find((u) => u.name === 'Dave Example')!
    await adminLinkRosterEntry({ data: { authToken, entryId: dave.entryId, staffId: alice.id } }).then(
      () => { throw new Error('expected a duplicate-link error') },
      (e: Error) => expect(e.message).toMatch(/already linked/),
    )
    const [bob] = await db.select().from(staff).where(eq(staff.name, 'Bob Example'))
    await adminLinkRosterEntry({ data: { authToken, entryId: dave.entryId, staffId: bob.id } })
    await adminLinkRosterEntry({ data: { authToken, entryId: dave.entryId, staffId: null } })
    await adminSetStaffActive({ data: { authToken, staffId: bob.id, active: false } })
    const list = await adminListStaff({ data: { authToken } })
    expect(list.staff.find((s) => s.id === bob.id)).toMatchObject({ active: false, credentials: { pending: 0, approved: 0 } })
    expect(list.staff.find((s) => s.id === alice.id)).toMatchObject({ active: true, lastSeenAt: null })
  })

  it('enrolment from a rota entry reuses the matching staff record across days', async () => {
    const db = await getDb()
    const [yesterday] = await db.insert(rotas).values({ date: '2020-01-01', token: 'QQQQQQQQQQQQ' }).returning()
    const [person] = await db.insert(staff).values({ name: 'Zoë Example', normalizedName: normalizeName('Zoë Example') }).returning()
    await db.insert(rosterEntries).values({ rotaId: yesterday.id, name: 'Zoë Example', staffId: person.id })
    const { rota } = await seedTodayRota()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'zoe example' }).returning()
    const { finished } = await enrol({ rosterEntryId: entry.id })
    expect(finished.staff.id).toBe(person.id)
    expect(await db.select().from(staff)).toHaveLength(1)
  })
})

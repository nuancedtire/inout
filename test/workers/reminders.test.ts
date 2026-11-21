import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '#/db/client'
import { MAX_PUSH_FAILURES, reminderMessage, runShiftEndReminders } from '#/db/reminders'
import { auditLog, pushSubscriptions, rosterEntries, rotas, sessions } from '#/db/schema'
import { buildAttendanceCsv } from '#/utils/exportCsv'
import { isKnownPushEndpoint, resolvePushConfig, sendPush } from '#/utils/push'
import { deriveVerification, flagLabels, FLAG_REASON_LABEL } from '#/utils/verification'
import { createPushClient, mockPushService, verifyVapid } from './pushClient'
import { adminToken, enrol, freshIp, passkeyFns, seedTodayRota, TOKEN } from './harness'
import type { SoftAuthenticator } from './softAuthenticator'

vi.mock('@tanstack/react-start', async () => (await import('./harness')).startMock)
vi.mock('@tanstack/react-start/server', async () => (await import('./harness')).startServerMock)

beforeEach(() => freshIp())

const HOUR = 3_600_000
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123'
const APPLE = 'https://web.push.apple.com/QGx1y2z3'

const reminderFns = () => import('#/utils/reminders.functions')

async function config() {
  const c = resolvePushConfig(env)
  if (!c.enabled) throw new Error('VAPID test keys missing')
  return c
}

/** Enrol a person (checking them in) and return their authenticator, staff token and open session. */
async function enrolCheckedIn(name: string) {
  const { authenticator, finished } = await enrol({ name }, { checkIn: {} })
  const db = await getDb()
  const [session] = await db.select().from(sessions).where(eq(sessions.credentialIdIn, authenticator.credentialId))
  return { authenticator, staffToken: finished.staffToken, staffId: finished.staff.id, session }
}

async function setCheckIn(sessionId: number, at: Date) {
  const db = await getDb()
  await db.update(sessions).set({ checkInAt: at.toISOString() }).where(eq(sessions.id, sessionId))
}

async function subscribe(staffToken: string, endpoint = FCM) {
  const { subscribePush } = await reminderFns()
  const client = await createPushClient(endpoint)
  await subscribePush({ data: { token: TOKEN, staffToken, subscription: client.subscription } })
  return client
}

async function signed(authenticator: SoftAuthenticator) {
  const { beginPasskeyAuth } = await passkeyFns()
  const { optionsJSON } = await beginPasskeyAuth({ data: { token: TOKEN } })
  return authenticator.assert(optionsJSON)
}

describe('push configuration and endpoints', () => {
  it('reports the public key when VAPID keys are configured, and disables itself otherwise', async () => {
    const { getPushConfig } = await reminderFns()
    expect(await getPushConfig()).toEqual({ enabled: true, publicKey: env.VAPID_PUBLIC_KEY })
    expect(resolvePushConfig({})).toEqual({ enabled: false, publicKey: null })
    expect(resolvePushConfig({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY }).enabled).toBe(false)
    expect(resolvePushConfig({ VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY })).toMatchObject({
      enabled: true, subject: 'https://inout.fzn.workers.dev', appOrigin: null,
    })
  })

  it('accepts only https endpoints at known push services', () => {
    for (const ok of [FCM, APPLE, 'https://api.push.apple.com/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
      expect(isKnownPushEndpoint(ok)).toBe(true)
    }
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evil.example/fcm.googleapis.com',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://push.apple.com/x',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://fcm.googleapis.com/',
      'not a url',
    ]) {
      expect(isKnownPushEndpoint(bad), bad).toBe(false)
    }
  })
})

describe('subscribePush / unsubscribePush', () => {
  it('rejects non-push hosts and malformed keys before touching the database', async () => {
    await seedTodayRota()
    const { staffToken } = await enrolCheckedIn('Alice')
    const { subscribePush } = await reminderFns()
    const client = await createPushClient(FCM)
    for (const endpoint of ['https://attacker.example/collect', 'http://fcm.googleapis.com/fcm/send/x', 'https://169.254.169.254/latest']) {
      await expect(subscribePush({ data: { token: TOKEN, staffToken, subscription: { ...client.subscription, endpoint } } }))
        .rejects.toThrow("notification service isn't supported")
    }
    await expect(subscribePush({ data: { token: TOKEN, staffToken, subscription: { ...client.subscription, keys: { p256dh: 'AAAA', auth: client.subscription.keys.auth } } } }))
      .rejects.toThrow('Invalid subscription')
    await expect(subscribePush({ data: { token: 'AAAAAAAAAAAA', staffToken, subscription: client.subscription } }))
      .rejects.toThrow('Invalid or expired QR code')
    expect(await (await getDb()).select().from(pushSubscriptions)).toEqual([])
  })

  it('binds the subscription to the staff record named by the staff token and upserts by endpoint', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const bob = await enrolCheckedIn('Bob')
    await subscribe(alice.staffToken)
    expect(await db.select().from(pushSubscriptions)).toMatchObject([{ staffId: alice.staffId, endpoint: FCM, userAgent: 'iPhone', failureCount: 0 }])

    // Same browser endpoint, now signed in as Bob: moved, not duplicated.
    const again = await subscribe(bob.staffToken)
    const rows = await db.select().from(pushSubscriptions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ staffId: bob.staffId, p256dh: again.subscription.keys.p256dh })

    const { subscribePush, unsubscribePush } = await reminderFns()
    await expect(subscribePush({ data: { token: TOKEN, staffToken: 'st1.bogus.sig', subscription: again.subscription } }))
      .rejects.toThrow('Set up this phone')
    // Alice cannot remove Bob's subscription; Bob can.
    expect(await unsubscribePush({ data: { token: TOKEN, staffToken: alice.staffToken, endpoint: FCM } })).toEqual({ removed: false })
    expect(await unsubscribePush({ data: { token: TOKEN, staffToken: bob.staffToken, endpoint: FCM } })).toEqual({ removed: true })
    expect(await db.select().from(pushSubscriptions)).toEqual([])
  })

  it('refuses revoked passkeys and keeps at most five subscriptions per person', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    for (let i = 0; i < 7; i++) await subscribe(alice.staffToken, `${FCM}-${i}`)
    const rows = await db.select().from(pushSubscriptions)
    expect(rows.map((r) => r.endpoint).sort()).toEqual([2, 3, 4, 5, 6].map((i) => `${FCM}-${i}`))

    const { adminSetCredentialStatus } = await import('#/utils/staff.functions')
    await adminSetCredentialStatus({ data: { authToken: await adminToken(), credentialId: alice.authenticator.credentialId, status: 'revoked' } })
    await expect(subscribe(alice.staffToken, APPLE)).rejects.toThrow('Set up this phone')
  })
})

describe('shift-end reminder cron', () => {
  it('sends one encrypted, VAPID-signed notification per subscription once the shift is 15 minutes over', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const cfg = await config()
    // Alice is on a dated rota with shift times: 08:00–20:00 on 14 Nov 2026 (GMT).
    const [rota] = await db.insert(rotas).values({ date: '2026-11-14', token: 'BBBBBBBBBBBB' }).returning()
    const [entry] = await db.insert(rosterEntries).values({ rotaId: rota.id, name: 'Alice', shiftStart: '08:00', shiftEnd: '20:00', staffId: alice.staffId }).returning()
    await db.update(sessions).set({ rosterEntryId: entry.id, checkInAt: '2026-11-14T07:55:00.000Z' }).where(eq(sessions.id, alice.session.id))
    const phone = await subscribe(alice.staffToken, FCM)
    const watch = await subscribe(alice.staffToken, APPLE)
    const push = mockPushService()

    // 20:14 — not yet due.
    expect(await runShiftEndReminders(db, { now: new Date('2026-11-14T20:14:00Z'), config: cfg, fetcher: push.fetcher }))
      .toEqual({ enabled: true, sessions: 0, sent: 0, removed: 0, failed: 0 })
    expect(push.calls).toHaveLength(0)

    const now = new Date('2026-11-14T20:16:00Z')
    expect(await runShiftEndReminders(db, { now, config: cfg, fetcher: push.fetcher }))
      .toEqual({ enabled: true, sessions: 1, sent: 2, removed: 0, failed: 0 })
    expect(push.calls.map((c) => c.url).sort()).toEqual([APPLE, FCM].sort())

    for (const call of push.calls) {
      expect(call.headers).toMatchObject({ ttl: '10800', urgency: 'high', topic: `checkout-${alice.session.id}`, 'content-encoding': 'aes128gcm' })
      expect(call.redirect).toBe('manual')
      const vapid = await verifyVapid(call.headers.authorization, env.VAPID_PUBLIC_KEY)
      expect(vapid).toMatchObject({ valid: true, keyMatches: true, header: { alg: 'ES256' }, claims: { aud: new URL(call.url).origin, sub: 'mailto:test@inout.test' } })
      expect(vapid.claims.exp * 1000 - Date.now()).toBeLessThanOrEqual(24 * HOUR)
      const client = call.url === FCM ? phone : watch
      expect(JSON.parse(await client.decrypt(call.body))).toEqual({
        notification: {
          title: 'Still at work?',
          body: 'Your shift ended at 20:00. Tap to check out.',
          tag: `checkout-${alice.session.id}`,
          lang: 'en-GB',
          dir: 'ltr',
          silent: false,
          data: { url: '/', sessionId: alice.session.id },
        },
      })
    }

    const [row] = await db.select().from(sessions).where(eq(sessions.id, alice.session.id))
    expect(row.reminderSentAt).toBe(now.toISOString())
    expect((await db.select().from(pushSubscriptions)).every((s) => s.lastSuccessAt === now.toISOString())).toBe(true)
    const audits = (await db.select().from(auditLog)).filter((a) => a.event === 'checkout_reminders_sent')
    expect(audits).toHaveLength(1)
    expect(JSON.parse(audits[0].details!)).toEqual({ sessions: 1, sent: 2, failed: 0, removed: 0 })
    expect(audits[0].details).not.toContain('https://')

    // Idempotent: later runs send nothing and audit nothing.
    expect(await runShiftEndReminders(db, { now: new Date('2026-11-14T20:21:00Z'), config: cfg, fetcher: push.fetcher }))
      .toMatchObject({ sessions: 0, sent: 0 })
    expect(push.calls).toHaveLength(2)
    expect((await db.select().from(auditLog)).filter((a) => a.event === 'checkout_reminders_sent')).toHaveLength(1)
  })

  it('selects only open, linked, subscribed sessions that started within 24 hours', async () => {
    const { db } = await seedTodayRota()
    const cfg = await config()
    const now = new Date()
    const due = await enrolCheckedIn('Due Person') // no shift times: check-in + 12 h
    const fresh = await enrolCheckedIn('Fresh Person')
    const stale = await enrolCheckedIn('Stale Person')
    const unsubscribed = await enrolCheckedIn('No Phone')
    const out = await enrolCheckedIn('Checked Out')
    await setCheckIn(due.session.id, new Date(now.getTime() - 12.5 * HOUR))
    await setCheckIn(fresh.session.id, new Date(now.getTime() - 2 * HOUR))
    await setCheckIn(stale.session.id, new Date(now.getTime() - 25 * HOUR))
    await setCheckIn(unsubscribed.session.id, new Date(now.getTime() - 13 * HOUR))
    await setCheckIn(out.session.id, new Date(now.getTime() - 13 * HOUR))
    await db.update(sessions).set({ checkOutAt: now.toISOString() }).where(eq(sessions.id, out.session.id))
    for (const p of [due, fresh, stale, out]) await subscribe(p.staffToken, `${FCM}-${p.staffId}`)

    const push = mockPushService()
    expect(await runShiftEndReminders(db, { now, config: cfg, fetcher: push.fetcher })).toMatchObject({ sessions: 1, sent: 1 })
    expect(push.calls.map((c) => c.url)).toEqual([`${FCM}-${due.staffId}`])
    // Disabled configuration: nothing happens at all.
    await db.update(sessions).set({ reminderSentAt: null }).where(eq(sessions.id, due.session.id))
    expect(await runShiftEndReminders(db, { now, config: { enabled: false, publicKey: null }, fetcher: push.fetcher }))
      .toEqual({ enabled: false, sessions: 0, sent: 0, removed: 0, failed: 0 })
    expect(push.calls).toHaveLength(1)
  })

  it('deletes subscriptions the push service reports gone (404/410) and counts other failures', async () => {
    const { db } = await seedTodayRota()
    const cfg = await config()
    const now = new Date()
    const alice = await enrolCheckedIn('Alice')
    await setCheckIn(alice.session.id, new Date(now.getTime() - 13 * HOUR))
    await subscribe(alice.staffToken, `${FCM}-gone`)
    await subscribe(alice.staffToken, `${FCM}-404`)
    await subscribe(alice.staffToken, `${FCM}-flaky`)
    await subscribe(alice.staffToken, `${FCM}-ok`)
    const push = mockPushService((url) => url.endsWith('-gone') ? 410 : url.endsWith('-404') ? 404 : url.endsWith('-flaky') ? 503 : 201)

    expect(await runShiftEndReminders(db, { now, config: cfg, fetcher: push.fetcher }))
      .toEqual({ enabled: true, sessions: 1, sent: 1, removed: 2, failed: 1 })
    const rows = await db.select().from(pushSubscriptions)
    expect(rows.map((r) => [r.endpoint.slice(FCM.length + 1), r.failureCount]).sort()).toEqual([['flaky', 1], ['ok', 0]])

    // A subscription that keeps failing is dropped after MAX_PUSH_FAILURES.
    await db.update(pushSubscriptions).set({ failureCount: MAX_PUSH_FAILURES - 1 }).where(eq(pushSubscriptions.endpoint, `${FCM}-flaky`))
    const bob = await enrolCheckedIn('Bob')
    await setCheckIn(bob.session.id, new Date(now.getTime() - 13 * HOUR))
    await db.update(pushSubscriptions).set({ staffId: bob.staffId }).where(eq(pushSubscriptions.endpoint, `${FCM}-flaky`))
    expect(await runShiftEndReminders(db, { now, config: cfg, fetcher: push.fetcher })).toMatchObject({ sessions: 1, sent: 0, failed: 1, removed: 1 })
    expect((await db.select().from(pushSubscriptions)).map((r) => r.endpoint)).toEqual([`${FCM}-ok`])
    // No delivery succeeded in that run, so no audit summary was written for it.
    expect((await db.select().from(auditLog)).filter((a) => a.event === 'checkout_reminders_sent')).toHaveLength(1)
  })

  it('never throws on network errors and refuses endpoints outside the allowlist at send time', async () => {
    const cfg = await config()
    const client = await createPushClient(FCM)
    const target = { endpoint: FCM, ...client.subscription.keys }
    expect(await sendPush(target, { hi: 1 }, { ttl: 60 }, cfg, async () => { throw new Error('offline') })).toEqual({ outcome: 'failed', status: null })
    expect(await sendPush({ ...target, endpoint: 'https://evil.example/x' }, {}, { ttl: 60 }, cfg, async () => new Response(null, { status: 201 })))
      .toEqual({ outcome: 'gone', status: null })
    expect(await sendPush({ ...target, p256dh: 'AAAA' }, {}, { ttl: 60 }, cfg, async () => new Response(null, { status: 201 })))
      .toEqual({ outcome: 'gone', status: null })
  })

  it('uses the Declarative Web Push shape when the app origin is configured', () => {
    const msg = reminderMessage({ id: 7, checkInAt: '2026-07-01T07:00:00.000Z', endsAt: new Date('2026-07-01T19:00:00.000Z'), basis: 'default' }, 'https://inout.example.nhs.uk')
    expect(msg).toEqual({
      web_push: 8030,
      notification: expect.objectContaining({ title: 'Still at work?', body: 'You checked in at 08:00. Tap to check out.', navigate: 'https://inout.example.nhs.uk/' }),
    })
  })
})

describe('forgotten check-outs', () => {
  it('finds an open session once its expected end + 60 minutes has passed', async () => {
    await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const { getForgottenCheckout } = await reminderFns()
    const now = Date.now()

    await setCheckIn(alice.session.id, new Date(now - 12.5 * HOUR)) // ended 30 min ago: not yet
    expect(await getForgottenCheckout({ data: { token: TOKEN, staffToken: alice.staffToken } })).toEqual({ session: null })

    const checkInAt = new Date(now - 14 * HOUR)
    await setCheckIn(alice.session.id, checkInAt)
    expect(await getForgottenCheckout({ data: { token: TOKEN, staffToken: alice.staffToken } })).toEqual({
      session: {
        id: alice.session.id,
        checkInAt: checkInAt.toISOString(),
        expectedEndAt: new Date(checkInAt.getTime() + 12 * HOUR).toISOString(),
        shiftLabel: null,
        canCheckOutNow: true,
      },
    })

    await setCheckIn(alice.session.id, new Date(now - 30 * HOUR))
    expect((await getForgottenCheckout({ data: { token: TOKEN, staffToken: alice.staffToken } })).session?.canCheckOutNow).toBe(false)
    await setCheckIn(alice.session.id, new Date(now - 8 * 24 * HOUR)) // older than 7 days: coordinator's problem
    expect(await getForgottenCheckout({ data: { token: TOKEN, staffToken: alice.staffToken } })).toEqual({ session: null })
    expect(await getForgottenCheckout({ data: { token: TOKEN, staffToken: 'nope' } })).toEqual({ session: null })
  })

  it('saves the reported time with passkey evidence, flags it and audits it in one batch', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const checkInAt = new Date(Date.now() - 14 * HOUR)
    await setCheckIn(alice.session.id, checkInAt)
    const leftAt = new Date(checkInAt.getTime() + 12 * HOUR + 5 * 60_000).toISOString()
    const { reportForgottenCheckout } = await reminderFns()

    const result = await reportForgottenCheckout({ data: { token: TOKEN, sessionId: alice.session.id, leftAt, response: await signed(alice.authenticator) } })
    expect(result).toMatchObject({
      sessionId: alice.session.id,
      checkInAt: checkInAt.toISOString(),
      checkOutAt: leftAt,
      staff: { id: alice.staffId, name: 'Alice' },
      credentialStatus: 'pending',
      reasons: ['identity_pending', 'location_not_checked', 'checkout_reported'],
    })
    expect(result.staffToken).toMatch(/^st1\./)

    const [row] = await db.select().from(sessions).where(eq(sessions.id, alice.session.id))
    expect(row).toMatchObject({
      checkOutAt: leftAt,
      identityOut: 'passkey_pending',
      credentialIdOut: alice.authenticator.credentialId,
      locationOut: 'not_requested',
      checkoutSource: 'reported',
      qrTokenOut: TOKEN,
    })
    const audit = (await db.select().from(auditLog)).find((a) => a.event === 'checkout_reported')
    expect(JSON.parse(audit!.details!)).toMatchObject({ sessionId: alice.session.id, staffId: alice.staffId, leftAt, identity: 'passkey_pending' })
    expect(audit!.actor).toBe('staff')

    // Reported sessions are flagged on the dashboard and in the export.
    const { adminExportSessions } = await import('#/utils/sessions.functions')
    const date = (await db.select().from(rotas))[0].date
    const { rows } = await adminExportSessions({ data: { authToken: await adminToken(), startDate: date, endDate: date } })
    expect(rows[0]).toMatchObject({ checkout_source: 'reported', verified: false })
    expect(rows[0].reasons).toContain('checkout_reported')
    expect(buildAttendanceCsv(rows)).toContain('Check-out time entered later')
  })

  it('refuses another person\'s session, future or out-of-range times, and a reused challenge', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const bob = await enrolCheckedIn('Bob')
    const checkInAt = new Date(Date.now() - 14 * HOUR)
    await setCheckIn(alice.session.id, checkInAt)
    const { reportForgottenCheckout } = await reminderFns()
    const leftAt = new Date(checkInAt.getTime() + 12 * HOUR).toISOString()
    const report = (leftAtValue: string, response: unknown, sessionId = alice.session.id) =>
      reportForgottenCheckout({ data: { token: TOKEN, sessionId, leftAt: leftAtValue, response } })

    // Bob's passkey cannot close Alice's session.
    await expect(report(leftAt, await signed(bob.authenticator))).rejects.toThrow("That shift couldn't be found.")

    // Times are checked before the passkey is used, so the same signed response still works after.
    const response = await signed(alice.authenticator)
    await expect(report(new Date(Date.now() + 10 * 60_000).toISOString(), response)).rejects.toThrow("hasn't happened yet")
    await expect(report(new Date(checkInAt.getTime() - 60_000).toISOString(), response)).rejects.toThrow('after you checked in')
    await setCheckIn(alice.session.id, new Date(Date.now() - 30 * HOUR))
    await expect(report(new Date(Date.now() - 60_000).toISOString(), response)).rejects.toThrow('within 24 hours')
    await setCheckIn(alice.session.id, checkInAt)
    await expect(report('2026-11-14T20:00', response)).rejects.toThrow('Choose the time you left.')
    await expect(report(leftAt, response, 999_999)).rejects.toThrow("That shift couldn't be found.")
    expect((await db.select().from(sessions).where(eq(sessions.id, alice.session.id)))[0].checkOutAt).toBeNull()

    await report(leftAt, response)
    // The challenge was single-use.
    await setCheckIn(bob.session.id, checkInAt)
    await expect(report(leftAt, response, alice.session.id)).rejects.toThrow("already checked out")
    await expect(report(leftAt, response, bob.session.id)).rejects.toThrow('expired or was already used')
    expect((await db.select().from(sessions).where(eq(sessions.id, bob.session.id)))[0].checkOutAt).toBeNull()
  })

  it('admin correction or undo clears the reported flag', async () => {
    const { db } = await seedTodayRota()
    const alice = await enrolCheckedIn('Alice')
    const checkInAt = new Date(Date.now() - 14 * HOUR)
    await setCheckIn(alice.session.id, checkInAt)
    const { reportForgottenCheckout } = await reminderFns()
    await reportForgottenCheckout({ data: { token: TOKEN, sessionId: alice.session.id, leftAt: new Date(checkInAt.getTime() + 12 * HOUR).toISOString(), response: await signed(alice.authenticator) } })

    const { updateAttendanceSession } = await import('#/db/attendance')
    await updateAttendanceSession(db, { sessionId: alice.session.id, checkOutAt: new Date(checkInAt.getTime() + 11 * HOUR).toISOString() })
    const [row] = await db.select().from(sessions).where(eq(sessions.id, alice.session.id))
    expect(row).toMatchObject({ checkoutSource: null, identityOut: 'admin' })
    expect(deriveVerification(row).reasons).not.toContain('checkout_reported')
  })
})

describe('verification label', () => {
  it('derives checkout_reported from checkout_source and labels it', () => {
    const base = { identityIn: 'passkey', locationIn: 'inside', identityOut: 'passkey', locationOut: 'not_requested', checkOutAt: '2026-11-14T20:05:00Z' }
    expect(deriveVerification({ ...base, checkoutSource: 'reported' })).toEqual({ verified: false, accepted: false, reasons: ['checkout_reported'] })
    expect(deriveVerification({ ...base, checkoutSource: null }).reasons).toEqual(['location_not_checked'])
    expect(deriveVerification({ ...base, checkOutAt: null, checkoutSource: 'reported' }).verified).toBe(true)
    expect(FLAG_REASON_LABEL.checkout_reported).toBe('Check-out time entered later')
    expect(flagLabels(['identity_pending', 'checkout_reported'])).toBe('Phone awaiting approval; Check-out time entered later')
  })
})

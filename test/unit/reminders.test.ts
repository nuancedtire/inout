import { describe, expect, it } from 'vitest'
import {
  checkLeftAt,
  clampTime,
  dayLabel,
  dayOptions,
  dayPhrase,
  initialPick,
  leftAtBounds,
  leftAtFrom,
  suggestedLeftAt,
} from '#/lib/leftAt'
import { base64UrlToBytes, notificationSettingsSteps, reminderPrompt } from '#/lib/pushClient'

const at = (iso: string) => Date.parse(iso)

describe('leftAtBounds', () => {
  it('starts the minute after check-in and ends now when that is sooner than 24 h', () => {
    const b = leftAtBounds('2026-11-20T07:30:00.000Z', at('2026-11-21T06:10:42.000Z'))
    expect(new Date(b.min).toISOString()).toBe('2026-11-20T07:31:00.000Z')
    expect(new Date(b.max).toISOString()).toBe('2026-11-21T06:10:00.000Z')
  })

  it('caps at check-in + 24 h', () => {
    const b = leftAtBounds('2026-11-18T07:30:20.000Z', at('2026-11-21T09:00:00.000Z'))
    expect(new Date(b.min).toISOString()).toBe('2026-11-18T07:31:00.000Z')
    expect(new Date(b.max).toISOString()).toBe('2026-11-19T07:30:00.000Z')
    expect(checkLeftAt(b.max, b)).toBe('ok')
    expect(checkLeftAt(b.max + 60_000, b)).toBe('too_late')
    expect(checkLeftAt(at('2026-11-18T07:30:00.000Z'), b)).toBe('too_early')
    expect(checkLeftAt(Number.NaN, b)).toBe('too_early')
  })
})

describe('dayOptions and leftAtFrom across midnight (Europe/London)', () => {
  it('offers both days of a night shift with per-day clock limits (GMT)', () => {
    // Checked in Thu 20:00, now Fri 10:15.
    const now = at('2026-11-20T10:15:00.000Z')
    const b = leftAtBounds('2026-11-19T20:00:00.000Z', now)
    const days = dayOptions(b, now)
    expect(days).toEqual([
      { date: '2026-11-19', label: 'Yesterday', minTime: '20:01', maxTime: '23:59' },
      { date: '2026-11-20', label: 'Today', minTime: '00:00', maxTime: '10:15' },
    ])
    expect(leftAtFrom('2026-11-20', '08:00')!.toISOString()).toBe('2026-11-20T08:00:00.000Z')
    expect(leftAtFrom('2026-11-19', '23:30')!.toISOString()).toBe('2026-11-19T23:30:00.000Z')
  })

  it('converts BST wall time to UTC', () => {
    // 20:00 BST on 1 July is 19:00 UTC; midnight BST is 23:00 UTC the day before.
    expect(leftAtFrom('2026-07-01', '20:00')!.toISOString()).toBe('2026-07-01T19:00:00.000Z')
    expect(leftAtFrom('2026-07-02', '00:30')!.toISOString()).toBe('2026-07-01T23:30:00.000Z')
    const now = at('2026-07-02T08:00:00.000Z') // 09:00 BST
    const days = dayOptions(leftAtBounds('2026-07-01T18:30:00.000Z', now), now) // 19:30 BST
    expect(days.map((d) => [d.date, d.minTime, d.maxTime])).toEqual([
      ['2026-07-01', '19:31', '23:59'],
      ['2026-07-02', '00:00', '09:00'],
    ])
  })

  it('handles the autumn clock change (25-hour day)', () => {
    // 25 Oct 2026: clocks go back at 02:00 BST → 01:00 GMT. 08:00 that morning is GMT.
    expect(leftAtFrom('2026-10-25', '08:00')!.toISOString()).toBe('2026-10-25T08:00:00.000Z')
    expect(leftAtFrom('2026-10-24', '20:00')!.toISOString()).toBe('2026-10-24T19:00:00.000Z')
  })

  it('a single day when the range does not cross midnight', () => {
    const now = at('2026-11-21T21:30:00.000Z')
    const days = dayOptions(leftAtBounds('2026-11-21T07:30:00.000Z', now), now)
    expect(days).toEqual([{ date: '2026-11-21', label: 'Today', minTime: '07:31', maxTime: '21:30' }])
  })

  it('rejects malformed clock times', () => {
    expect(leftAtFrom('2026-11-21', '24:00')).toBeNull()
    expect(leftAtFrom('2026-11-21', '7:5')).toBeNull()
    expect(leftAtFrom('21/11/2026', '07:50')).toBeNull()
  })
})

describe('picker helpers', () => {
  const day = { date: '2026-11-20', label: 'Today', minTime: '00:00', maxTime: '10:15' }
  it('clamps a time into the chosen day', () => {
    expect(clampTime('11:00', day)).toBe('10:15')
    expect(clampTime('09:00', day)).toBe('09:00')
    expect(clampTime('', { ...day, minTime: '20:01' })).toBe('20:01')
  })

  it('suggests the expected end only when it is an allowed time', () => {
    const b = leftAtBounds('2026-11-20T07:30:00.000Z', at('2026-11-21T09:00:00.000Z'))
    expect(suggestedLeftAt('2026-11-20T19:30:00.000Z', b)).toBe(at('2026-11-20T19:30:00.000Z'))
    // Checked in after the rota end: the end is before check-in, so no one-tap suggestion.
    expect(suggestedLeftAt('2026-11-20T07:00:00.000Z', b)).toBeNull()
  })

  it('starts the picker at the expected end, clamped into range', () => {
    const b = leftAtBounds('2026-11-20T07:30:00.000Z', at('2026-11-20T21:00:00.000Z'))
    expect(initialPick('2026-11-20T19:30:00.000Z', b)).toEqual({ date: '2026-11-20', time: '19:30' })
    expect(initialPick('2026-11-20T06:00:00.000Z', b)).toEqual({ date: '2026-11-20', time: '07:31' })
  })

  it('words the day relative to now', () => {
    const now = at('2026-11-21T10:00:00.000Z') // Saturday
    expect(dayPhrase(at('2026-11-21T07:30:00.000Z'), now)).toBe('today')
    expect(dayPhrase(at('2026-11-20T07:30:00.000Z'), now)).toBe('yesterday')
    expect(dayPhrase(at('2026-11-19T07:30:00.000Z'), now)).toBe('on Thursday')
    expect(dayPhrase(at('2026-11-14T07:30:00.000Z'), now)).toBe('on Saturday 14 November')
    expect(dayLabel('2026-11-19', now)).toBe('Thu 19 Nov')
  })
})

describe('reminderPrompt', () => {
  const base = { availability: 'yes', permission: 'default', subscribed: false, choice: null, snoozed: false, asked: false } as const
  it('offers reminders once the subscription state is known', () => {
    expect(reminderPrompt({ ...base, subscribed: null })).toBe('none')
    expect(reminderPrompt(base)).toBe('offer')
  })
  it('hides when unavailable, snoozed or turned off', () => {
    expect(reminderPrompt({ ...base, availability: 'no' })).toBe('none')
    expect(reminderPrompt({ ...base, snoozed: true })).toBe('none')
    expect(reminderPrompt({ ...base, choice: 'off', permission: 'granted' })).toBe('none')
  })
  it('asks iPhone tabs to add to the Home Screen first', () => {
    expect(reminderPrompt({ ...base, availability: 'install' })).toBe('install')
  })
  it('is on only with a granted, live subscription', () => {
    expect(reminderPrompt({ ...base, choice: 'on', permission: 'granted', subscribed: true })).toBe('on')
    // Subscription lost (e.g. permission reset): offer again.
    expect(reminderPrompt({ ...base, choice: 'on', permission: 'default', subscribed: false })).toBe('offer')
  })
  it('shows the blocked help only after asking (or after reminders were on)', () => {
    expect(reminderPrompt({ ...base, permission: 'denied' })).toBe('none')
    expect(reminderPrompt({ ...base, permission: 'denied', asked: true })).toBe('denied')
    expect(reminderPrompt({ ...base, permission: 'denied', choice: 'on' })).toBe('denied')
    expect(reminderPrompt({ ...base, permission: 'denied', choice: 'on', snoozed: true })).toBe('none')
  })
})

describe('push helpers', () => {
  it('decodes a base64url VAPID key', () => {
    const bytes = base64UrlToBytes(Buffer.from(Uint8Array.from([4, 250, 251, 252, 0, 1])).toString('base64url'))
    expect(Array.from(bytes)).toEqual([4, 250, 251, 252, 0, 1])
  })
  it('names where to re-allow notifications', () => {
    expect(notificationSettingsSteps('ios', 'standalone')).toMatch(/Settings › Notifications › InOut/)
    expect(notificationSettingsSteps('android', 'browser')).toMatch(/Site settings › Notifications/)
    expect(notificationSettingsSteps('android', 'samsung')).toMatch(/Samsung Internet/)
  })
})

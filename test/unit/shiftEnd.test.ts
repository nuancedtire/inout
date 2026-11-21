import { describe, expect, it } from 'vitest'
import {
  expectedShiftEnd,
  isForgottenSession,
  isReminderDue,
  londonWallTimeToUtc,
  parseClockMinutes,
  shiftLabel,
  ukClock,
} from '#/utils/shiftEnd'

const end = (rotaDate: string, shiftStart: string | null, shiftEnd: string | null, checkInAt: string) =>
  expectedShiftEnd({ rotaDate, shiftStart, shiftEnd, checkInAt })

describe('expectedShiftEnd', () => {
  it('uses the rota end time in GMT (winter)', () => {
    const r = end('2026-11-21', '08:00', '20:00', '2026-11-21T07:55:00.000Z')
    expect(r).toEqual({ expectedEndAt: new Date('2026-11-21T20:00:00.000Z'), basis: 'shift' })
  })

  it('converts BST wall time to UTC (summer)', () => {
    const r = end('2026-07-01', '08:00', '20:00', '2026-07-01T06:58:00.000Z')
    expect(r.expectedEndAt.toISOString()).toBe('2026-07-01T19:00:00.000Z')
    expect(ukClock(r.expectedEndAt)).toBe('20:00')
  })

  it('rolls an overnight shift (end before start) into the next day', () => {
    expect(end('2026-11-21', '20:00', '08:00', '2026-11-21T19:50:00.000Z').expectedEndAt.toISOString())
      .toBe('2026-11-22T08:00:00.000Z')
    // A 24-hour shift (end equals start) also ends the next day.
    expect(end('2026-11-21', '09:00', '09:00', '2026-11-21T08:50:00.000Z').expectedEndAt.toISOString())
      .toBe('2026-11-22T09:00:00.000Z')
  })

  it('rolls an end time with no start into the next day when it is not after check-in', () => {
    expect(end('2026-11-21', null, '07:30', '2026-11-21T21:00:00.000Z').expectedEndAt.toISOString())
      .toBe('2026-11-22T07:30:00.000Z')
    expect(end('2026-11-21', null, '17:00', '2026-11-21T09:00:00.000Z').expectedEndAt.toISOString())
      .toBe('2026-11-21T17:00:00.000Z')
  })

  it('falls back to check-in + 12 hours without shift times', () => {
    expect(end('2026-11-21', null, null, '2026-11-21T07:00:00.000Z'))
      .toEqual({ expectedEndAt: new Date('2026-11-21T19:00:00.000Z'), basis: 'default' })
    expect(end('2026-11-21', '08:00', 'later', '2026-11-21T07:00:00.000Z').basis).toBe('default')
  })

  it('handles overnight shifts across the BST transitions', () => {
    // Clocks go back at 02:00 BST on Sunday 25 October 2026: the night is 13 hours long.
    const autumn = end('2026-10-24', '20:00', '08:00', '2026-10-24T18:55:00.000Z').expectedEndAt
    expect(autumn.toISOString()).toBe('2026-10-25T08:00:00.000Z')
    expect(autumn.getTime() - Date.parse('2026-10-24T19:00:00.000Z')).toBe(13 * 3_600_000)
    // Clocks go forward at 01:00 GMT on Sunday 29 March 2026: the night is 11 hours long.
    const spring = end('2026-03-28', '20:00', '08:00', '2026-03-28T19:55:00.000Z').expectedEndAt
    expect(spring.toISOString()).toBe('2026-03-29T07:00:00.000Z')
    expect(spring.getTime() - Date.parse('2026-03-28T20:00:00.000Z')).toBe(11 * 3_600_000)
  })
})

describe('londonWallTimeToUtc', () => {
  it('maps the spring-forward gap forward and the autumn overlap to the earlier instant', () => {
    expect(londonWallTimeToUtc('2026-03-29', 90).toISOString()).toBe('2026-03-29T01:30:00.000Z') // 01:30 does not exist; 02:30 BST
    expect(londonWallTimeToUtc('2026-10-25', 90).toISOString()).toBe('2026-10-25T00:30:00.000Z') // first 01:30 (BST)
    expect(londonWallTimeToUtc('2026-11-21', 24 * 60).toISOString()).toBe('2026-11-22T00:00:00.000Z')
  })
})

describe('reminder and forgotten windows', () => {
  const day = { rotaDate: '2026-11-21', shiftStart: '08:00', shiftEnd: '20:00', checkInAt: '2026-11-21T07:55:00.000Z' }

  it('is due 15 minutes after the expected end, only within 24 hours of check-in', () => {
    expect(isReminderDue(day, new Date('2026-11-21T20:14:59.000Z'))).toBe(false)
    expect(isReminderDue(day, new Date('2026-11-21T20:15:00.000Z'))).toBe(true)
    expect(isReminderDue(day, new Date('2026-11-22T07:56:00.000Z'))).toBe(false)
  })

  it('is forgotten after expected end + 60 minutes, while open, within 7 days', () => {
    expect(isForgottenSession({ ...day, checkOutAt: null }, new Date('2026-11-21T21:00:00.000Z'))).toBe(false)
    expect(isForgottenSession({ ...day, checkOutAt: null }, new Date('2026-11-21T21:00:01.000Z'))).toBe(true)
    expect(isForgottenSession({ ...day, checkOutAt: '2026-11-21T20:05:00.000Z' }, new Date('2026-11-22T09:00:00.000Z'))).toBe(false)
    expect(isForgottenSession({ ...day, checkOutAt: null }, new Date('2026-11-28T07:56:00.000Z'))).toBe(false)
  })
})

describe('parsing and labels', () => {
  it('parses shift clock times', () => {
    expect(parseClockMinutes('08:00')).toBe(480)
    expect(parseClockMinutes('8:05')).toBe(485)
    expect(parseClockMinutes('23:45:00')).toBe(1425)
    expect(parseClockMinutes('24:00')).toBe(1440)
    expect(parseClockMinutes('24:30')).toBeNull()
    expect(parseClockMinutes('12:60')).toBeNull()
    expect(parseClockMinutes(null)).toBeNull()
  })

  it('labels complete shifts only', () => {
    expect(shiftLabel('08:00', '20:00')).toBe('08:00–20:00')
    expect(shiftLabel('8:00', '24:00')).toBe('08:00–00:00')
    expect(shiftLabel(null, '20:00')).toBeNull()
  })
})

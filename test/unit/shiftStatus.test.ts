import { describe, expect, it } from 'vitest'
import { formatSpan, londonMinutes, shiftStatus } from '#/components/checkin/shiftStatus'

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

describe('shiftStatus', () => {
  it('counts down to the start and shows the times', () => {
    expect(shiftStatus({ start: '08:00', end: '20:30', checkedIn: false, nowMinutes: at('07:54') }))
      .toEqual({ times: '08:00–20:30', label: 'Starts in 6 min', tone: 'neutral', progress: null })
    expect(shiftStatus({ start: '08:00', end: '20:30', checkedIn: false, nowMinutes: at('05:50') }).label).toBe('Starts in 2h 10m')
  })

  it('gives a few minutes’ grace, then says how long ago it started', () => {
    expect(shiftStatus({ start: '08:00', end: '20:30', checkedIn: false, nowMinutes: at('08:04') }).label).toBe('Starting now')
    expect(shiftStatus({ start: '08:00', end: '20:30', checkedIn: false, nowMinutes: at('08:12') }))
      .toMatchObject({ label: 'Started 12 min ago', tone: 'warning' })
    expect(shiftStatus({ start: '08:00', end: '20:30', checkedIn: false, nowMinutes: at('21:00') }).label).toBe('Shift over')
  })

  it('shows time left and progress while checked in, and overrun after the end', () => {
    expect(shiftStatus({ start: '08:00', end: '20:00', checkedIn: true, nowMinutes: at('14:00') }))
      .toEqual({ times: '08:00–20:00', label: 'Ends in 6h', tone: 'success', progress: 0.5 })
    expect(shiftStatus({ start: '08:00', end: '20:00', checkedIn: true, nowMinutes: at('20:25') }))
      .toMatchObject({ label: 'Ended 25 min ago', tone: 'warning', progress: 1 })
  })

  it('handles overnight shifts on both sides of midnight', () => {
    expect(shiftStatus({ start: '20:00', end: '08:30', checkedIn: true, nowMinutes: at('23:30') }).label).toBe('Ends in 9h')
    expect(shiftStatus({ start: '20:00', end: '08:30', checkedIn: true, nowMinutes: at('02:00') }).label).toBe('Ends in 6h 30m')
    expect(shiftStatus({ start: '20:00', end: '08:30', checkedIn: true, nowMinutes: at('09:00') }).label).toBe('Ended 30 min ago')
  })

  it('copes with missing or partial times', () => {
    expect(shiftStatus({ start: null, end: null, checkedIn: false, nowMinutes: 600 })).toEqual({ times: null, label: null, tone: 'neutral', progress: null })
    expect(shiftStatus({ start: '8:00', end: null, checkedIn: false, nowMinutes: at('07:00') }))
      .toMatchObject({ times: 'From 08:00', label: 'Starts in 1h' })
    expect(shiftStatus({ start: '08:00:00', end: null, checkedIn: true, nowMinutes: at('09:00') }))
      .toMatchObject({ times: 'From 08:00', label: null, progress: null })
  })
})

describe('formatSpan and londonMinutes', () => {
  it('formats short and long spans', () => {
    expect(formatSpan(0)).toBe('1 min')
    expect(formatSpan(59)).toBe('59 min')
    expect(formatSpan(120)).toBe('2h')
    expect(formatSpan(125)).toBe('2h 5m')
  })

  it('reads UK wall-clock time across GMT and BST', () => {
    expect(londonMinutes(Date.UTC(2026, 0, 15, 9, 30))).toBe(at('09:30'))
    expect(londonMinutes(Date.UTC(2026, 6, 15, 9, 30))).toBe(at('10:30'))
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatDurationHours, formatTime, relativeTime, todayDate } from '#/utils/dateTime'

afterEach(() => { vi.useRealTimers() })

describe('UK attendance dates', () => {
  it.each([
    ['2026-01-15T12:30:00Z', '12:30'],
    ['2026-07-15T12:30:00Z', '13:30'],
    ['2026-03-29T00:30:00Z', '00:30'],
    ['2026-03-29T01:30:00Z', '02:30'],
  ])('formats %s in Europe/London as %s', (iso, expected) => {
    expect(formatTime(iso)).toBe(expected)
  })

  it('uses the UK calendar date across midnight during British Summer Time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:30:00Z'))
    expect(todayDate()).toBe('2026-07-16')
    expect(formatDate('2026-07-15T23:30:00Z')).toBe('16/07/2026')
  })

  it('handles missing and invalid display dates', () => {
    expect(formatTime(null)).toBe('-')
    expect(formatDate('invalid')).toBe('-')
    expect(relativeTime(undefined)).toBe('-')
  })

  it('measures elapsed hours across the daylight-saving transition', () => {
    expect(formatDurationHours('2026-03-29T00:00:00Z', '2026-03-29T08:00:00Z')).toBe('8.00h')
  })

  it('calculates ongoing durations and relative times against a controlled clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
    expect(formatDurationHours('2026-10-16T10:30:00Z')).toBe('1.50h')
    expect(relativeTime('2026-10-16T11:55:00Z')).toBe('5m ago')
  })
})

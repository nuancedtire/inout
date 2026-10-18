import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManualCheckInLimiter, validateManualCheckIn } from '#/utils/manualCheckIn'

afterEach(() => vi.restoreAllMocks())

describe('manual check-in validation', () => {
  it('normalizes names and optional roles', () => {
    expect(validateManualCheckIn({ name: ' Alice Example ', role: ' Nurse ', token: 'ABCDEFGHIJKL' })).toEqual({ name: 'Alice Example', role: 'Nurse', token: 'ABCDEFGHIJKL' })
    expect(validateManualCheckIn({ name: '李 Example', role: ' ', token: 'ABCDEFGHIJKL' }).role).toBeUndefined()
  })

  it('rejects missing required fields', () => {
    expect(() => validateManualCheckIn({})).toThrow()
  })

  it.each([null, { name: 42 }, { name: ' ' }, { name: 'a'.repeat(201) }, { role: 42 }, { role: 'a'.repeat(101) }, { token: '' }, { token: 'a'.repeat(1000) }, { token: 42 }])('rejects malformed input %j', (invalid) => {
    expect(() => validateManualCheckIn(invalid === null ? null : { name: 'Alice', token: 'ABCDEFGHIJKL', ...invalid })).toThrow()
  })
})

describe('manual check-in burst limit', () => {
  it('allows a shared-network burst, blocks repeats, and recovers at the window boundary', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const check = createManualCheckInLimiter()
    for (let i = 0; i < 10; i++) check('192.0.2.1')
    expect(() => check('192.0.2.1')).toThrow(/Too many check-ins/)
    expect(() => check('192.0.2.2')).not.toThrow()
    now.mockReturnValue(59_999)
    expect(() => check('192.0.2.1')).toThrow()
    now.mockReturnValue(60_000)
    expect(() => check('192.0.2.1')).not.toThrow()
  })

  it('limits missing addresses instead of bypassing protection', () => {
    const check = createManualCheckInLimiter()
    for (let i = 0; i < 10; i++) check(undefined)
    expect(() => check(undefined)).toThrow()
    expect(() => check('')).toThrow()
  })

  it('bounds memory without evicting active limits, then reclaims expired buckets', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const check = createManualCheckInLimiter()
    for (let i = 0; i < 2_048; i++) check(`client-${i}`)
    expect(() => check('new-client')).toThrow()
    for (let i = 0; i < 9; i++) check('client-0')
    expect(() => check('client-0')).toThrow()
    now.mockReturnValue(60_000)
    expect(() => check('new-client')).not.toThrow()
  })
})

import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionToken, createStaffToken, deriveTokenForDate, requireAdmin, verifyAdminPin, verifySessionToken, verifyStaffToken } from '#/utils/auth'

afterEach(() => { vi.useRealTimers() })

describe('admin authentication in Workers', () => {
  it('reads the configured admin PIN from the Worker binding', async () => {
    expect(await verifyAdminPin(env.ADMIN_PIN)).toBe(true)
    expect(await verifyAdminPin('incorrect')).toBe(false)
    await expect(requireAdmin({ pin: env.ADMIN_PIN })).resolves.toBeUndefined()
  })

  it('issues a signed token accepted by the admin guard', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
    await expect(requireAdmin({ token })).resolves.toBeUndefined()
  })

  it('rejects a tampered signature', async () => {
    const [payload, signature] = (await createSessionToken()).split('.')
    const tampered = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(await verifySessionToken(tampered)).toBe(false)
    await expect(requireAdmin({ token: tampered })).rejects.toThrow('Unauthorized')
  })

  it('expires admin sessions after twelve hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
    const token = await createSessionToken()
    vi.setSystemTime(new Date('2026-10-16T20:00:00.001Z'))
    expect(await verifySessionToken(token)).toBe(false)
    await expect(requireAdmin({ token })).rejects.toThrow('Unauthorized')
  })

  it.each(['', 'invalid', 'bad.payload', '%.%'])('rejects malformed token %j', async (token) => {
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('rejects requests without credentials', async () => {
    await expect(requireAdmin({})).rejects.toThrow('Unauthorized')
  })

  it('derives stable daily QR tokens with Workers Web Crypto', async () => {
    const token = await deriveTokenForDate('2026-10-16')
    expect(token).toMatch(/^[A-Z2-7]{12}$/)
    expect(await deriveTokenForDate('2026-10-16')).toBe(token)
    expect(await deriveTokenForDate('2026-10-17')).not.toBe(token)
  })
})

describe('staff device tokens', () => {
  it('round-trips staff and credential IDs', async () => {
    const token = await createStaffToken(42, 'Y3JlZC1pZA')
    expect(await verifyStaffToken(token)).toEqual({ staffId: 42, credentialId: 'Y3JlZC1pZA' })
  })

  it('never validates an admin token as a staff token, or a staff token as an admin token', async () => {
    const admin = await createSessionToken()
    const staffToken = await createStaffToken(1, 'abc')
    expect(await verifyStaffToken(admin)).toBeNull()
    expect(await verifySessionToken(staffToken)).toBe(false)
    expect(await verifySessionToken(staffToken.split('.').slice(1).join('.'))).toBe(false)
    expect(await verifyStaffToken(`st1.${admin}`)).toBeNull()
    await expect(requireAdmin({ token: staffToken })).rejects.toThrow('Unauthorized')
  })

  it('rejects tampered and expired staff tokens', async () => {
    const token = await createStaffToken(1, 'abc')
    const [prefix, payload, sig] = token.split('.')
    const forged = btoa(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).replace(/:1:/, ':2:')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await verifyStaffToken(`${prefix}.${forged}.${sig}`)).toBeNull()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const old = await createStaffToken(1, 'abc')
    vi.setSystemTime(new Date('2026-04-02T00:00:00Z'))
    expect(await verifyStaffToken(old)).toBeNull()
  })
})

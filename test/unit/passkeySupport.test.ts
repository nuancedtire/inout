import { describe, expect, it } from 'vitest'
import { normalizeName } from '#/utils/staffNames'
import { passkeyLabel } from '#/utils/passkeyLabels'
import { resolveRelyingParty } from '#/utils/webauthnConfig'

describe('staff name normalisation', () => {
  it('lowercases, trims, collapses whitespace and strips accents', () => {
    expect(normalizeName('  Zoë   O’Brien\t')).toBe('zoe o’brien')
    expect(normalizeName('JOSÉ  Núñez')).toBe(normalizeName('jose nunez'))
    expect(normalizeName('Ａｌｉｃｅ')).toBe('alice')
    expect(normalizeName('Alice-Smith')).not.toBe(normalizeName('Alice Smith'))
  })
})

describe('passkey labels', () => {
  it('names known providers and falls back to the device', () => {
    expect(passkeyLabel('EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4', null)).toBe('Google Password Manager')
    expect(passkeyLabel('53414d53-554e-4700-0000-000000000000')).toBe('Samsung Pass')
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    expect(passkeyLabel('00000000-0000-0000-0000-000000000000', iphone)).toBe('iPhone')
    expect(passkeyLabel('11111111-2222-3333-4444-555555555555', 'Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('Android')
    expect(passkeyLabel(null, null)).toBeNull()
  })
})

describe('relying party configuration', () => {
  it('derives RP ID and origin from the request URL', () => {
    expect(resolveRelyingParty({ requestUrl: 'https://inout.example.nhs.uk/_serverFn/x?y=1' }))
      .toEqual({ rpID: 'inout.example.nhs.uk', origin: 'https://inout.example.nhs.uk', rpName: 'InOut' })
    expect(resolveRelyingParty({ requestUrl: 'http://localhost:5173/' })).toMatchObject({ rpID: 'localhost', origin: 'http://localhost:5173' })
  })

  it('prefers explicit configuration and allows a parent-domain RP ID', () => {
    expect(resolveRelyingParty({ rpId: 'example.nhs.uk', origin: 'https://inout.example.nhs.uk', rpName: 'ED InOut', requestUrl: 'https://preview.workers.dev/' }))
      .toEqual({ rpID: 'example.nhs.uk', origin: 'https://inout.example.nhs.uk', rpName: 'ED InOut' })
  })

  it.each([
    [{ requestUrl: 'http://inout.example.com/' }, /HTTPS/],
    [{ origin: 'https://inout.example.com/path' }, /path/],
    [{ rpId: 'other.com', requestUrl: 'https://inout.example.com/' }, /outside/],
    [{ rpId: 'xample.com', requestUrl: 'https://inout.example.com/' }, /outside/],
    [{}, /no origin/],
  ])('rejects %j', (config, message) => {
    expect(() => resolveRelyingParty(config)).toThrow(message)
  })
})

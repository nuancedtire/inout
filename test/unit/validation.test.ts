import { describe, expect, it } from 'vitest'
import {
  validateAdminUpdateSession,
  validateAuthenticationResponse,
  validateBeginEnrolment,
  validateEntryAction,
  validatePasskeyAction,
  validateRegistrationResponse,
  validateSetSiteSettings,
  validateUploadRota,
} from '#/utils/validation'

const token = 'ABCDEFGHIJKL'
const assertion = {
  id: 'Y3JlZC1pZA', rawId: 'Y3JlZC1pZA', type: 'public-key', clientExtensionResults: {},
  response: { clientDataJSON: 'eyJ9', authenticatorData: 'AAAA', signature: 'MEUC', userHandle: 'aGFuZGxl' },
}
const registration = {
  id: 'Y3JlZC1pZA', rawId: 'Y3JlZC1pZA', type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
  response: { clientDataJSON: 'eyJ9', attestationObject: 'o2Nm', transports: ['internal', 'hybrid', 'bogus'] },
}

describe('WebAuthn response validation', () => {
  it('keeps only known fields', () => {
    expect(validateAuthenticationResponse({ ...assertion, extra: 'x' })).toEqual({ ...assertion, authenticatorAttachment: undefined })
    expect(validateRegistrationResponse(registration).response.transports).toEqual(['internal', 'hybrid'])
  })

  it.each([
    ['oversized', { ...assertion, clientExtensionResults: { pad: 'a'.repeat(17_000) } }],
    ['id/rawId mismatch', { ...assertion, rawId: 'b3RoZXI' }],
    ['wrong type', { ...assertion, type: 'password' }],
    ['non-base64url', { ...assertion, response: { ...assertion.response, signature: 'a+b/' } }],
    ['missing signature', { ...assertion, response: { ...assertion.response, signature: undefined } }],
    ['bad attachment', { ...assertion, authenticatorAttachment: 'usb' }],
    ['not an object', 'response'],
  ])('rejects an assertion: %s', (_label, value) => {
    expect(() => validateAuthenticationResponse(value)).toThrow('Invalid passkey response')
  })

  it('rejects an oversized attestation object', () => {
    expect(() => validateRegistrationResponse({ ...registration, response: { ...registration.response, attestationObject: 'a'.repeat(12_001) } })).toThrow()
  })
})

describe('server input validation', () => {
  it('validates passkey actions', () => {
    expect(validatePasskeyAction({ token, action: 'check_in', response: assertion, location: { status: 'denied' } }))
      .toMatchObject({ token, action: 'check_in', location: { status: 'denied' } })
    expect(() => validatePasskeyAction({ token, action: 'delete', response: assertion })).toThrow('Invalid action')
    expect(() => validatePasskeyAction({ token: 'abc', action: 'check_in', response: assertion })).toThrow(/QR/)
  })

  it('accepts both enrolment forms', () => {
    expect(validateBeginEnrolment({ token, rosterEntryId: 4 })).toEqual({ token, rosterEntryId: 4 })
    expect(validateBeginEnrolment({ token, name: '  Dr Locum ', role: ' ' })).toEqual({ token, name: 'Dr Locum', role: undefined })
    expect(() => validateBeginEnrolment({ token, rosterEntryId: '4' })).toThrow()
    expect(() => validateBeginEnrolment({ token, name: 'a'.repeat(201) })).toThrow(/200/)
  })

  it('replaces typed identity validators on check-in', () => {
    expect(validateEntryAction({ rosterEntryId: 1, token })).toEqual({ rosterEntryId: 1, token, location: undefined })
    for (const bad of [{ rosterEntryId: '1', token }, { rosterEntryId: 1.5, token }, { rosterEntryId: -1, token }, { rosterEntryId: 1 }, null]) {
      expect(() => validateEntryAction(bad)).toThrow()
    }
  })

  it('validates admin inputs', () => {
    expect(validateAdminUpdateSession({ authToken: 't', sessionId: 2, checkOutAt: '' })).toMatchObject({ checkOutAt: '' })
    expect(() => validateAdminUpdateSession({ authToken: 't', sessionId: 2, checkInAt: 'yesterday' })).toThrow()
    expect(() => validateAdminUpdateSession({ authToken: 't' })).toThrow()
    expect(() => validateSetSiteSettings({ authToken: 't', latitude: 51, longitude: 0, radiusM: 10, accuracyCeilingM: 50 })).toThrow(/Radius/)
    expect(() => validateSetSiteSettings({ authToken: 't', latitude: 51, longitude: 0, radiusM: 100, accuracyCeilingM: 501 })).toThrow(/Accuracy/)
    expect(() => validateUploadRota({ authToken: 't', date: '2026-13-45', fileBase64: 'AA==', fileName: 'r.csv' })).toThrow('Invalid date')
  })
})

import { describe, expect, it } from 'vitest'
import { deriveVerification, FLAG_REASON_LABEL, flagLabels, readIdentity, readLocation } from '#/utils/verification'

describe('session verification', () => {
  it('verifies passkey + inside at check-in for open sessions, and at both ends once closed', () => {
    expect(deriveVerification({ identityIn: 'passkey', locationIn: 'inside' })).toEqual({ verified: true, accepted: false, reasons: [] })
    expect(deriveVerification({ identityIn: 'passkey', locationIn: 'inside', checkOutAt: 'x', identityOut: 'passkey', locationOut: 'inside' }).verified).toBe(true)
    expect(deriveVerification({ identityIn: 'passkey', locationIn: 'inside', checkOutAt: 'x', identityOut: 'passkey', locationOut: 'outside' }))
      .toEqual({ verified: false, accepted: false, reasons: ['location_outside'] })
  })

  it('reads legacy NULL evidence as self_selected and not_requested', () => {
    expect(readIdentity(null)).toBe('self_selected')
    expect(readLocation(undefined)).toBe('not_requested')
    expect(deriveVerification({}).reasons).toEqual(['identity_self_selected', 'location_not_checked'])
  })

  it('derives each reason and de-duplicates across ends', () => {
    expect(deriveVerification({ identityIn: 'passkey_pending', locationIn: 'denied', checkOutAt: 'x', identityOut: 'passkey_pending', locationOut: 'unavailable' }).reasons)
      .toEqual(['identity_pending', 'location_denied', 'location_unavailable'])
  })

  it('does not flag admin ends, and reports acceptance without hiding reasons', () => {
    expect(deriveVerification({ identityIn: 'admin', locationIn: 'not_requested', checkOutAt: 'x', identityOut: 'admin' }).verified).toBe(true)
    expect(deriveVerification({ identityIn: 'passkey', locationIn: 'inside', checkOutAt: 'x', identityOut: 'admin', locationOut: 'not_requested' }).verified).toBe(true)
    expect(deriveVerification({ identityIn: 'self_selected', locationIn: 'outside', reviewState: 'accepted' }))
      .toEqual({ verified: false, accepted: true, reasons: ['identity_self_selected', 'location_outside'] })
  })

  it('labels every reason in plain words', () => {
    expect(Object.values(FLAG_REASON_LABEL).every((l) => l.length > 0)).toBe(true)
    expect(flagLabels(['identity_pending', 'location_outside'])).toBe('Phone awaiting approval; Outside the department')
  })
})

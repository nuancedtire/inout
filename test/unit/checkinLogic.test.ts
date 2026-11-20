import { describe, expect, it } from 'vitest'
import { WebAuthnError } from '@simplewebauthn/browser'
import { groupCode, normalizeCode, parseScannedText, classifyCameraError } from '#/lib/qrScanner'
import { classifyPasskeyError } from '#/lib/passkeyClient'
import { detectPlatform, unlockCopy } from '#/lib/platform'
import { isSnoozed, SNOOZE_MS } from '#/lib/installPrompt'
import { classifyServerError } from '#/lib/checkinErrors'
import { evidenceItems, flagNotes, firstName, formatElapsed, initials, shiftLabel } from '#/components/checkin/copy'

const ORIGIN = 'https://inout.example.nhs.uk'

describe('QR scanning', () => {
  it('accepts this site’s check-in URL or a bare code, and refuses anything else', () => {
    expect(parseScannedText(`${ORIGIN}/?token=ABCDEFGH2345`, ORIGIN)).toEqual({ kind: 'token', token: 'ABCDEFGH2345' })
    expect(parseScannedText(' abcdefgh2345 ', ORIGIN)).toEqual({ kind: 'token', token: 'ABCDEFGH2345' })
    expect(parseScannedText('https://evil.example/?token=ABCDEFGH2345', ORIGIN)).toEqual({ kind: 'foreign' })
    expect(parseScannedText(`${ORIGIN}/?token=SHORT`, ORIGIN)).toEqual({ kind: 'foreign' })
    expect(parseScannedText('hello world', ORIGIN)).toEqual({ kind: 'foreign' })
    expect(parseScannedText('ABCDEFGH1890', ORIGIN)).toEqual({ kind: 'foreign' }) // 0, 1, 8, 9 are not base32
  })

  it('normalises and groups typed codes', () => {
    expect(normalizeCode('abcd-efgh jk')).toBe('ABCDEFGHJK')
    expect(normalizeCode('ABCD EFGH 2345 EXTRA')).toBe('ABCDEFGH2345')
    expect(groupCode('ABCDEFGH2345')).toBe('ABCD EFGH 2345')
    expect(groupCode('ABCDE')).toBe('ABCD E')
    expect(groupCode('ABCD')).toBe('ABCD')
  })

  it('classifies camera failures', () => {
    expect(classifyCameraError(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe('denied')
    expect(classifyCameraError(Object.assign(new Error('x'), { name: 'NotFoundError' }))).toBe('unavailable')
    expect(classifyCameraError(Object.assign(new Error('x'), { name: 'TypeError' }))).toBe('unsupported')
  })
})

describe('passkey error mapping', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name })
  const wrapped = (code: ConstructorParameters<typeof WebAuthnError>[0]['code'], causeName: string) =>
    new WebAuthnError({ message: 'm', code, cause: named(causeName) })

  it('maps WebAuthn failures to plain kinds', () => {
    expect(classifyPasskeyError(wrapped('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'NotAllowedError'))).toBe('cancelled')
    expect(classifyPasskeyError(wrapped('ERROR_CEREMONY_ABORTED', 'AbortError'))).toBe('cancelled')
    expect(classifyPasskeyError(wrapped('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', 'InvalidStateError'))).toBe('already_registered')
    expect(classifyPasskeyError(wrapped('ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT', 'ConstraintError'))).toBe('no_screen_lock')
    expect(classifyPasskeyError(wrapped('ERROR_INVALID_RP_ID', 'SecurityError'))).toBe('misconfigured')
    expect(classifyPasskeyError(named('NotAllowedError'))).toBe('cancelled')
    expect(classifyPasskeyError(named('NotSupportedError'))).toBe('unsupported')
    expect(classifyPasskeyError(new Error('WebAuthn is not supported in this browser'))).toBe('unsupported')
    expect(classifyPasskeyError('nope')).toBe('unknown')
  })
})

describe('platform wording', () => {
  it('detects iPhone, iPadOS (desktop UA with touch) and Android', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android')
    expect(unlockCopy('ios').name).toBe('Face ID')
    expect(unlockCopy('android').long).toMatch(/fingerprint, face or screen lock/)
  })
})

describe('install card snooze', () => {
  it('stays hidden for seven days after “Not now”', () => {
    const now = 1_700_000_000_000
    expect(isSnoozed(null, now)).toBe(false)
    expect(isSnoozed(String(now + SNOOZE_MS), now + SNOOZE_MS - 1)).toBe(true)
    expect(isSnoozed(String(now + SNOOZE_MS), now + SNOOZE_MS + 1)).toBe(false)
    expect(isSnoozed('garbage', now)).toBe(false)
  })
})

describe('server error routing', () => {
  it('groups server messages into next steps', () => {
    expect(classifyServerError(new Error('Invalid or expired QR code')).kind).toBe('qr_expired')
    expect(classifyServerError(new Error("This phone's passkey has been turned off. Ask the coordinator, or set up this phone again.")).kind).toBe('revoked')
    expect(classifyServerError(new Error("This phone's passkey isn't set up with InOut. Choose \"Set up this phone\" to enrol again.")).kind).toBe('not_enrolled')
    expect(classifyServerError(new Error('This profile has been turned off. Ask the coordinator.')).kind).toBe('inactive')
    expect(classifyServerError(new Error("You're already checked in")).kind).toBe('already_in')
    expect(classifyServerError(new Error("You're not checked in")).kind).toBe('not_in')
    expect(classifyServerError(new TypeError('Failed to fetch')).kind).toBe('network')
    expect(classifyServerError(new Error('anything'), false).kind).toBe('network')
    expect(classifyServerError(new Error('Too many passkey requests. Please wait a minute and try again.')).kind).toBe('rate_limited')
    expect(classifyServerError(new Error('Staff not found'))).toMatchObject({ kind: 'other', message: 'Staff not found' })
  })
})

describe('evidence wording', () => {
  const ios = unlockCopy('ios')
  it('shows ticks for passkey + inside and gentle notes for flags', () => {
    expect(evidenceItems({ action: 'check_in', identity: 'passkey', location: 'inside', reasons: [] }, ios, true)).toEqual([
      { key: 'identity', label: 'Face ID', ok: true },
      { key: 'location', label: 'In the department', ok: true },
    ])
    const flagged = { action: 'check_in' as const, identity: 'self_selected' as const, location: 'denied' as const, reasons: ['identity_self_selected' as const, 'location_denied' as const] }
    expect(evidenceItems(flagged, ios, true).map((i) => i.ok)).toEqual([false, false])
    expect(flagNotes(flagged, ios, true)).toHaveLength(2)
  })

  it('stays quiet about location when no area is configured, and about pending approval', () => {
    const r = { action: 'check_in' as const, identity: 'passkey_pending' as const, location: 'not_requested' as const, reasons: ['identity_pending' as const, 'location_not_checked' as const] }
    expect(evidenceItems(r, ios, false)).toEqual([{ key: 'identity', label: 'Face ID', ok: true }])
    expect(flagNotes(r, ios, false)).toEqual([])
    expect(flagNotes(r, ios, true)).toHaveLength(1)
    expect(evidenceItems({ ...r, action: 'checkin_undone' }, ios, true)).toEqual([])
  })

  it('formats names, durations and shifts', () => {
    expect(firstName('Dr Jane Smith')).toBe('Jane')
    expect(firstName('Sam')).toBe('Sam')
    expect(initials('Dr Jane Smith')).toBe('JS')
    expect(initials('Cher')).toBe('C')
    const start = '2026-11-20T08:00:00.000Z'
    expect(formatElapsed(start, Date.parse('2026-11-20T08:35:00.000Z'))).toBe('35m')
    expect(formatElapsed(start, Date.parse('2026-11-20T12:12:00.000Z'))).toBe('4h 12m')
    expect(formatElapsed(start, Date.parse('2026-11-20T10:00:30.000Z'))).toBe('2h')
    expect(shiftLabel('08:00:00', '18:00')).toBe('08:00–18:00')
    expect(shiftLabel(null, null)).toBeNull()
  })
})

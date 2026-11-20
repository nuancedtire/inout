import {
  browserSupportsWebAuthn,
  sendSignal,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
  WebAuthnError,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser'

/**
 * Thin wrapper over @simplewebauthn/browser that turns the many ways a passkey ceremony can fail
 * into a handful of kinds the UI can explain in plain words. Modal ceremonies only (no autofill).
 */
export type PasskeyErrorKind =
  | 'cancelled' // dismissed, timed out, or no matching passkey on this phone
  | 'already_registered' // this phone already holds an InOut passkey for this person
  | 'no_screen_lock' // the authenticator cannot verify the user (no passcode / biometrics)
  | 'unsupported' // browser or authenticator cannot do passkeys
  | 'misconfigured' // RP ID / origin mismatch: a deployment problem, not the user's
  | 'unknown'

export class PasskeyError extends Error {
  kind: PasskeyErrorKind
  constructor(kind: PasskeyErrorKind, message: string) {
    super(message)
    this.name = 'PasskeyError'
    this.kind = kind
  }
}

export function passkeysSupported(): boolean {
  try {
    return browserSupportsWebAuthn()
  } catch {
    return false
  }
}

/** Pure classification, exported for tests. */
export function classifyPasskeyError(error: unknown): PasskeyErrorKind {
  if (!(error instanceof Error)) return 'unknown'
  const name = error instanceof WebAuthnError ? (error.cause as Error | undefined)?.name ?? error.name : error.name
  const code = error instanceof WebAuthnError ? error.code : (error as { code?: string }).code
  switch (code) {
    case 'ERROR_CEREMONY_ABORTED':
      return 'cancelled'
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return 'already_registered'
    case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
    case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
      return 'no_screen_lock'
    case 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG':
    case 'ERROR_MALFORMED_PUBKEYCREDPARAMS':
      return 'unsupported'
    case 'ERROR_INVALID_DOMAIN':
    case 'ERROR_INVALID_RP_ID':
      return 'misconfigured'
  }
  switch (name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'cancelled'
    case 'InvalidStateError':
      return 'already_registered'
    case 'ConstraintError':
      return 'no_screen_lock'
    case 'NotSupportedError':
      return 'unsupported'
    case 'SecurityError':
      return 'misconfigured'
  }
  if (/not supported/i.test(error.message)) return 'unsupported'
  return 'unknown'
}

const MESSAGES: Record<PasskeyErrorKind, string> = {
  cancelled: 'That was cancelled or timed out.',
  already_registered: 'This phone is already set up for InOut.',
  no_screen_lock: 'Your phone needs a screen lock before it can be used.',
  unsupported: "This browser can't use passkeys.",
  misconfigured: "InOut isn't set up correctly for this address. Tell the coordinator.",
  unknown: 'Something went wrong with your phone’s passkey. Please try again.',
}

function wrap(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error
  const kind = classifyPasskeyError(error)
  return new PasskeyError(kind, MESSAGES[kind])
}

export async function createPasskey(optionsJSON: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
  if (!passkeysSupported()) throw new PasskeyError('unsupported', MESSAGES.unsupported)
  try {
    return await startRegistration({ optionsJSON })
  } catch (e) {
    throw wrap(e)
  }
}

export async function signWithPasskey(optionsJSON: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON> {
  if (!passkeysSupported()) throw new PasskeyError('unsupported', MESSAGES.unsupported)
  try {
    return await startAuthentication({ optionsJSON })
  } catch (e) {
    throw wrap(e)
  }
}

/** Abandon any open ceremony (e.g. when leaving a step). */
export function cancelPasskeyCeremony() {
  try {
    WebAuthnAbortService.cancelCeremony()
  } catch {
    // Nothing in flight.
  }
}

/**
 * Best effort: tell the phone's passkey provider that a credential is unknown to InOut, so it stops
 * offering a dead passkey. Silently ignored where the Signal API is unavailable.
 */
export function signalUnknownPasskey(credentialID: string, rpID?: string) {
  if (typeof window === 'undefined') return
  sendSignal({ signalName: 'unknownCredential', rpID: rpID ?? window.location.hostname, credentialID }).catch(() => {})
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON }

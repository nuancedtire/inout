/**
 * Server-side WebAuthn helpers around @simplewebauthn/server. Only imported from server-function
 * handlers. Library errors are converted to plain messages; internals are never returned.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { getRequest } from '@tanstack/react-start/server'
import { resolveRelyingParty, type RelyingParty } from './webauthnConfig'

type WebAuthnEnv = { WEBAUTHN_RP_ID?: string; WEBAUTHN_ORIGIN?: string; WEBAUTHN_RP_NAME?: string }

/** EdDSA, ES256, RS256. v14's defaults prefer ML-DSA, which workerd WebCrypto lacks. */
export const SUPPORTED_ALGORITHM_IDS = [-8, -7, -257]
export const WEBAUTHN_TIMEOUT_MS = 120_000

/** Read per request: Workers inject env at request time. */
export async function getRelyingParty(): Promise<RelyingParty> {
  const { env } = await import('cloudflare:workers')
  const e = env as WebAuthnEnv
  return resolveRelyingParty({
    rpId: e.WEBAUTHN_RP_ID,
    origin: e.WEBAUTHN_ORIGIN,
    rpName: e.WEBAUTHN_RP_NAME,
    requestUrl: getRequest().url,
  })
}

/** Stable, non-secret WebAuthn user handle for a staff record. */
export function userIdFor(staffId: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`inout-staff-${staffId}`)
}

export function userHandleFor(staffId: number): string {
  return isoBase64URL.fromBuffer(userIdFor(staffId))
}

/** Challenge the browser signed, read from clientDataJSON (verified again by the library). */
export function challengeFromClientData(clientDataJSON: string): string {
  try {
    const parsed: unknown = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON))
    const challenge = (parsed as { challenge?: unknown }).challenge
    if (typeof challenge === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(challenge)) return challenge
  } catch {
    // fall through
  }
  throw new Error('Invalid passkey response')
}

/**
 * Options as returned to the browser. `extensions` is never set by InOut and is omitted so the
 * value is serialisable by server functions; pass it to `startRegistration({ optionsJSON })`.
 */
export type CreationOptionsJSON = Omit<PublicKeyCredentialCreationOptionsJSON, 'extensions'>
/** Pass to `startAuthentication({ optionsJSON })`. */
export type RequestOptionsJSON = Omit<PublicKeyCredentialRequestOptionsJSON, 'extensions'>

export async function registrationOptions(rp: RelyingParty, person: { id: number; name: string }, exclude: { id: string; transports?: string[] }[]): Promise<CreationOptionsJSON> {
  const { extensions: _extensions, ...options } = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    // Identical name and display name: an empty or different display name breaks Chrome's hybrid QR flow.
    userName: person.name,
    userDisplayName: person.name,
    userID: userIdFor(person.id),
    attestationType: 'none',
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    // No authenticatorAttachment and no hints: iPhone, Android, Samsung Pass, password managers
    // and cross-device sign-in all stay available. Verification always requires UV.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: exclude,
    timeout: WEBAUTHN_TIMEOUT_MS,
  })
  return options
}

export async function authenticationOptions(rp: RelyingParty): Promise<RequestOptionsJSON> {
  const { extensions: _extensions, ...options } = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: [],
    userVerification: 'preferred',
    timeout: WEBAUTHN_TIMEOUT_MS,
  })
  return options
}

export async function verifyRegistration(rp: RelyingParty, response: RegistrationResponseJSON, expectedChallenge: string) {
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    })
  } catch {
    throw new Error("Your phone's passkey couldn't be checked. Please try again.")
  }
  if (!result.verified || !result.registrationInfo.userVerified) {
    throw new Error("Your phone's passkey couldn't be checked. Please try again.")
  }
  return result.registrationInfo
}

export class CounterRegressionError extends Error {}

export async function verifyAuthentication(rp: RelyingParty, response: AuthenticationResponseJSON, expectedChallenge: string, credential: {
  id: string
  publicKey: string
  counter: number
  transports?: string[]
}) {
  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
    })
  } catch (e) {
    if (e instanceof Error && /counter value/i.test(e.message)) {
      throw new CounterRegressionError('This passkey could not be trusted. Ask the coordinator to check your phone.')
    }
    throw new Error("Your phone's passkey couldn't be checked. Please try again.")
  }
  if (!result.verified || !result.authenticationInfo.userVerified) {
    throw new Error("Your phone's passkey couldn't be checked. Please try again.")
  }
  return result.authenticationInfo
}

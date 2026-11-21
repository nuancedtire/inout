/**
 * Runtime validators for the reminder and reported check-out server functions. Generic messages;
 * submitted values (endpoints are capability URLs) are never echoed.
 */
import { readDeviceId } from './deviceMarker'
import { asObject, qrToken, reqInt, reqString, validateAuthenticationResponse } from './validation'
import { base64UrlBytes, isKnownPushEndpoint, isP256PublicKey, MAX_ENDPOINT_LENGTH } from './push'

export const UNSUPPORTED_PUSH_MESSAGE = "This phone's notification service isn't supported."

function staffToken(o: Record<string, unknown>) {
  return reqString(o, 'staffToken', { max: 2048, message: 'Invalid staff token' })
}

function pushEndpoint(o: Record<string, unknown>) {
  const endpoint = reqString(o, 'endpoint', { max: MAX_ENDPOINT_LENGTH, message: UNSUPPORTED_PUSH_MESSAGE })
  if (!isKnownPushEndpoint(endpoint)) throw new Error(UNSUPPORTED_PUSH_MESSAGE)
  return endpoint
}

/** Body of PushSubscription.toJSON(): `{ endpoint, expirationTime, keys: { p256dh, auth } }`. */
export function validateSubscribePush(data: unknown) {
  const o = asObject(data)
  const token = qrToken(o)
  const sub = asObject(o.subscription)
  const endpoint = pushEndpoint(sub)
  const keys = asObject(sub.keys)
  const p256dh = reqString(keys, 'p256dh', { max: 128, message: 'Invalid subscription' })
  const auth = reqString(keys, 'auth', { max: 64, message: 'Invalid subscription' })
  if (!isP256PublicKey(p256dh) || base64UrlBytes(auth)?.length !== 16) throw new Error('Invalid subscription')
  return { token, staffToken: staffToken(o), subscription: { endpoint, keys: { p256dh, auth } } }
}

export function validateUnsubscribePush(data: unknown) {
  const o = asObject(data)
  return { token: qrToken(o), staffToken: staffToken(o), endpoint: pushEndpoint(o) }
}

export function validateForgottenCheckout(data: unknown) {
  const o = asObject(data)
  return { token: qrToken(o), staffToken: staffToken(o) }
}

/** An absolute ISO-8601 instant: a `Z` or numeric offset is required so the time is unambiguous. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

export function validateReportForgottenCheckout(data: unknown) {
  const o = asObject(data)
  const token = qrToken(o)
  const sessionId = reqInt(o, 'sessionId', 1, undefined, "That shift couldn't be found.")
  const leftAt = reqString(o, 'leftAt', { max: 40, pattern: INSTANT, message: 'Choose the time you left.' })
  if (Number.isNaN(Date.parse(leftAt))) throw new Error('Choose the time you left.')
  return { token, sessionId, leftAt, response: validateAuthenticationResponse(o.response), deviceId: readDeviceId(o) }
}

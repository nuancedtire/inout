/**
 * Plain-language versions of the errors the staff check-in flow can meet, each with a next step.
 * Server messages are already written for staff; this groups them so the UI can react (e.g. send
 * an expired QR back to the scanner) and fills in the gaps (network, rate limit).
 */
export type CheckinErrorKind =
  | 'qr_expired'
  | 'revoked'
  | 'inactive'
  | 'not_enrolled'
  | 'already_in'
  | 'not_in'
  | 'nothing_to_undo'
  | 'expired_request'
  | 'rate_limited'
  | 'network'
  | 'other'

export type CheckinError = { kind: CheckinErrorKind; title: string; message: string }

export function classifyServerError(error: unknown, online = true): CheckinError {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!online || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return { kind: 'network', title: 'No connection', message: 'Nothing was recorded. Check your signal and try again.' }
  }
  if (/invalid or expired qr code/i.test(message)) {
    return { kind: 'qr_expired', title: 'This QR code isn’t current', message: 'The check-in code has changed. Scan the InOut poster in the department.' }
  }
  if (/turned off/i.test(message) && /passkey/i.test(message)) {
    return { kind: 'revoked', title: 'This phone has been turned off', message: 'Ask the coordinator, or set this phone up again.' }
  }
  if (/profile has been turned off/i.test(message)) {
    return { kind: 'inactive', title: 'Your profile is turned off', message: 'Ask the coordinator to turn it back on.' }
  }
  if (/isn't set up with inout/i.test(message)) {
    return { kind: 'not_enrolled', title: "This phone isn't set up", message: 'Set it up again — it takes about 30 seconds.' }
  }
  if (/already checked in/i.test(message)) {
    return { kind: 'already_in', title: "You're already checked in", message: 'Nothing new was recorded.' }
  }
  if (/not checked in/i.test(message)) {
    return { kind: 'not_in', title: "You're not checked in", message: 'Nothing new was recorded.' }
  }
  if (/nothing to undo/i.test(message)) {
    return { kind: 'nothing_to_undo', title: 'Nothing to undo', message: 'Your last action can no longer be undone.' }
  }
  if (/expired or was already used|request has expired/i.test(message)) {
    return { kind: 'expired_request', title: 'That took too long', message: 'Nothing was recorded. Please try again.' }
  }
  if (/too many/i.test(message)) {
    return { kind: 'rate_limited', title: 'Lots of check-ins right now', message: 'Please wait a minute and try again.' }
  }
  return {
    kind: 'other',
    title: 'Something went wrong',
    message: message && message.length < 200 ? message : 'Nothing was recorded. Please try again.',
  }
}

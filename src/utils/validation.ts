/**
 * Runtime validators for server-function inputs. TanStack Start passes whatever the client sent
 * to `.validator()`, so every input is checked for shape, type and size here. Validators throw
 * generic messages and never echo submitted values (some inputs carry coordinates).
 */
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { validateLocationReading, type LocationReading } from './location'

type Obj = Record<string, unknown>

export function asObject(data: unknown): Obj {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid request')
  return data as Obj
}

type StringOpts = { min?: number; max: number; pattern?: RegExp; message?: string; trim?: boolean }

export function reqString(o: Obj, key: string, opts: StringOpts): string {
  const value = o[key]
  const message = opts.message ?? `Invalid ${key}`
  if (typeof value !== 'string' || value.length > opts.max) throw new Error(message)
  const result = opts.trim ? value.trim() : value
  if (result.length < (opts.min ?? 1)) throw new Error(message)
  if (opts.pattern && !opts.pattern.test(result)) throw new Error(message)
  return result
}

export function optString(o: Obj, key: string, opts: StringOpts): string | undefined {
  if (o[key] === undefined || o[key] === null) return undefined
  return reqString(o, key, { min: 0, ...opts })
}

export function reqInt(o: Obj, key: string, min = 1, max = Number.MAX_SAFE_INTEGER, message?: string): number {
  const value = o[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message ?? `Invalid ${key}`)
  }
  return value
}

export function optInt(o: Obj, key: string, min = 1, max = Number.MAX_SAFE_INTEGER, message?: string): number | undefined {
  if (o[key] === undefined || o[key] === null) return undefined
  return reqInt(o, key, min, max, message)
}

export function reqBoolean(o: Obj, key: string): boolean {
  if (typeof o[key] !== 'boolean') throw new Error(`Invalid ${key}`)
  return o[key] as boolean
}

export function reqNumber(o: Obj, key: string, min: number, max: number, message?: string): number {
  const value = o[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(message ?? `Invalid ${key}`)
  }
  return value
}

const QR_TOKEN = /^[A-Z2-7]{12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function qrToken(o: Obj): string {
  return reqString(o, 'token', { max: 12, pattern: QR_TOKEN, message: 'Invalid or expired QR code' })
}

export function adminToken(o: Obj): string {
  return reqString(o, 'authToken', { max: 1024, message: 'Unauthorized: invalid or expired admin credentials' })
}

export function isoDate(o: Obj, key: string): string {
  const value = reqString(o, key, { max: 10, pattern: DATE, message: 'Invalid date' })
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('Invalid date')
  return value
}

/** ISO-8601 timestamp (as produced by Date#toISOString or datetime-local conversions). */
function isoDateTime(o: Obj, key: string): string {
  const value = reqString(o, key, { max: 40, pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/, message: 'Invalid time' })
  if (Number.isNaN(Date.parse(value))) throw new Error('Invalid time')
  return value
}

const SHIFT_TIME = /^(\d{1,2}:\d{2}(:\d{2})?)?$/

function optLocation(o: Obj): LocationReading | undefined {
  if (o.location === undefined || o.location === null) return undefined
  return validateLocationReading(o.location)
}

// ─── Staff-facing (QR-gated) ─────────────────────────────────────────────

export function validateEntryAction(data: unknown) {
  const o = asObject(data)
  return { rosterEntryId: reqInt(o, 'rosterEntryId', 1, undefined, 'Staff not found'), token: qrToken(o), location: optLocation(o) }
}

export function validateEntryWithToken(data: unknown) {
  const o = asObject(data)
  return { rosterEntryId: reqInt(o, 'rosterEntryId', 1, undefined, 'Staff not found'), token: qrToken(o) }
}

export function validateEntryId(data: unknown) {
  const o = asObject(data)
  return { rosterEntryId: reqInt(o, 'rosterEntryId', 1, undefined, 'Staff not found') }
}

export function validateQrDate(data: unknown) {
  return { date: isoDate(asObject(data), 'date') }
}

export function validateStaffName(o: Obj) {
  const name = reqString(o, 'name', { max: 200, trim: true, message: 'Enter a name of up to 200 characters' })
  const role = optString(o, 'role', { max: 100, trim: true, message: 'Enter a role of up to 100 characters' })
  return { name, role: role || undefined }
}

// ─── WebAuthn responses ──────────────────────────────────────────────────

/** Whole-response ceiling. Real platform responses are 1–3 KB; attestation 'none' keeps them small. */
export const MAX_WEBAUTHN_RESPONSE_BYTES = 16_384
const B64URL = /^[A-Za-z0-9_-]+$/
const TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])

function b64(o: Obj, key: string, max: number): string {
  return reqString(o, key, { max, pattern: B64URL, message: 'Invalid passkey response' })
}

function optB64(o: Obj, key: string, max: number): string | undefined {
  if (o[key] === undefined || o[key] === null) return undefined
  return b64(o, key, max)
}

function asResponseObject(data: unknown): Obj {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid passkey response')
  return data as Obj
}

function responseEnvelope(data: unknown) {
  const o = asResponseObject(data)
  let size: number
  try {
    size = JSON.stringify(o).length
  } catch {
    throw new Error('Invalid passkey response')
  }
  if (size > MAX_WEBAUTHN_RESPONSE_BYTES) throw new Error('Invalid passkey response')
  const id = b64(o, 'id', 1366)
  const rawId = b64(o, 'rawId', 1366)
  if (id !== rawId || o.type !== 'public-key') throw new Error('Invalid passkey response')
  const attachment = o.authenticatorAttachment
  if (attachment !== undefined && attachment !== null && attachment !== 'platform' && attachment !== 'cross-platform') {
    throw new Error('Invalid passkey response')
  }
  const ext = o.clientExtensionResults ?? {}
  if (typeof ext !== 'object' || ext === null || Array.isArray(ext)) throw new Error('Invalid passkey response')
  const inner = asResponseObject(o.response)
  return {
    inner, id, rawId,
    authenticatorAttachment: (attachment ?? undefined) as 'platform' | 'cross-platform' | undefined,
    clientExtensionResults: ext as RegistrationResponseJSON['clientExtensionResults'],
  }
}

export function validateRegistrationResponse(data: unknown): RegistrationResponseJSON {
  const { inner, id, rawId, authenticatorAttachment, clientExtensionResults } = responseEnvelope(data)
  let transports: string[] | undefined
  if (inner.transports !== undefined && inner.transports !== null) {
    if (!Array.isArray(inner.transports) || inner.transports.length > 10) throw new Error('Invalid passkey response')
    transports = inner.transports.filter((t): t is string => typeof t === 'string' && TRANSPORTS.has(t))
  }
  const publicKeyAlgorithm = inner.publicKeyAlgorithm
  if (publicKeyAlgorithm !== undefined && (typeof publicKeyAlgorithm !== 'number' || !Number.isSafeInteger(publicKeyAlgorithm))) {
    throw new Error('Invalid passkey response')
  }
  return {
    id,
    rawId,
    type: 'public-key',
    authenticatorAttachment,
    clientExtensionResults,
    response: {
      clientDataJSON: b64(inner, 'clientDataJSON', 4096),
      attestationObject: b64(inner, 'attestationObject', 12_000),
      authenticatorData: optB64(inner, 'authenticatorData', 8192),
      publicKey: optB64(inner, 'publicKey', 4096),
      publicKeyAlgorithm: publicKeyAlgorithm as number | undefined,
      transports: transports as RegistrationResponseJSON['response']['transports'],
    },
  }
}

export function validateAuthenticationResponse(data: unknown): AuthenticationResponseJSON {
  const { inner, id, rawId, authenticatorAttachment, clientExtensionResults } = responseEnvelope(data)
  return {
    id,
    rawId,
    type: 'public-key',
    authenticatorAttachment,
    clientExtensionResults,
    response: {
      clientDataJSON: b64(inner, 'clientDataJSON', 4096),
      authenticatorData: b64(inner, 'authenticatorData', 4096),
      signature: b64(inner, 'signature', 2048),
      userHandle: optB64(inner, 'userHandle', 1024),
    },
  }
}

// ─── Passkey server functions ────────────────────────────────────────────

export type BeginEnrolmentInput =
  | { token: string; rosterEntryId: number }
  | { token: string; name: string; role?: string }

export function validateBeginEnrolment(data: unknown): BeginEnrolmentInput {
  const o = asObject(data)
  const token = qrToken(o)
  if (o.rosterEntryId !== undefined && o.rosterEntryId !== null) {
    return { token, rosterEntryId: reqInt(o, 'rosterEntryId', 1, undefined, 'Staff not found') }
  }
  return { token, ...validateStaffName(o) }
}

export function validateFinishEnrolment(data: unknown) {
  const o = asObject(data)
  const token = qrToken(o)
  const response = validateRegistrationResponse(o.response)
  let checkIn: { location?: LocationReading } | undefined
  if (o.checkIn !== undefined && o.checkIn !== null) {
    checkIn = { location: optLocation(asObject(o.checkIn)) }
  }
  return { token, response, checkIn }
}

export function validateBeginPasskeyAuth(data: unknown) {
  return { token: qrToken(asObject(data)) }
}

export const PASSKEY_ACTIONS = ['identify', 'check_in', 'check_out', 'undo'] as const
export type PasskeyActionKind = (typeof PASSKEY_ACTIONS)[number]

export function validatePasskeyAction(data: unknown) {
  const o = asObject(data)
  const token = qrToken(o)
  if (!(PASSKEY_ACTIONS as readonly unknown[]).includes(o.action)) throw new Error('Invalid action')
  return {
    token,
    action: o.action as PasskeyActionKind,
    response: validateAuthenticationResponse(o.response),
    location: optLocation(o),
  }
}

export function validatePreviewLocation(data: unknown) {
  const o = asObject(data)
  return { token: qrToken(o), location: validateLocationReading(o.location) }
}

export function validateCheckInArea(data: unknown) {
  return { token: qrToken(asObject(data)) }
}

export function validateStaffStatus(data: unknown) {
  const o = asObject(data)
  return { token: qrToken(o), staffToken: reqString(o, 'staffToken', { max: 2048, message: 'Invalid staff token' }) }
}

// ─── Admin ───────────────────────────────────────────────────────────────

export function validateAdminAuth(data: unknown) {
  return { authToken: adminToken(asObject(data)) }
}

export function validatePin(data: unknown) {
  return { pin: reqString(asObject(data), 'pin', { max: 200, message: 'Invalid admin PIN' }) }
}

export function validateAdminDate(data: unknown) {
  const o = asObject(data)
  return { date: isoDate(o, 'date'), authToken: adminToken(o) }
}

export function validateAdminUpdateSession(data: unknown) {
  const o = asObject(data)
  const authToken = adminToken(o)
  const sessionId = optInt(o, 'sessionId')
  const rosterEntryId = optInt(o, 'rosterEntryId')
  const checkInAt = o.checkInAt === undefined || o.checkInAt === null ? undefined : isoDateTime(o, 'checkInAt')
  // An empty checkout reopens the session.
  const checkOutAt = o.checkOutAt === undefined || o.checkOutAt === null
    ? undefined
    : o.checkOutAt === '' ? '' : isoDateTime(o, 'checkOutAt')
  if (!sessionId && !rosterEntryId) throw new Error('Invalid update request')
  return { authToken, sessionId, rosterEntryId, checkInAt, checkOutAt }
}

export function validateAdminSessionId(data: unknown) {
  const o = asObject(data)
  return { sessionId: reqInt(o, 'sessionId'), authToken: adminToken(o) }
}

export function validateAdminEntryId(data: unknown) {
  const o = asObject(data)
  return { entryId: reqInt(o, 'entryId'), authToken: adminToken(o) }
}

export function validateExportRange(data: unknown) {
  const o = asObject(data)
  return { startDate: isoDate(o, 'startDate'), endDate: isoDate(o, 'endDate'), authToken: adminToken(o) }
}

export function validateWeekRange(data: unknown) {
  const o = asObject(data)
  return { weekStart: isoDate(o, 'weekStart'), weekEnd: isoDate(o, 'weekEnd'), authToken: adminToken(o) }
}

export function validatePrune(data: unknown) {
  const o = asObject(data)
  return { retentionDays: optInt(o, 'retentionDays', 1, 3650), authToken: adminToken(o) }
}

const HEADER = { max: 100, trim: true }

export function validateUploadRota(data: unknown) {
  const o = asObject(data)
  return {
    authToken: adminToken(o),
    date: isoDate(o, 'date'),
    // ~7.5 MB file once decoded; rota spreadsheets are far smaller.
    fileBase64: reqString(o, 'fileBase64', { max: 10_000_000, pattern: /^[A-Za-z0-9+/=\r\n]+$/, message: 'Invalid file' }),
    fileName: reqString(o, 'fileName', { max: 255, message: 'Invalid file name' }),
    nameHeader: optString(o, 'nameHeader', HEADER) || undefined,
    roleHeader: optString(o, 'roleHeader', HEADER) || undefined,
    shiftHeader: optString(o, 'shiftHeader', HEADER) || undefined,
  }
}

function shiftTime(o: Obj, key: string): string | undefined {
  return optString(o, key, { max: 8, pattern: SHIFT_TIME, message: 'Invalid shift time' })
}

export function validateAddAdHocStaff(data: unknown) {
  const o = asObject(data)
  return {
    authToken: adminToken(o),
    ...validateStaffName(o),
    shiftStart: shiftTime(o, 'shiftStart'),
    shiftEnd: shiftTime(o, 'shiftEnd'),
  }
}

export function validateUpdateRosterEntry(data: unknown) {
  const o = asObject(data)
  return {
    authToken: adminToken(o),
    entryId: reqInt(o, 'entryId'),
    name: optString(o, 'name', { min: 1, max: 200, trim: true, message: 'Enter a name of up to 200 characters' }),
    role: optString(o, 'role', { max: 100, trim: true, message: 'Enter a role of up to 100 characters' }),
    shiftStart: shiftTime(o, 'shiftStart'),
    shiftEnd: shiftTime(o, 'shiftEnd'),
  }
}

export function validateListEnrolments(data: unknown) {
  const o = asObject(data)
  const status = o.status ?? 'pending'
  if (status !== 'pending' && status !== 'all') throw new Error('Invalid status')
  return { authToken: adminToken(o), status: status as 'pending' | 'all' }
}

export function validateSetCredentialStatus(data: unknown) {
  const o = asObject(data)
  const status = o.status
  if (status !== 'approved' && status !== 'rejected' && status !== 'revoked') throw new Error('Invalid status')
  return {
    authToken: adminToken(o),
    credentialId: reqString(o, 'credentialId', { max: 1366, pattern: B64URL, message: 'Passkey not found' }),
    status: status as 'approved' | 'rejected' | 'revoked',
  }
}

export function validateSetStaffActive(data: unknown) {
  const o = asObject(data)
  return { authToken: adminToken(o), staffId: reqInt(o, 'staffId'), active: reqBoolean(o, 'active') }
}

export function validateLinkRosterEntry(data: unknown) {
  const o = asObject(data)
  const staffId = o.staffId === null ? null : reqInt(o, 'staffId')
  return { authToken: adminToken(o), entryId: reqInt(o, 'entryId'), staffId }
}

export function validateSetSiteSettings(data: unknown) {
  const o = asObject(data)
  return {
    authToken: adminToken(o),
    latitude: reqNumber(o, 'latitude', -90, 90, 'Invalid latitude'),
    longitude: reqNumber(o, 'longitude', -180, 180, 'Invalid longitude'),
    radiusM: reqInt(o, 'radiusM', 25, 2000, 'Radius must be between 25 and 2000 metres'),
    accuracyCeilingM: reqInt(o, 'accuracyCeilingM', 10, 500, 'Accuracy limit must be between 10 and 500 metres'),
  }
}

export function validateReviewSession(data: unknown) {
  const o = asObject(data)
  return {
    authToken: adminToken(o),
    sessionId: reqInt(o, 'sessionId'),
    note: reqString(o, 'note', { max: 500, trim: true, message: 'Enter a note of up to 500 characters' }),
  }
}

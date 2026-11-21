/**
 * Web Push (RFC 8030) from the Worker: VAPID (RFC 8292) and aes128gcm payload encryption
 * (RFC 8291) via @block65/webcrypto-web-push, which uses WebCrypto only. Server-side only;
 * imported from server-function handlers and the scheduled handler.
 *
 * Endpoints are accepted only at known browser push services (SSRF guard), are never logged or
 * audited (they are capability URLs), and redirects are never followed.
 */
import { encryptNotification, vapidHeaders } from '@block65/webcrypto-web-push'

export const DEFAULT_VAPID_SUBJECT = 'https://inout.fzn.workers.dev'

type PushEnv = {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  WEBAUTHN_ORIGIN?: string
}

export type PushConfig =
  | {
      enabled: true
      publicKey: string
      privateKey: string
      subject: string
      /** Staff-facing origin for absolute notification links (from WEBAUTHN_ORIGIN), if configured. */
      appOrigin: string | null
    }
  | { enabled: false; publicKey: null }

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/

/** Decoded length of an unpadded base64url string, or null when it isn't base64url. */
export function base64UrlBytes(value: string): Uint8Array | null {
  if (!B64URL.test(value) || value.length % 4 === 1) return null
  try {
    const b64 = value.replaceAll('-', '+').replaceAll('_', '/')
    return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** Uncompressed P-256 point (65 bytes, 0x04 prefix), as used by VAPID public keys and p256dh. */
export function isP256PublicKey(value: string): boolean {
  const bytes = base64UrlBytes(value)
  return !!bytes && bytes.length === 65 && bytes[0] === 0x04
}

/** Pure: config from env values. Missing or malformed keys disable the feature. */
export function resolvePushConfig(env: PushEnv): PushConfig {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey || !isP256PublicKey(publicKey) || base64UrlBytes(privateKey)?.length !== 32) {
    return { enabled: false, publicKey: null }
  }
  const subject = env.VAPID_SUBJECT?.trim()
  return {
    enabled: true,
    publicKey,
    privateKey,
    // Apple rejects a JWT whose subject is not a mailto: or https: URL.
    subject: subject && /^(mailto:|https:\/\/)\S+$/.test(subject) ? subject : DEFAULT_VAPID_SUBJECT,
    appOrigin: httpsOrigin(env.WEBAUTHN_ORIGIN),
  }
}

/** Read per call: Workers inject env at request/event time. */
export async function getPushConfig(): Promise<PushConfig> {
  const { env } = await import('cloudflare:workers')
  return resolvePushConfig(env as PushEnv)
}

// ─── Endpoints ───────────────────────────────────────────────────────────

const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com']
export const MAX_ENDPOINT_LENGTH = 2048

/** Chrome/Android/Samsung (FCM), Safari/iOS (APNs), Firefox (Mozilla autopush), Edge (WNS). */
export function isKnownPushEndpoint(raw: string): boolean {
  if (raw.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname.length < 2) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}

// ─── Sending ─────────────────────────────────────────────────────────────

export type PushTarget = { endpoint: string; p256dh: string; auth: string }
export type PushOptions = {
  /** Seconds the push service may hold the message for an offline device. */
  ttl: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  /** Coalescing key: at most 32 base64url characters. */
  topic?: string
}
/** `gone`: the push service says the subscription no longer exists (404/410) or it is unusable. */
export type PushOutcome = { outcome: 'sent' | 'gone' | 'failed'; status: number | null }
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>

// VAPID JWTs are valid for 12 h (library default). Apple asks for no more than one refresh an
// hour, so each push-service origin reuses its Authorization header for up to an hour.
const JWT_REUSE_MS = 60 * 60 * 1000
const authCache = new Map<string, { header: string; at: number }>()

async function authorizationFor(endpoint: string, config: Extract<PushConfig, { enabled: true }>): Promise<string> {
  const key = `${new URL(endpoint).origin}|${config.publicKey}|${config.subject}`
  const cached = authCache.get(key)
  if (cached && Date.now() - cached.at < JWT_REUSE_MS) return cached.header
  const { headers } = await vapidHeaders(
    { endpoint, expirationTime: null, keys: { p256dh: '', auth: '' } },
    { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
  )
  if (authCache.size > 32) authCache.clear()
  authCache.set(key, { header: headers.authorization, at: Date.now() })
  return headers.authorization
}

export const PUSH_TIMEOUT_MS = 10_000

/** Encrypt and POST one message. Never throws; the caller decides what to do with the outcome. */
export async function sendPush(
  target: PushTarget,
  message: unknown,
  options: PushOptions,
  config: Extract<PushConfig, { enabled: true }>,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<PushOutcome> {
  if (!isKnownPushEndpoint(target.endpoint)) return { outcome: 'gone', status: null }
  let body: Uint8Array<ArrayBuffer>
  let authorization: string
  try {
    body = new Uint8Array(await encryptNotification(
      { endpoint: target.endpoint, expirationTime: null, keys: { p256dh: target.p256dh, auth: target.auth } },
      new TextEncoder().encode(JSON.stringify(message)),
    ))
    authorization = await authorizationFor(target.endpoint, config)
  } catch {
    // Malformed subscription keys can never succeed.
    return { outcome: 'gone', status: null }
  }
  const headers: Record<string, string> = {
    authorization,
    ttl: String(Math.max(0, Math.floor(options.ttl))),
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
  }
  if (options.urgency) headers.urgency = options.urgency
  if (options.topic && /^[A-Za-z0-9_-]{1,32}$/.test(options.topic)) headers.topic = options.topic
  try {
    const res = await fetcher(target.endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    })
    await res.body?.cancel().catch(() => {})
    if (res.status >= 200 && res.status < 300) return { outcome: 'sent', status: res.status }
    if (res.status === 404 || res.status === 410) return { outcome: 'gone', status: res.status }
    return { outcome: 'failed', status: res.status }
  } catch {
    return { outcome: 'failed', status: null }
  }
}

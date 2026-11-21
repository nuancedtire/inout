/**
 * Test-side browser push client, written independently of the sending library: a P-256 ECDH key
 * pair and auth secret like PushManager.subscribe() returns, RFC 8291 aes128gcm decryption, and
 * RFC 8292 VAPID JWT verification. Lets Workers tests prove what a real push service would get.
 */
const enc = new TextEncoder()

export function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

export type TestSubscription = { endpoint: string; expirationTime: null; keys: { p256dh: string; auth: string } }

export async function createPushClient(endpoint: string) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const subscription: TestSubscription = { endpoint, expirationTime: null, keys: { p256dh: b64url(uaPublic), auth: b64url(auth) } }

  /** RFC 8291 §3.4 / RFC 8188: decrypt one aes128gcm record and strip its padding. */
  async function decrypt(body: Uint8Array<ArrayBuffer>): Promise<string> {
    const salt = body.slice(0, 16)
    const idLength = body[20]
    const asPublic = body.slice(21, 21 + idLength)
    const ciphertext = body.slice(21 + idLength)
    const serverKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, keys.privateKey, 256))
    const prkKey = await hmac(auth, shared)
    const ikm = (await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32)
    const prk = await hmac(salt, ikm)
    const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
    const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
    const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
    let end = padded.length - 1
    while (end >= 0 && padded[end] === 0) end--
    if (padded[end] !== 2) throw new Error('Missing final-record delimiter')
    return new TextDecoder().decode(padded.slice(0, end))
  }

  return { subscription, decrypt }
}

/** Parse and verify `Authorization: vapid t=<jwt>, k=<public key>` (RFC 8292 §3). */
export async function verifyVapid(authorization: string, expectedPublicKey: string) {
  const match = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(authorization)
  if (!match) throw new Error(`Unexpected Authorization header: ${authorization}`)
  const [, jwt, k] = match
  const [header, payload, signature] = jwt.split('.')
  const key = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(signature), enc.encode(`${header}.${payload}`))
  return {
    valid,
    keyMatches: k === expectedPublicKey,
    header: JSON.parse(new TextDecoder().decode(fromB64url(header))) as { alg: string; typ: string },
    claims: JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { aud: string; exp: number; sub: string },
  }
}

export type RecordedPush = { url: string; headers: Record<string, string>; body: Uint8Array<ArrayBuffer>; redirect?: RequestRedirect }

/** A fetch stand-in for push services: records requests and answers with a status per endpoint. */
export function mockPushService(statusFor: (url: string) => number = () => 201) {
  const calls: RecordedPush[] = []
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      body: new Uint8Array(init.body as Uint8Array<ArrayBuffer>),
      redirect: init.redirect,
    })
    return new Response(null, { status: statusFor(url) })
  }
  return { calls, fetcher }
}

// ponytail: lazy dynamic import mirrors db/client.ts pattern.
// Static import of cloudflare:workers leaks into client bundle;
// dynamic import() inside async functions is tree-shaken on client.
type AuthEnv = { ADMIN_PIN?: string; QR_SEED?: string }

let _env: AuthEnv | undefined
let _envPromise: Promise<AuthEnv> | undefined

async function getEnv(): Promise<AuthEnv> {
  if (_env) return _env
  if (!_envPromise) {
    _envPromise = (async () => {
      const mod = await import('cloudflare:workers')
      _env = mod.env
      return _env
    })()
  }
  return _envPromise
}

async function getAdminPin(): Promise<string> {
  const e = await getEnv()
  return e.ADMIN_PIN || 'Wh!ppscross'
}

async function getQrSeed(): Promise<string> {
  const e = await getEnv()
  return e.QR_SEED || 'default-qr-seed-change-me'
}
// ═══════════════════════════════════════════════════════════════
// PIN verification
// ═══════════════════════════════════════════════════════════════

export async function verifyAdminPin(pin: string): Promise<boolean> {
  return pin === (await getAdminPin())
}


const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
// ═══════════════════════════════════════════════════════════════
// QR token derivation (deterministic per-date)
// ═══════════════════════════════════════════════════════════════

export async function deriveTokenForDate(date: string): Promise<string> {
  const msg = new TextEncoder().encode(`${await getQrSeed()}:${date}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msg)
  const hash = Array.from(new Uint8Array(hashBuffer))
  // Take first 8 bytes → 12 base32 chars, stable per-date
  const b32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let token = ''
  for (let i = 0; i < 8; i++) {
    token += b32[(hash[i] >> 3) & 31]
    token += b32[((hash[i] << 2) | (hash[i + 1] >> 6)) & 31]
    if (i === 7) token += b32[(hash[i] >> 1) & 31]
  }
  return token.substring(0, 12)
}

// ═══════════════════════════════════════════════════════════════
// Session tokens (HMAC-signed, stateless — no DB lookup)
// ═══════════════════════════════════════════════════════════════

export async function createSessionToken(): Promise<string> {
  const key = await deriveSigningKey()
  const expiry = Date.now() + SESSION_TTL_MS
  const random = crypto.randomUUID()
  const payload = `${expiry}:${random}`
  const sig = await hmacSign(key, payload)
  const payloadB64 = b64url(payload)
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)))
  return `${payloadB64}.${sigB64}`
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = token.split('.')
    if (!payloadB64 || !sigB64) return false

    const payload = fromB64url(payloadB64)
    const [expiryStr] = payload.split(':')
    const expiry = Number(expiryStr)
    if (isNaN(expiry) || Date.now() > expiry) return false

    const key = await deriveSigningKey()
    const sig = await hmacSign(key, payload)
    const sigStr = String.fromCharCode(...new Uint8Array(sig))
    return timingSafeEqual(
      new TextEncoder().encode(sigB64),
      new TextEncoder().encode(b64url(sigStr)),
    )
  } catch {
    return false
  }
}

export async function requireAdmin(
  auth: { pin?: string; token?: string },
): Promise<void> {
  if (auth.token && (await verifySessionToken(auth.token))) return
  if (auth.pin && (await verifyAdminPin(auth.pin))) return
  throw new Error('Unauthorized: invalid or expired admin credentials')
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

async function deriveSigningKey(): Promise<CryptoKey> {
  const seed = await getQrSeed()
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(seed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function hmacSign(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
}

function b64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(b64: string): string {
  return atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]
  return result === 0
}

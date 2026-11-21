#!/usr/bin/env node
// Generate a VAPID key pair (P-256, RFC 8292) for shift-end reminders, using WebCrypto only.
// Usage: node scripts/generate-vapid-keys.mjs
// Prints .dev.vars lines. For production, store each value with `pnpm exec wrangler secret put`.
// Changing the keys invalidates every existing push subscription (phones must subscribe again).
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
const { d } = await crypto.subtle.exportKey('jwk', privateKey)
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
console.log('VAPID_SUBJECT=mailto:you@example.org')

/**
 * Minimal software WebAuthn authenticator for Workers tests: ES256 keys from WebCrypto,
 * attestation 'none' registration responses, and DER-encoded assertion signatures.
 * Overrides let tests produce wrong-origin, wrong-RP, missing-UV and regressed-counter responses.
 */
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'

const enc = new TextEncoder()
const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_BS = 0x10
const FLAG_AT = 0x40

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

function u32(n: number) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function derInteger(bytes: Uint8Array) {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  let v = bytes.slice(i)
  if (v[0] & 0x80) v = concat(new Uint8Array([0]), v)
  return concat(new Uint8Array([0x02, v.length]), v)
}

/** WebCrypto returns raw r||s; WebAuthn ES256 signatures are ASN.1 DER. */
function rawToDer(raw: Uint8Array) {
  const body = concat(derInteger(raw.slice(0, 32)), derInteger(raw.slice(32)))
  return concat(new Uint8Array([0x30, body.length]), body)
}

export type Overrides = {
  origin?: string
  rpId?: string
  type?: string
  userVerified?: boolean
  counter?: number
  challenge?: string
  userHandle?: string | null
}

export class SoftAuthenticator {
  counter = 0
  userHandle: string | null = null
  private constructor(
    readonly credentialId: string,
    private readonly keys: CryptoKeyPair,
    readonly rpId: string,
    readonly origin: string,
    readonly aaguid: Uint8Array,
  ) {}

  static async create(rpId: string, origin: string, aaguid = new Uint8Array(16)) {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const id = isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)))
    return new SoftAuthenticator(id, keys, rpId, origin, aaguid)
  }

  private clientData(type: string, challenge: string, o: Overrides) {
    return enc.encode(JSON.stringify({ type: o.type ?? type, challenge: o.challenge ?? challenge, origin: o.origin ?? this.origin, crossOrigin: false }))
  }

  private async flagsAndHash(o: Overrides, extra: number) {
    const rpIdHash = await sha256(enc.encode(o.rpId ?? this.rpId))
    const flags = FLAG_UP | (o.userVerified === false ? 0 : FLAG_UV) | FLAG_BE | FLAG_BS | extra
    return { rpIdHash, flags }
  }

  async register(options: { challenge: string; user: { id: string } }, o: Overrides = {}): Promise<RegistrationResponseJSON> {
    const jwk = await crypto.subtle.exportKey('jwk', this.keys.publicKey)
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
      [1, 2], [3, -7], [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x!)],
      [-3, isoBase64URL.toBuffer(jwk.y!)],
    ]))
    const credId = isoBase64URL.toBuffer(this.credentialId)
    const { rpIdHash, flags } = await this.flagsAndHash(o, FLAG_AT)
    const authData = concat(rpIdHash, new Uint8Array([flags]), u32(o.counter ?? 0), this.aaguid,
      new Uint8Array([credId.length >> 8, credId.length & 255]), credId, cose)
    const attestationObject = isoCBOR.encode(new Map<string, string | Uint8Array | Map<string, never>>([
      ['fmt', 'none'], ['attStmt', new Map<string, never>()], ['authData', authData],
    ]))
    this.userHandle = options.user.id
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(this.clientData('webauthn.create', options.challenge, o)),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ['internal', 'hybrid'],
      },
    }
  }

  async assert(options: { challenge: string }, o: Overrides = {}): Promise<AuthenticationResponseJSON> {
    if (o.counter === undefined) this.counter++
    const { rpIdHash, flags } = await this.flagsAndHash(o, 0)
    const authData = concat(rpIdHash, new Uint8Array([flags]), u32(o.counter ?? this.counter))
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, o)
    const signed = concat(authData, await sha256(clientDataJSON))
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, signed))
    const userHandle = o.userHandle === undefined ? this.userHandle : o.userHandle
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        authenticatorData: isoBase64URL.fromBuffer(authData),
        signature: isoBase64URL.fromBuffer(rawToDer(raw)),
        ...(userHandle ? { userHandle } : {}),
      },
    }
  }
}

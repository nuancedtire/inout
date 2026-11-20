declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database
    QR_SEED?: string
    ADMIN_PIN?: string
    /** WebAuthn relying party ID (hostname). Derived from the request URL when unset. */
    WEBAUTHN_RP_ID?: string
    /** Expected WebAuthn origin, e.g. https://inout.example.nhs.uk. Derived from the request URL when unset. */
    WEBAUTHN_ORIGIN?: string
    /** Relying party display name shown by passkey providers. Defaults to "InOut". */
    WEBAUTHN_RP_NAME?: string
  }
}

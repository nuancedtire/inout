/**
 * WebAuthn relying-party configuration. Passkeys are bound to the RP ID (a hostname) for good:
 * changing the production hostname forces every staff member to re-enrol.
 *
 * Explicit configuration (`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME`) wins. When it
 * is absent the values are derived from the request URL, which makes localhost, preview URLs
 * and a custom domain work without extra settings. Pure: callers pass env values and the URL.
 */
export type RelyingParty = { rpID: string; origin: string; rpName: string }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

export class RelyingPartyConfigError extends Error {}

export function resolveRelyingParty(config: {
  rpId?: string | null
  origin?: string | null
  rpName?: string | null
  requestUrl?: string | null
}): RelyingParty {
  const fail = (reason: string): never => {
    throw new RelyingPartyConfigError(`Passkeys are not available at this address (${reason}).`)
  }
  const rawOrigin = config.origin?.trim() || config.requestUrl
  if (!rawOrigin) fail('no origin')
  let url: URL
  try {
    url = new URL(rawOrigin!)
  } catch {
    return fail('invalid origin')
  }
  if (config.origin?.trim() && url.origin !== config.origin.trim().replace(/\/$/, '')) fail('origin must not include a path')
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) fail('HTTPS is required')
  const rpID = (config.rpId?.trim() || url.hostname).toLowerCase()
  if (rpID !== 'localhost' && rpID !== '127.0.0.1' && !HOSTNAME.test(rpID)) fail('invalid relying party ID')
  if (url.hostname !== rpID && !url.hostname.endsWith(`.${rpID}`)) fail('origin is outside the relying party ID')
  return { rpID, origin: url.origin, rpName: config.rpName?.trim() || 'InOut' }
}

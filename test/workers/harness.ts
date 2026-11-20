/**
 * Shared Workers-test harness. Test files mock '@tanstack/react-start' and
 * '@tanstack/react-start/server' with `startMock` / `startServerMock`, so application validators
 * and handlers run for real against D1; only the RPC transport and request context are replaced.
 */
import { getDb } from '#/db/client'
import { rotas } from '#/db/schema'
import { createSessionToken } from '#/utils/auth'
import { todayDate } from '#/utils/dateTime'
import type { LocationReading } from '#/utils/location'
import { SoftAuthenticator, type Overrides } from './softAuthenticator'

export const TOKEN = 'ABCDEFGHIJKL'
export const RP_ID = 'inout.test'
export const ORIGIN = `https://${RP_ID}`
export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

export const request = { url: `${ORIGIN}/_serverFn/test`, ip: '198.51.100.1', userAgent: IPHONE_UA }
let ipCounter = 0
/** Each test gets its own client address so per-IP limits do not leak between tests. */
export function freshIp() {
  ipCounter++
  request.ip = `198.51.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`
  request.url = `${ORIGIN}/_serverFn/test`
}

type Handler = (args: { data: unknown }) => unknown
function serverFnBuilder(validate: (data: unknown) => unknown) {
  return { handler: (handler: Handler) => async (args?: { data?: unknown }) => handler({ data: validate(args?.data) }) }
}

export const startMock = {
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => serverFnBuilder(validate),
    handler: (handler: Handler) => serverFnBuilder((d) => d).handler(handler),
  }),
}

export const startServerMock = {
  getRequest: () => new Request(request.url, { headers: { 'User-Agent': request.userAgent } }),
  getRequestHeader: (name: string) => {
    const key = name.toLowerCase()
    if (key === 'cf-connecting-ip') return request.ip
    if (key === 'user-agent') return request.userAgent
    return undefined
  },
}

export async function seedTodayRota() {
  const db = await getDb()
  const [rota] = await db.insert(rotas).values({ date: todayDate(), token: TOKEN }).returning()
  return { db, rota }
}

export const adminToken = () => createSessionToken()

/** Lazily import server functions after the mocks are in place. */
export async function passkeyFns() {
  return import('#/utils/passkeys.functions')
}

export async function enrol(
  target: { rosterEntryId: number } | { name: string; role?: string },
  opts: { checkIn?: { location?: LocationReading }; authenticator?: SoftAuthenticator; overrides?: Overrides } = {},
) {
  const { beginEnrolment, finishEnrolment } = await passkeyFns()
  const authenticator = opts.authenticator ?? await SoftAuthenticator.create(RP_ID, ORIGIN)
  const begun = await beginEnrolment({ data: { token: TOKEN, ...target } })
  const response = await authenticator.register(begun.optionsJSON, opts.overrides)
  const finished = await finishEnrolment({ data: { token: TOKEN, response, ...(opts.checkIn ? { checkIn: opts.checkIn } : {}) } })
  return { authenticator, begun, finished }
}

export async function act(
  authenticator: SoftAuthenticator,
  action: 'identify' | 'check_in' | 'check_out' | 'undo',
  opts: { location?: LocationReading; overrides?: Overrides } = {},
) {
  const { beginPasskeyAuth, passkeyAction } = await passkeyFns()
  const { optionsJSON } = await beginPasskeyAuth({ data: { token: TOKEN } })
  const response = await authenticator.assert(optionsJSON, opts.overrides)
  return passkeyAction({ data: { token: TOKEN, action, response, ...(opts.location ? { location: opts.location } : {}) } })
}

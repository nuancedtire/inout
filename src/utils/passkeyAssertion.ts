/**
 * Shared server-side checks for a passkey-signed staff request and for the remembered staff
 * device token. Used by passkeyAction / getStaffStatus (passkeys.functions.ts) and by the
 * reminder functions, so the security logic lives in one place. Only imported from
 * server-function handlers.
 */
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type * as schema from '#/db/schema'
import { consumeChallenge, getCredential, parseTransports } from '#/db/passkeys'
import { staff, staffCredentials, type Staff, type StaffCredential } from '#/db/schema'
import { verifyStaffToken } from './auth'
import { INACTIVE_STAFF_MESSAGE } from './staffMessages'
import { logAudit } from './audit'
import type { Identity } from './verification'
import { challengeFromClientData, CounterRegressionError, userHandleFor, verifyAuthentication } from './webauthn'
import type { RelyingParty } from './webauthnConfig'

type Db = DrizzleD1Database<typeof schema>

export type CredentialStatus = 'pending' | 'approved'

export { INACTIVE_STAFF_MESSAGE }

export function assertActive(person: { active: boolean }) {
  if (!person.active) throw new Error(INACTIVE_STAFF_MESSAGE)
}

export type VerifiedAssertion = {
  person: Staff
  credential: StaffCredential & { status: CredentialStatus }
  credentialStatus: CredentialStatus
  /** Identity evidence for a session end signed with this credential. */
  identity: Extract<Identity, 'passkey' | 'passkey_pending'>
  /** Counter/last-used update to run with (or instead of) the attendance write. */
  usage: ReturnType<typeof buildUsageUpdate>
}

function buildUsageUpdate(db: Db, credentialId: string, info: { newCounter: number; credentialBackedUp: boolean }) {
  return db.update(staffCredentials)
    .set({ counter: info.newCounter, lastUsedAt: new Date().toISOString(), backedUp: info.credentialBackedUp })
    .where(eq(staffCredentials.id, credentialId))
}

/**
 * Consume the single-use challenge, then check the credential (known, pending/approved, user
 * handle), the signature with user verification and counter, and that the staff record is
 * active. Call after the rate limit and check-in code. Throws staff-facing messages.
 */
export async function verifyStaffAssertion(db: Db, rp: RelyingParty, response: AuthenticationResponseJSON): Promise<VerifiedAssertion> {
  const challenge = await consumeChallenge(db, challengeFromClientData(response.response.clientDataJSON), 'authenticate')
  if (!challenge) throw new Error('This sign-in request has expired or was already used. Please try again.')

  const credential = await getCredential(db, response.id)
  if (!credential) {
    throw new Error("This phone's passkey isn't set up with InOut. Choose \"Set up this phone\" to enrol again.")
  }
  if (credential.status !== 'pending' && credential.status !== 'approved') {
    throw new Error("This phone's passkey has been turned off. Ask the coordinator, or set up this phone again.")
  }
  const handle = response.response.userHandle
  if (handle && handle !== userHandleFor(credential.staffId)) {
    throw new Error("Your phone's passkey couldn't be checked. Please try again.")
  }

  let info
  try {
    info = await verifyAuthentication(rp, response, challenge.challenge, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: parseTransports(credential.transports),
    })
  } catch (e) {
    if (e instanceof CounterRegressionError) {
      await logAudit('passkey_counter_regression', { staffId: credential.staffId, credentialId: credential.id }, 'system')
    }
    throw e
  }

  const person = await db.select().from(staff).where(eq(staff.id, credential.staffId)).get()
  if (!person) throw new Error('Staff member not found')
  assertActive(person)
  const credentialStatus: CredentialStatus = credential.status
  return {
    person,
    credential: { ...credential, status: credentialStatus },
    credentialStatus,
    identity: credentialStatus === 'approved' ? 'passkey' : 'passkey_pending',
    usage: buildUsageUpdate(db, credential.id, info),
  }
}

/**
 * The staff member a remembered device token names, when its passkey is still pending/approved
 * and the staff record is active; otherwise null. A display hint, never authority for attendance.
 */
export async function resolveStaffToken(db: Db, staffToken: string): Promise<{ person: Staff; credentialStatus: CredentialStatus; credentialId: string } | null> {
  const claims = await verifyStaffToken(staffToken)
  if (!claims) return null
  const credential = await getCredential(db, claims.credentialId)
  if (!credential || credential.staffId !== claims.staffId
    || (credential.status !== 'pending' && credential.status !== 'approved')) {
    return null
  }
  const person = await db.select().from(staff).where(eq(staff.id, claims.staffId)).get()
  if (!person?.active) return null
  return { person, credentialStatus: credential.status, credentialId: credential.id }
}

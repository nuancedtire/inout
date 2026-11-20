# Verified QR check-in: passkey identity and a location check

Status: implementation in progress on branch `feat/verified-check-in` (20 November 2026). The backend is implemented and covered by Workers/D1 tests: stable staff records and rota-import linking, passkey enrolment and approval, passkey-signed check-in/checkout/undo with the name-selection fallback, the location outcome and area settings, evidence in the dashboard, export and weekly rollup, and session acceptance. Staff and admin screens, browser tests with a virtual authenticator, and physical-device tuning are not yet done. Where the implementation contract settled a detail differently (any passkey provider, not only platform authenticators; one shared admin PIN approves enrolments), the implementation follows the contract.

Related: [Secure NFC attendance](secure-nfc-attendance.md) (tracker issue #72). This specification covers the ED pilot that runs before NFC. It shares the stable staff record with that specification and amends two of its decisions; see "Relationship to the secure NFC specification".

> **Amendment, 21 November 2026.** The daily QR was replaced by one permanent, admin-only check-in code (see ADR-009 in CONTEXT.md). Wherever this specification says "daily QR token", read "check-in code". Sessions now also carry over midnight for up to 20 hours.

## Problem Statement

The ED general manager has been offered a pilot of InOut. The current application proves only that someone held today's QR token and chose a name:

- **Who:** staff pick a daily roster entry. Anyone can pick anyone. The browser remembers a daily roster-entry ID in `localStorage`, and no stable staff ID connects entries across days.
- **Where:** the daily QR token is a shared value. A photograph of the poster works from anywhere for the rest of that day.

The pilot has to give the department attendance records it can rely on for locum sign-off and for a staffing view, without hardware, without an app install and without ever stopping a clinician from starting a shift.

## Solution

Keep the daily QR as the way in, and add two independent pieces of evidence to every check-in and checkout:

1. **Passkey identity.** Each staff member links their phone to a stable staff record once. After that, every check-in and checkout is signed by a passkey that the phone releases only after Face ID, fingerprint or the device passcode. An administrator approves each first enrolment.
2. **Location check.** At the moment of check-in or checkout the browser asks for the phone's position once. The server compares it with a configured area around the department and stores only the outcome.

Neither piece ever blocks attendance. Evidence that is missing, unapproved or outside the area is recorded and flagged for the coordinator to review. The dashboard and the CSV export show each session as verified or flagged, with the reason.

Secure NFC tags replace the daily QR as the proof of presence in the later phase described in the secure NFC specification. The passkey and stable staff record built here carry over unchanged.

## User Stories

1. As a staff member, I want to link my phone once, so that I do not choose my name every shift.
2. As a staff member, I want check-in to ask for Face ID or my fingerprint, so that nobody else can check in as me.
3. As a staff member, I want to be told plainly why my location is requested and that it is checked once and not tracked, so that I can decide to allow it.
4. As a staff member, I want to check in even if my location is refused, unavailable or wrong, so that a weak indoor signal never delays clinical work.
5. As a staff member, I want to check in on my first shift before an administrator has approved my enrolment, so that sign-up does not block me.
6. As a staff member with a new, lost or replaced phone, I want a route to check in and re-enrol, so that I am not locked out.
7. As a staff member without a compatible phone, I want the existing name-selection route to remain, so that I can still record attendance.
8. As a locum not on today's rota, I want to enrol and check in on the same visit, so that my hours are recorded from the first shift.
9. As a coordinator, I want to see which check-ins are verified and which are flagged, with the reason, so that I review only the exceptions.
10. As a coordinator, I want to approve or reject a new phone enrolment, so that a person cannot enrol as a colleague unnoticed.
11. As a coordinator, I want to accept a flagged session with a note, so that a genuine check-in with a poor signal is not left looking suspicious.
12. As an administrator, I want to set the department's area from inside the department, so that I do not need to look up coordinates.
13. As an administrator, I want to revoke a staff member's passkey, so that a lost phone cannot be used.
14. As an administrator, I want the CSV export to carry the identity and location outcome, so that locum sign-off can rely on it.
15. As an administrator, I want existing sessions and roster history preserved, so that this change does not rewrite past attendance.
16. As the data owner, I want coordinates never stored, so that InOut holds an attendance record and not a location history.
17. As a maintainer, I want passkeys to survive a later move of the application to the Trust's Azure tenancy, so that staff do not re-enrol.

## Implementation Decisions

### Scope and architecture

- Retain TanStack Start, Workers, D1 and Drizzle. Put database access and verification behind server-only handlers. Do not query D1 from isomorphic loaders.
- Extend the existing `checkIn`, `checkOut` and `undoLastAction` server functions and the existing admin routes. Do not create a parallel attendance path.
- Every new server input gets real runtime validation. The current typed identity validators on `checkIn` and `checkOut` do not validate input and are replaced as part of this work.
- The daily QR token remains required for a check-in or checkout. It is unchanged: derived from `QR_SEED` and the date, stored in `rotas.token`.

### Stable staff records

- Add a `staff` table: a stable ID, display name, optional role, active flag and creation time. This is the same stable staff record that the secure NFC specification requires; build it once.
- Add a nullable `staff_id` to `roster_entries`. Existing rows stay null. Do not backfill by guessing from names.
- On rota import, link an entry to a staff record only on an exact, unambiguous match of the normalised name among active staff. Anything else is left unlinked and listed for the administrator to resolve. Never merge on an ambiguous name.
- When a passkey check-in arrives for a staff member with no entry on today's rota, create a `manual` roster entry linked to that staff record, following the existing locum self-entry rules, and mark the session accordingly.
- Do not broaden history access. `/history` continues to show completed sessions for a roster entry; cross-day personal history is a separate decision.

### Passkey enrolment

- Use WebAuthn through the browser's standard API. Require a platform authenticator, a discoverable credential and user verification. Do not request attestation.
- Enrolment starts from a valid daily QR token, so it happens on site. The person chooses their name from today's rota, or enters name and role through the existing locum route, then creates the passkey.
- Store one row per credential in a `staff_credentials` table: credential ID, public key, signature counter, transports, staff ID, status, creation time, last-used time and approving administrator. A staff member may hold more than one credential.
- A new credential starts as `pending`. It can be used immediately; sessions made with it carry identity assurance `passkey_pending` and are flagged. An administrator approves or rejects it in the admin area, and approval is written to the audit log.
- Rejecting or revoking a credential stops it being accepted. Sessions already recorded are kept, with their original assurance.
- Enrolling a second credential for a staff record that already has an approved one always requires fresh administrator approval.
- Challenges are random, single-use and short-lived. Workers are stateless, so store them in D1 with an expiry and delete them on use. Expired challenges are removed opportunistically; no new scheduled job is introduced.
- Candidate library: `@simplewebauthn/server` with `@simplewebauthn/browser`. Confirm it runs under workerd in the Workers test project before adopting it. Install with pnpm and commit `pnpm-lock.yaml`.

### Relying party and hosting

- The WebAuthn relying party ID is the application's hostname. Passkeys are bound to it permanently.
- Serve the pilot from a stable custom hostname, not a `workers.dev` address. A later move of the application to the Trust's Azure tenancy then keeps every passkey working, provided the hostname is kept. Changing the hostname forces every staff member to re-enrol.
- The relying party ID and expected origin are configuration, validated at startup of each request path that uses them. Local development uses `localhost`.
- The move to Azure itself, including replacing D1, is out of scope here.

### Check-in and checkout

- The client requests a challenge, obtains a passkey assertion with user verification required, obtains a location reading, then submits the daily QR token, the assertion and the reading in one call.
- The server verifies, in order: runtime shape and size of the input; rate limit; the daily QR token; the assertion signature, challenge, origin, relying party ID and user-verified flag; the credential status; and the signature counter where the authenticator provides one.
- The server resolves the credential to a staff record, then to today's roster entry, creating a linked manual entry if needed.
- The session insert, evidence columns, challenge consumption, counter update and audit event are written in one D1 batch. Keep the existing partial unique index as the guard against two open sessions.
- If the phone has no usable passkey, the existing name-selection route remains available behind an explicit "Use without Face ID" choice. Such sessions carry identity assurance `self_selected` and are flagged.
- `undoLastAction` requires the same identity evidence as the action it undoes, or administrator authority.

### Location check

- Use the browser Geolocation API once per check-in and once per checkout: high accuracy requested, a short maximum age, and a bounded timeout. No background or continuous tracking, and no location request on page load.
- Show a plain-language explanation before the first browser permission prompt: what is checked, when, that coordinates are not stored, and that refusing does not block check-in.
- The client sends latitude, longitude and reported accuracy. The server computes the distance to the configured centre and discards the coordinates. Coordinates are never written to D1, the audit log or request logs.
- Store on the session, for check-in and checkout separately: an outcome and the reported accuracy in metres. Outcomes: `inside`, `outside`, `denied`, `unavailable`, `not_requested`.
- A reading is `inside` when the distance minus the reported accuracy is within the configured radius. Readings whose accuracy is worse than a configured ceiling are `unavailable`, not `outside`.
- The department's centre and radius are stored in D1 and set by an administrator from the admin area using "use my current position" while standing in the department, with the radius adjustable. Radius and accuracy ceiling are pilot tuning parameters, not agreed policy.
- A reported position is an untrusted client input. It can be faked. It raises the effort of misuse and exposes casual sharing of the QR; it does not prove presence. Documentation and UI must say "location check passed", never "location verified".

### Evidence, flags and review

- Add to `sessions`: identity assurance for check-in and for checkout (`passkey`, `passkey_pending`, `self_selected`, `admin`), the credential used, the two location outcomes and accuracies, and a nullable review state with reviewer and note. Existing rows read as `self_selected` and `not_requested`.
- A session is **verified** when identity assurance is `passkey` and the location outcome is `inside`, at both ends once checked out. Anything else is **flagged**, with the reasons derived from the stored values, not stored as free text.
- The dashboard shows verified or flagged per session, with the reason in words and an icon, not colour alone. Dashboard reads still do not poll.
- An administrator can accept a flagged session with a note. Acceptance is recorded in the audit log and does not alter the original evidence.
- The CSV export and the weekly rollup gain identity assurance, location outcome and review state columns.
- Admin additions and corrections carry identity assurance `admin` and are not shown as flagged for location.

### Migrations and data

- Edit `src/db/schema.ts`, generate with `pnpm run db:generate`, and inspect the SQL for accidental table recreation. Add new migrations only; never modify an applied one.
- All new columns on existing tables are nullable or defaulted so that existing rows remain valid. No historical session is rewritten.
- Deleting a roster entry keeps the existing explicit linked-session deletion in one batch. Deleting a staff record is not offered; staff are deactivated.
- Retention for credentials, pending challenges and evidence columns follows the period the Trust's Information Governance review sets for attendance data.

### Honest assurance

- A passkey proves that an enrolled phone, unlocked by its owner's biometric or passcode, signed the request. It does not prove the owner is the named staff member beyond the administrator's approval at enrolment.
- The daily QR plus a location check shows that the phone reported a position in the department area while holding today's token. A photograph of the QR used elsewhere is flagged, not prevented. A falsified position is not detected.
- Describe pilot sessions as "verified" in the product sense defined above. Do not describe them as proof of presence. Strong presence evidence is the purpose of the secure NFC phase.

## Relationship to the secure NFC specification

- **Shared:** stable staff records and links from daily roster entries. Implement once, to the stricter of the two specifications.
- **Amended, identity:** the secure NFC specification states that self-selection remains a trust-based claim and that no passkey is introduced. The user has since chosen passkeys from the first day of the ED pilot. When NFC is built, the remembered identity in that specification becomes the passkey-backed staff record defined here. Its offline capture design must then decide how an offline tap is bound to a passkey; that is unresolved and belongs to NFC implementation planning.
- **Amended, location:** the secure NFC specification excludes covert location collection and requires disclosure, permission and an agreed retention policy before any location use with a QR. This specification is that explicit decision: a single disclosed, permissioned check, with no coordinates stored.
- **Unchanged:** everything about tag provisioning, replay protection, offline outbox and reconciliation in the secure NFC specification.

## Testing Decisions

Test externally observable outcomes at three boundaries.

1. **Worker/D1 integration.** Extend the disposable workerd/D1 tests that run the real migrations. Cover: enrolment creating a pending credential; approval, rejection and revocation; a valid assertion; a wrong challenge, reused challenge, wrong origin, wrong relying party, missing user verification and a regressed counter; an unknown credential; a staff member absent from today's rota; the name-selection fallback; each location outcome including the accuracy ceiling and the boundary of the radius; the atomic write on a concurrent double submit; admin acceptance of a flag; export columns; and that no coordinate is persisted anywhere.
2. **Browser behaviour.** Exercise the production build with a virtual authenticator and mocked geolocation. Cover: first enrolment; return visit; permission denied; timeout; a phone with no passkey; the disclosure shown before the first prompt; and that reload or back navigation never records a second action.
3. **Physical devices.** Before the pilot, enrol and check in on a real iPhone and a real Android phone inside the department. Record observed location accuracy at each staff entrance and in the main clinical areas, and set the radius and accuracy ceiling from those readings. Confirm behaviour with location services off and with a private browsing window.

Run `pnpm run typecheck`, `pnpm test` and `pnpm run build` during implementation.

## Out of Scope

- Secure NFC tags, offline capture and tag provisioning: see the secure NFC specification.
- Apple Wallet or Google Wallet passes, reader terminals, barcode scanners and staff cards.
- Blocking a check-in or checkout for any identity or location reason.
- Continuous, background or stored location; geofencing while the page is closed.
- Passwords, email sign-in, Trust single sign-on and directory integration.
- Moving the application to Azure, and any payroll or HealthRoster integration.
- New scheduled jobs. Auto-checkout remains an administrator action.
- Production deployment, remote migrations and changes to remote data as part of this specification.

## Further Notes

- Agreed direction on 20 November 2026: the ED pilot is daily QR plus a location check plus passkey identity from day one; flags never block; secure NFC tags follow; the application moves to the Trust's Azure tenancy after the pilot.
- Suggested delivery order: stable staff records and import linking; passkey enrolment and approval; passkey check-in with the fallback; location check and area setup; evidence in dashboard and export; physical-device tuning. Each stage is usable on its own.
- Unsettled and to be decided before go-live: the radius and accuracy ceiling; who may approve enrolments; whether enrolment is done in supervised sessions before the pilot or on each person's first shift; the retention period; and the custom hostname.
- Information Governance and clinical safety review are handled through the general manager's office. This specification supplies the data description they need: no coordinates stored, one location outcome per action, one public key per enrolled phone, and no biometric data ever leaving the phone.
- References: [W3C Web Authentication](https://www.w3.org/TR/webauthn-3/), [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API), [SimpleWebAuthn](https://simplewebauthn.dev/). Library availability is not a security review.

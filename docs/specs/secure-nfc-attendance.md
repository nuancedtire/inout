# Secure NFC attendance with offline recovery and self-provisioned tags

Status: specification prepared for implementation planning. Test boundaries approved by the user. This is a specification, not a claim that NFC or offline attendance is implemented.

Canonical tracker issue: https://github.com/nuancedtire/inout/issues/72

## Problem Statement

Staff currently scan a daily QR URL, choose a daily roster entry and submit attendance online. Daily printing and repeated scanning are cumbersome. Poor hospital connectivity can prevent attendance from being recorded. The browser remembers a daily roster-entry ID rather than a stable staff identity, so that selection does not reliably carry across rotas.

The user wants staff to select themselves once, then tap a fixed hospital NFC tag to check in or out. There must be no staff app installation requirement, issued card/fob/sticker, paid authentication subscription, or powered attendance terminal. Staff must be able to distinguish a tap saved on their phone from attendance confirmed by the server, and reopening InOut must recover pending actions without another NFC tap.

## Solution

Use self-provisioned NXP NTAG 424 DNA wall tags whose HTTPS links contain Secure Dynamic Messaging authentication evidence. Staff read the tag using their phone's normal NFC handling and open the link. Supported iPhones require opening the notification; a physical tap alone is not an attendance submission.

On first use online, staff select and confirm their identity. InOut prepares an offline-capable capture page in that browser. On subsequent new tag reads, InOut uses the remembered identity and unambiguous attendance state to save an explicit check-in or checkout intent locally before uploading. An uncertain state asks for a choice rather than guessing. The UI clearly names the person, offers identity correction and undo, and distinguishes locally saved, awaiting upload, server-confirmed, and attention-required actions.

The server verifies the tag evidence, prevents reuse and duplicate writes, resolves the staff member to the relevant rota, and acknowledges the result. Pending events survive ordinary reloads and browser restarts, subject to browser storage retention. Uploads retry when the app runs, reconnects or reopens, with background sync only as an enhancement where supported.

A small administrator-only Android provisioning tool configures blank tags with our own URL and per-tag keys. Staff do not need that tool. A permanent QR remains a clearly distinguished fallback; a reusable public link is not equivalent to verified NFC evidence.

## User Stories

1. As a staff member, I want to select my name on first use, so that I do not need an account or password.
2. As a staff member, I want my selection to survive daily rota changes, so that I do not identify myself every morning.
3. As a staff member, I want to tap a wall tag and open its link, so that I can avoid camera scanning in normal use.
4. As a staff member, I want a clear confirmation naming me and the action, so that I know what was recorded.
5. As a staff member, I want a prominent way to change the selected person, so that a shared or borrowed phone does not record the wrong name.
6. As a staff member, I want a new offline tap saved before any upload attempt, so that a connection failure does not immediately lose it.
7. As a staff member, I want to know whether offline setup succeeded, so that I do not assume an unprepared browser can capture attendance.
8. As a staff member, I want a clear failure when local saving fails, so that I can use an alternative instead of walking away with false reassurance.
9. As a staff member, I want pending events to survive closing and reopening InOut, so that I do not need to repeat a physical tap.
10. As a staff member, I want opening InOut to retry pending uploads automatically, so that recovery requires no manual resubmission.
11. As a staff member, I want a persistent pending count and a retry control, so that I can see and resolve unsynced attendance.
12. As a staff member, I want repeat taps, reloads and browser back navigation to avoid accidental reversals, so that one intended action does not become several.
13. As a staff member, I want check-in and checkout captured during the same outage to remain separate ordered intentions, so that later upload preserves what I did.
14. As a staff member, I want an ambiguous or stale status to ask which action I intend, so that an old open session is not silently closed by my arrival.
15. As a staff member, I want to undo a mistaken action, so that I can recover without destroying the original evidence.
16. As a staff member, I want identity changes to leave previous pending actions assigned to their original person, so that my colleague's attendance cannot be reassigned accidentally.
17. As a staff member, I want an explanation when a new browser needs online setup, so that offline limitations are understandable.
18. As a locum, I want an assisted or approved route when no matching roster entry exists, so that I am not forced to select a colleague.
19. As a staff member, I want a permanent QR fallback when NFC is unavailable, so that I can still request attendance recording.
20. As an administrator, I want stable staff identities linked to daily roster entries, so that imports do not break remembered selections.
21. As an administrator, I want ambiguous name matches held for review, so that similarly named staff are not merged automatically.
22. As an administrator, I want to see evidence source, capture time and receipt time, so that delayed and fallback attendance is distinguishable.
23. As an administrator, I want missing-rota and conflicting events retained for review, so that legitimate delayed attendance is not discarded.
24. As an administrator, I want historical sessions preserved through migration, so that this change does not rewrite existing attendance.
25. As an administrator, I want to configure blank tags using an Android phone, so that I avoid supplier encoding fees and authentication subscriptions.
26. As an administrator, I want a tag read back and verified before activation, so that a partially configured tag is not installed.
27. As an administrator, I want secure key backup and recoverable provisioning status, so that interrupted writes do not leave undocumented or unusable tags.
28. As an administrator, I want to deactivate or replace a checkpoint tag, so that a lost or moved tag cannot continue authorising attendance.
29. As an administrator, I want replay and concurrent submissions handled atomically, so that one tag read cannot create attendance for multiple people.
30. As an administrator, I want staff-facing confirmation to reflect durable server state, so that network failures do not produce false success.
31. As a maintainer, I want offline queues to survive app updates, so that deploying a new UI does not erase pending attendance.
32. As a maintainer, I want real-device acceptance testing, so that browser and NFC assumptions are proven before hospital rollout.

## Implementation Decisions

### Scope and architecture

- Retain TanStack Start, Workers, D1 and Drizzle. Put database access, tag keys and verification behind server-only request handlers with real runtime validation. Do not query D1 from isomorphic loaders.
- Extend the existing attendance mutation boundary and existing admin/rota workflows rather than creating a parallel attendance database.
- Add a dedicated offline-capable capture experience that does not block on a live rota loader. First setup requires connectivity; a prepared browser can capture for its known staff identity without today's rota being cached.
- Do not introduce Cloudflare Workflows for the short verification-and-save path. It cannot resolve a phone's inability to upload while suspended.
- Retain existing daily QR behaviour during a staged pilot. Document the supersession of the daily-QR-only architecture when the feature ships; do not rewrite historical ADRs as if NFC already existed.

### Identity and roster mapping

- Introduce stable staff records and links from daily roster entries. Keep existing session references and historical names intact; backfill only verified mappings.
- Self-selection remains a trust-based identity claim. No formal staff registration, password, hardware identity, passkey or claim of strong person authentication is introduced.
- Match imports using a reliable staff identifier if available. Otherwise use controlled mappings and explicit review; never automatically merge solely on an ambiguous name.
- Give every pending event an immutable staff ID and a display-name snapshot. Changing the selected identity affects future events only. Partition cached attendance state by staff identity.
- Unknown, inactive or ambiguous staff/rota mappings produce an actionable review outcome, not reassignment to today's selected person or a silent drop.
- Do not broaden private history access merely because stable staff IDs now exist. Administrative evidence and review remain admin-authorised.

### Capture, storage and synchronization

- Use persistent structured browser storage for the event outbox. An event includes a unique event ID, protocol version, staff identity, checkpoint/tag evidence, explicit action, phone capture time, local ordering/dependency information, and reconciliation status. Phone timestamps and claimed identities are untrusted inputs.
- Save the event durably before showing local-save success or starting upload. If storage is unavailable, full or fails, show that the action was not saved and offer online submission or assisted recovery with accurate confirmation.
- New NFC evidence starts capture; a generic page opening, preview fetch, server GET, reload, history restoration or service-worker installation must never toggle attendance. Remove consumed evidence from the visible URL after it has been safely captured. Deduplicate evidence locally across tabs.
- A valid-looking new read can automatically choose an action only when cached/confirmed state plus the local pending sequence makes the intent unambiguous. Stale, conflicting or missing state requires explicit selection. Never calculate a toggle when uploading later.
- Include deliberate repeat-tap protection and an explicit way to perform a legitimate next action. Exact debounce duration is a pilot tuning parameter, not an agreed attendance policy.
- Retry on opening, foreground return, successful connectivity recovery and eligible background sync. Use bounded backoff with jitter, distinguish temporary transport/server failures from final validation failures, and avoid retry storms across tabs.
- Keep unacknowledged events through crashes, restarts and app upgrades. Delete no event merely because a fetch started or timed out. Retain rejected/conflicting outcomes visibly until resolved; stop blindly retrying final errors.
- Queue schema migrations must preserve old events. Support previously issued protocol versions during rollout. Do not clear the outbox as part of service-worker asset-cache cleanup.
- Browser eviction, cleared data and suspended-app restrictions remain real limits. An offline-ready badge describes the current browser context, not a guarantee across Safari, installed home-screen apps and other browsers. Test which context actual NFC links open.
- Cache the non-personalized offline shell and required production assets deliberately. Do not broadly cache RPCs, admin pages, private responses or each secret-bearing NFC URL. Offline navigation must work for fresh tag URLs without relying on an exact cached URL match.

### Server contract, security and reconciliation

- Provide a versioned attendance-event submission boundary with per-event durable outcomes: confirmed, received-for-review, or rejected. A transport failure supplies no acknowledgement. Idempotent retry of identical input returns the stored outcome; reuse of an event ID with different input is rejected.
- Verify tag authentication before accepting checkpoint evidence. Authenticate the configured tag identity and counter together, check checkpoint activation/key version, and perform real input, size and rate validation.
- Atomically couple replay reservation, event outcome, session mutation and associated audit evidence using the existing D1 transaction/batch conventions. Concurrent requests must not consume one proof more than once or create multiple open sessions for a staff member.
- Do not implement replay protection solely as 'counter must exceed largest seen'. Different phones can upload legitimate lower counters later. Track consumed proofs under a tag/key generation and counter with uniqueness constraints, and reconcile out-of-order events explicitly.
- Expiration/retention of consumed proofs must not silently reopen old evidence for reuse. Define a bounded acceptance/retention strategy and key-generation retirement before production. The tag contains no trusted wall-clock timestamp; a claimed capture time cannot prove evidence freshness.
- Store phone-reported capture time separately from first server receipt and final attendance time. Preserve original evidence through corrections. Clock skew, stale/unpaired checkout, future time, missing rota and cross-device conflicts require clear review rules.
- Reconcile queued check-in/out dependencies without assigning all late events to the receipt date. UK date boundaries, overnight shifts and BST transitions must be covered; ambiguous matching goes to review rather than guessing.
- Undo is a linked correction/cancellation with idempotent behaviour. Handle cancellation before submission, in-flight submissions and already-confirmed actions without losing the original audit trail or reusing a proof for another identity.
- Reject replayed evidence even when the caller changes event ID or staff identity. Do not treat an ordinary URL, public daily QR token or client-provided 'verified' flag as secure NFC proof.
- Document the assurance accurately: verified tag evidence is not verified staff identity or definitive presence/time. Delayed unused evidence can be relayed or stockpiled. Allowing offline uploads necessarily limits freshness claims.
- Redact raw NFC proofs from routine logs/analytics, avoid third-party resources on the capture page, use restrictive referrer behaviour, and keep tag secrets out of browser bundles, QR codes, URLs, repository files and logs.

### Self-provisioning and checkpoint administration

- Use genuine blank NTAG 424 DNA tags with no supplier encoding service or ixkio dependency. Select mounting-compatible tags; the discussed ordinary white labels are unsuitable directly on metal.
- An Android administrator tool will be built or adapted after review of existing libraries and licences. No production-ready provisioning tool has been selected or validated yet. Staff continue to use only the web app.
- Use NXP-documented AES SDM configuration, a stable HTTPS origin and an explicitly versioned URL/evidence format shared with the verifier. Correct NDEF byte offsets and authenticated fields must be derived and checked, not manually guessed.
- Provision distinct per-tag secrets, replace default factory keys, restrict writes/settings changes to authorised keys while leaving normal URL reads available, and retain secured administration keys for future changes.
- Back up generated secrets and provisioning intent securely before mutating a tag. Record progress and read back actual state to recover from a phone being moved during configuration. Never mark a tag active solely because an initial write returned success.
- Authenticate/re-read the configured tag and verify a real generated message through the backend before activation. Do not use public demo keys or demonstration verification servers in production. Do not apply irreversible settings as an incidental setup step.
- Keep a checkpoint inventory with tag identity, location, status, key generation and provisioning outcome. Deactivation blocks new automatic confirmations; delayed submissions from a retired tag need an explicit review policy because capture times are not trusted.
- The detailed key-storage envelope, recovery process and provisioning package transport are implementation design tasks requiring validation before real keys are written. No key export should be part of ordinary admin reports.

### User interface and fallback

- States must distinguish 'Saved on this phone', 'Waiting for connection', 'Attendance confirmed', and 'Needs attention'. Include person, action, time and a pending count. Use accessible text/icons, not colour alone or an endless spinner.
- A locally saved action is provisional. The admin dashboard cannot see it until upload; do not imply live occupancy is complete during outages.
- Normal secure NFC does not require phone location. Covert location collection is excluded. If location is later selected for QR fallback, it requires transparent disclosure, browser permission and an agreed retention/access policy.
- A permanent QR opens the fallback experience without granting secure-NFC status. Proposed pilot default: submit an admin-review request when NFC proof is unavailable. This is explicitly a proposed policy, not a previously approved location or auto-acceptance rule.
- Existing locum, admin correction, export and automatic-checkout behaviour must remain understandable. Automatic checkout is currently an admin action, not a provisioned scheduler; represent it as such in evidence and review.

## Testing Decisions

The user approved three primary boundaries: the real Worker/D1 attendance submission boundary, browser offline recovery, and a physical Android/iPhone pilot. Test externally observable outcomes rather than private helper calls, component structure or implementation-mirroring mocks.

1. **Worker/D1 integration:** Extend the existing disposable workerd/D1 tests that run actual migrations and attendance mutations. Exercise the submission handler/API and assert durable outcomes, sessions and audit evidence. Cover valid and forged messages; changed identity/event IDs; identical retry; conflicting retry; concurrent proof reuse; receipt loss; legitimate lower counters arriving later; missing rotas; stable identity migration; overnight/BST reconciliation; undo; revoked tags; and admin authorisation. Verify against NXP known-answer vectors as well as a real provisioned tag, avoiding tests where the same buggy encoder generates all expected values.
2. **Browser behaviour:** Exercise the production-built offline capture page and service worker with browser tooling. Cover initial online preparation, fresh offline NFC URL, no prior setup, identity switching with queued events, app reload/reopen, multiple pending actions, dropped acknowledgements, multi-tab duplicate handling, storage failure, final rejection, manual retry, and service-worker/app updates preserving old events. Verify exact UI distinctions and that generic reopening never records a fresh action. Extend existing component tests only for behaviours not covered effectively through the browser boundary.
3. **Physical pilot:** Provision one test tag with the actual Android handset. Verify interrupted provisioning and key recovery, then tap from real iPhone and Android devices. Test mounting surface, notification opening, correct browser context, offline cold navigation after setup, lock/close/reopen, restored connectivity, two phones uploading out of order, repeated taps and successful revocation. Record observed background-sync behaviour without assuming simulation proves OS behaviour. Do not roll out beyond the pilot until all supported device paths preserve identity, prevent duplicate sessions and display accurate status.

Run project type checks, existing relevant tests and the production build during implementation. No application code changed and no hardware or browser acceptance testing completed as part of drafting this specification.

## Out of Scope

- Staff native applications, mobile Wallet credentials, terminal readers, staff cards/fobs and staff-issued NFC stickers.
- Paid tag authentication subscriptions or supplier encoding services.
- Formal staff accounts, strong identity verification, biometric checks or guaranteed prevention of colleague impersonation/credential relay.
- Guaranteed upload while an iPhone browser is suspended, protection against the user deleting all browser storage, or guaranteed first-ever offline setup.
- Silent location tracking or continuous background tracking.
- Cloudflare Workflows, payroll integrations, new recurring jobs or broad unrelated application refactoring.
- Production deployment, hardware purchases and changes to remote data as part of specification creation.

## Further Notes

- Agreed direction: secure wall NFC, remembered self-selected identity, self-provisioning via an available Android phone, offline local save with honest UI and automatic reopen recovery, and no subscription.
- This revises the earlier account-registration suggestion: stable staff records are required, but staff registration/authentication was deliberately removed from the desired experience.
- Delivery should proceed in stages: prove tag provisioning and independent verification; implement stable identity and atomic server event handling; implement offline capture/recovery; add admin review and fallback; complete the physical pilot; then roll out. This order avoids claiming security before real hardware verification works.
- Policy details still to settle during implementation are delayed-event acceptance/retention, ambiguous session handling thresholds, legacy QR transition, fallback acceptance and tag-retirement treatment. The suggested review defaults preserve evidence without inventing trusted attendance.
- Exact tag pricing, supplier stock and programming-app capabilities must be checked at purchase/build time. No USB reader is assumed necessary if the Android pilot succeeds.
- Reference specifications and starting points: [NXP NTAG 424 DNA application note](https://www.nxp.com/docs/en/application-note/AN12196.pdf), [NXP TagWriter manual](https://inspire.nxp.com/tagwriter/tag-writer-user-manual.pdf), [Android library candidate](https://github.com/johnnyb/ntag424-java), [background synchronization limitations](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API), and [Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading). Library availability is not a security review or a successful hardware test.

/**
 * Location is required for staff check-in and check-out. When a phone genuinely cannot share it,
 * this decides whether the "Turn on location" screen offers a small, low-emphasis way through:
 * "Can't turn it on? Check in anyway — the coordinator will be told." Such actions are recorded
 * with location `denied`, which flags the session for review.
 *
 * Pending owner decision. Set to `false` to block check-in until location is on.
 */
export const ALLOW_CHECKIN_WITHOUT_LOCATION = true

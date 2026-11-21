/**
 * When an open session is expected to end, for shift-end reminders and the "you didn't check
 * out" prompt. Pure and isomorphic. Shift times are UK wall-clock times on the rota's date
 * (Europe/London, so BST is handled by Intl, not a fixed offset).
 */

const UK_TIMEZONE = 'Europe/London'
const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Entries without shift times: assume a 12-hour shift from check-in. */
export const DEFAULT_SHIFT_MS = 12 * HOUR
/** The reminder goes out this long after the expected end. */
export const REMINDER_DELAY_MS = 15 * MINUTE
/** A session is "forgotten" once it is this far past its expected end. */
export const FORGOTTEN_GRACE_MS = 60 * MINUTE
/** Forgotten sessions older than this are left to the coordinator. */
export const FORGOTTEN_MAX_AGE_MS = 7 * 24 * HOUR
/** Reminders are only sent for sessions that started within this window. */
export const REMINDER_MAX_AGE_MS = 24 * HOUR

const TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Minutes after midnight for "HH:MM" / "H:MM" / "HH:MM:SS" (00:00–24:00), else null. */
export function parseClockMinutes(value: string | null | undefined): number | null {
  const m = value ? TIME.exec(value.trim()) : null
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null
  return h * 60 + min
}

let partsFormatter: Intl.DateTimeFormat | undefined
function londonParts(at: number) {
  partsFormatter ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts: Record<string, number> = {}
  for (const p of partsFormatter.formatToParts(new Date(at))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return parts
}

/** Offset of UK local time from UTC at an instant, in milliseconds (0 in GMT, +1 h in BST). */
function londonOffsetMs(at: number): number {
  const p = londonParts(at)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUtc - Math.floor(at / 1000) * 1000
}

/**
 * UTC instant for a UK wall-clock time. `minutes` may exceed 1440 (rolls into the next day).
 * In the spring-forward gap (01:00–02:00 on the last Sunday of March) the result is one hour
 * later in wall-clock terms; in the autumn overlap the earlier (BST) instant is used.
 */
export function londonWallTimeToUtc(date: string, minutes: number): Date {
  const m = DATE.exec(date)
  if (!m) throw new Error('Invalid date')
  // The wall time read as if it were UTC; the real instant is that minus the UK offset in force.
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutes)
  const before = londonOffsetMs(wall - 12 * HOUR)
  const after = londonOffsetMs(wall + 12 * HOUR)
  const valid = [wall - before, wall - after].filter((t) => londonOffsetMs(t) === wall - t).sort((a, b) => a - b)
  return new Date(valid[0] ?? wall - before)
}

export type ShiftEndInput = {
  /** The roster entry's rota date, YYYY-MM-DD. */
  rotaDate: string
  shiftStart: string | null
  shiftEnd: string | null
  /** ISO check-in time. */
  checkInAt: string
}

export type ShiftEnd = {
  expectedEndAt: Date
  /** 'shift' when the rota's end time was used, 'default' for check-in + 12 h. */
  basis: 'shift' | 'default'
}

/**
 * Expected end of a session: the rota's shift end on its date (the next day when the end is at
 * or before the start, i.e. an overnight shift, or — with no start time — at or before
 * check-in), else check-in + 12 hours.
 */
export function expectedShiftEnd(input: ShiftEndInput): ShiftEnd {
  const checkIn = Date.parse(input.checkInAt)
  const end = parseClockMinutes(input.shiftEnd)
  if (end !== null && DATE.test(input.rotaDate)) {
    const start = parseClockMinutes(input.shiftStart)
    let at = londonWallTimeToUtc(input.rotaDate, end)
    const overnight = start !== null
      ? end <= start
      : Number.isFinite(checkIn) && at.getTime() <= checkIn
    if (overnight) at = londonWallTimeToUtc(input.rotaDate, end + 24 * 60)
    return { expectedEndAt: at, basis: 'shift' }
  }
  return { expectedEndAt: new Date((Number.isFinite(checkIn) ? checkIn : Date.now()) + DEFAULT_SHIFT_MS), basis: 'default' }
}

/** True when the shift-end reminder for an open session is due (end + 15 min, started within 24 h). */
export function isReminderDue(input: ShiftEndInput, now: Date = new Date()): boolean {
  const checkIn = Date.parse(input.checkInAt)
  if (!Number.isFinite(checkIn) || now.getTime() - checkIn > REMINDER_MAX_AGE_MS) return false
  return now.getTime() >= expectedShiftEnd(input).expectedEndAt.getTime() + REMINDER_DELAY_MS
}

/** An open session is forgotten once now is past its expected end + 60 min; only within 7 days of check-in. */
export function isForgottenSession(input: ShiftEndInput & { checkOutAt: string | null }, now: Date = new Date()): boolean {
  if (input.checkOutAt) return false
  const checkIn = Date.parse(input.checkInAt)
  if (!Number.isFinite(checkIn) || now.getTime() - checkIn > FORGOTTEN_MAX_AGE_MS) return false
  return now.getTime() > expectedShiftEnd(input).expectedEndAt.getTime() + FORGOTTEN_GRACE_MS
}

/** "08:00–20:00", or null when the entry has no complete shift times. */
export function shiftLabel(shiftStart: string | null, shiftEnd: string | null): string | null {
  const s = parseClockMinutes(shiftStart)
  const e = parseClockMinutes(shiftEnd)
  if (s === null || e === null) return null
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${fmt(s)}–${fmt(e)}`
}

/** UK wall-clock "HH:MM" for an instant. */
export function ukClock(at: Date): string {
  const p = londonParts(at.getTime())
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

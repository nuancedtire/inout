/**
 * The "you didn't check out" time picker: which leaving times are allowed and how a picked UK
 * day + clock time becomes the ISO instant sent to `reportForgottenCheckout`. Pure and
 * isomorphic; all wall-clock maths is Europe/London (BST handled by Intl via shiftEnd).
 */
import { londonWallTimeToUtc, ukClock } from '#/utils/shiftEnd'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** Mirrors MAX_REPORTED_SHIFT_MS on the server: a reported time is within 24 h of check-in. */
export const MAX_REPORTED_MS = DAY

/** Inclusive range of whole-minute instants (epoch ms) the server will accept. */
export type LeftAtBounds = { min: number; max: number }

/**
 * Earliest: the first whole minute strictly after check-in (the server needs left > check-in).
 * Latest: now or check-in + 24 h, whichever is sooner, rounded down to the minute.
 */
export function leftAtBounds(checkInAt: string, now: number): LeftAtBounds {
  const checkIn = Date.parse(checkInAt)
  return {
    min: Math.floor(checkIn / MINUTE) * MINUTE + MINUTE,
    max: Math.floor(Math.min(now, checkIn + MAX_REPORTED_MS) / MINUTE) * MINUTE,
  }
}

export function checkLeftAt(at: number, bounds: LeftAtBounds): 'ok' | 'too_early' | 'too_late' {
  if (!Number.isFinite(at) || at < bounds.min) return 'too_early'
  if (at > bounds.max) return 'too_late'
  return 'ok'
}

let dateFormatter: Intl.DateTimeFormat | undefined
/** UK calendar date (YYYY-MM-DD) of an instant. */
export function londonDate(at: number): string {
  dateFormatter ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
  return dateFormatter.format(new Date(at))
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Whole calendar days between two YYYY-MM-DD dates (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY)
}

const weekday = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const shortDay = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))

/** "Today", "Yesterday" or "Thu 19 Nov" for a UK date, relative to `now`. */
export function dayLabel(date: string, now: number): string {
  const diff = daysBetween(date, londonDate(now))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return shortDay(date)
}

/** "today", "yesterday", "on Thursday" (or "on Thursday 12 November" a week or more back). */
export function dayPhrase(at: number, now: number): string {
  const date = londonDate(at)
  const diff = daysBetween(date, londonDate(now))
  if (diff <= 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 6) return `on ${weekday(date)}`
  return `on ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}`
}

/** One selectable UK day in the picker, with the clock range allowed on it ("HH:MM", inclusive). */
export type DayOption = { date: string; label: string; minTime: string; maxTime: string }

/** The UK days the allowed range touches (usually one or two; three only across a 23-hour day). */
export function dayOptions(bounds: LeftAtBounds, now: number): DayOption[] {
  if (bounds.max < bounds.min) return []
  const first = londonDate(bounds.min)
  const last = londonDate(bounds.max)
  const days: DayOption[] = []
  for (let date = first; date <= last && days.length < 4; date = nextDate(date)) {
    days.push({
      date,
      label: dayLabel(date, now),
      minTime: date === first ? ukClock(new Date(bounds.min)) : '00:00',
      maxTime: date === last ? ukClock(new Date(bounds.max)) : '23:59',
    })
  }
  return days
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The instant for a UK date and "HH:MM", or null when the time isn't a valid clock time. */
export function leftAtFrom(date: string, time: string): Date | null {
  const m = CLOCK.exec(time)
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return londonWallTimeToUtc(date, Number(m[1]) * 60 + Number(m[2]))
}

/** Keep a picked "HH:MM" inside a day's allowed range (string compare works for HH:MM). */
export function clampTime(time: string, day: DayOption): string {
  if (!CLOCK.test(time)) return day.minTime
  if (time < day.minTime) return day.minTime
  if (time > day.maxTime) return day.maxTime
  return time
}

/** The expected end, if it is itself an allowed leaving time (the one-tap "I left at 20:00"). */
export function suggestedLeftAt(expectedEndAt: string, bounds: LeftAtBounds): number | null {
  const at = Math.floor(Date.parse(expectedEndAt) / MINUTE) * MINUTE
  return checkLeftAt(at, bounds) === 'ok' ? at : null
}

/** Where the picker starts: the expected end, clamped into the allowed range. */
export function initialPick(expectedEndAt: string, bounds: LeftAtBounds): { date: string; time: string } {
  const end = Date.parse(expectedEndAt)
  const at = Number.isFinite(end) ? Math.min(Math.max(end, bounds.min), bounds.max) : bounds.max
  return { date: londonDate(at), time: ukClock(new Date(at)) }
}

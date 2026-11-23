import { parseClockMinutes } from '#/utils/shiftEnd'

/**
 * Where someone's shift stands right now, for the line beside the shift time on Home: "Starts in
 * 6 min", "Ends in 8h 18m", "Started 12 min ago". Pure, in UK wall-clock minutes. The roster entry
 * is today's, so the start is today; an end before the start runs into tomorrow (overnight).
 */

export type ShiftTone = 'neutral' | 'success' | 'warning'

export type ShiftStatus = {
  /** "08:00–20:30", "From 08:00", or null when the rota has no times. */
  times: string | null
  /** Short relation to now; null when there is nothing useful to say. */
  label: string | null
  tone: ShiftTone
  /** 0–1 through the shift while checked in, when start and end are known. */
  progress: number | null
}

const DAY = 24 * 60

/** "6 min", "2h 10m", "3h". */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${Math.max(1, m)} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

/** Minutes after midnight, UK time. */
export function londonMinutes(now: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

export function shiftStatus({ start, end, checkedIn, nowMinutes }: {
  start: string | null | undefined
  end: string | null | undefined
  checkedIn: boolean
  /** UK wall-clock minutes after midnight (see `londonMinutes`). */
  nowMinutes: number
}): ShiftStatus {
  const s = parseClockMinutes(start)
  let e = parseClockMinutes(end)
  const hhmm = (v: string | null | undefined) => v!.trim().slice(0, 5).padStart(5, '0')
  const times = s !== null && e !== null ? `${hhmm(start)}–${hhmm(end)}` : s !== null ? `From ${hhmm(start)}` : null
  if (s === null) return { times, label: null, tone: 'neutral', progress: null }

  if (e !== null && e <= s) e += DAY
  let now = nowMinutes
  // After midnight on an overnight shift that is still running.
  if (e !== null && e > DAY && now < s && now + DAY <= e + 12 * 60 && checkedIn) now += DAY

  if (checkedIn) {
    if (e === null) return { times, label: null, tone: 'success', progress: null }
    const progress = Math.min(1, Math.max(0, (now - s) / (e - s)))
    if (now < e) return { times, label: `Ends in ${formatSpan(e - now)}`, tone: 'success', progress }
    return { times, label: `Ended ${formatSpan(now - e)} ago`, tone: 'warning', progress: 1 }
  }

  if (now < s) return { times, label: `Starts in ${formatSpan(s - now)}`, tone: 'neutral', progress: null }
  if (e !== null && now >= e) return { times, label: 'Shift over', tone: 'neutral', progress: null }
  // Started, not checked in yet: a few minutes' grace before it reads as late.
  const late = now - s
  return late <= 5
    ? { times, label: 'Starting now', tone: 'neutral', progress: null }
    : { times, label: `Started ${formatSpan(late)} ago`, tone: 'warning', progress: null }
}

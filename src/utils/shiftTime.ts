/**
 * Typed shift times. People type times many ways — "0800", "800", "8", "8:00", "8.00", "08h00",
 * "8am", "8:30pm" — and phones often show a digits-only keypad, so a colon is optional.
 * Everything is stored as 24-hour "HH:MM" ("24:00" allowed for an end at midnight).
 */

export const SHIFT_TIME_HINT = 'Use 24-hour times like 08:00 or 0800.'

/** "HH:MM" for a typed time, '' for blank, or null when it can't be read. */
export function normalizeShiftTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return ''

  let h: number
  let m: number
  let meridiem: 'am' | 'pm' | null = null
  let match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)$/.exec(s)
  if (match) {
    h = Number(match[1])
    m = Number(match[2] ?? 0)
    meridiem = match[3].startsWith('a') ? 'am' : 'pm'
  } else if ((match = /^(\d{1,2})[:.h](\d{2})(?::\d{2})?h?$/.exec(s))) {
    h = Number(match[1])
    m = Number(match[2])
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(s))) {
    // "800", "0800", "2000"
    h = Number(match[1])
    m = Number(match[2])
  } else if ((match = /^(\d{1,2})h?$/.exec(s))) {
    h = Number(match[1])
    m = 0
  } else {
    return null
  }

  if (m > 59) return null
  if (meridiem) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (meridiem === 'pm' ? 12 : 0)
  }
  if (h > 24 || (h === 24 && m !== 0)) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

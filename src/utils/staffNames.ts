/**
 * Normalise a staff name (stored as `staff.normalized_name`; matching uses `nameKey` below):
 * Unicode NFKD with combining marks removed, lowercase, trimmed, and internal whitespace
 * collapsed to single spaces. Punctuation is kept, so "O'Neil" and "ONeil" differ.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Titles ignored when matching names. Only leading words, so a surname such as "Miss" survives. */
const TITLES = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof', 'professor'])

/**
 * Matching key for a staff name: `normalizeName`, then bracketed notes such as "(locum)" removed,
 * "Surname, First" turned into "first surname", and leading titles (Dr, Mr, Mrs, Ms, Miss, Mx,
 * Prof) dropped. Punctuation inside names is kept. Falls back to `normalizeName` if nothing is left.
 */
export function nameKey(name: string): string {
  const base = normalizeName(name)
  const words = (part: string) => {
    const w = part.split(/\s+/u).filter(Boolean)
    while (w.length > 1 && TITLES.has(w[0].replace(/\.$/u, ''))) w.shift()
    return w
  }
  const parts = base.replace(/\([^)]*\)|\[[^\]]*\]/gu, ' ').split(',').map(words)
  const ordered = parts.length === 2 && parts[0].length && parts[1].length
    ? words([...parts[1], ...parts[0]].join(' '))
    : words(parts.flat().join(' '))
  return ordered.join(' ') || base
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent transposition), capped at `max + 1`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1)
      row.push(v)
      best = Math.min(best, v)
    }
    if (best > max) return max + 1
    rows.push(row)
  }
  return rows[a.length][b.length]
}

const initialOf = (word: string) => (/^\p{L}\.?$/u.test(word) ? word[0] : null)

/**
 * Whether two different name keys are close enough to suggest as the same person. Never used to
 * link on its own; an admin confirms each suggestion. Covers swapped word order, a missing or
 * extra middle name, an initial for the first name ("J Smith", "Smith J"), and a small typo.
 */
export function namesLookAlike(a: string, b: string): boolean {
  if (!a || !b || a === b) return false
  const x = a.split(' ')
  const y = b.split(' ')
  if (x.length > 1 && y.length > 1) {
    if ([...x].sort().join(' ') === [...y].sort().join(' ')) return true
    const lastSame = x.at(-1) === y.at(-1)
    if (lastSame && x[0] === y[0]) return true
    if (lastSame && x.length === 2 && initialOf(x[0]) === y[0][0]) return true
    if (lastSame && y.length === 2 && initialOf(y[0]) === x[0][0]) return true
    // "Smith J" for "John Smith".
    if (x.length === 2 && initialOf(x[1]) === y[0][0] && x[0] === y.at(-1)) return true
    if (y.length === 2 && initialOf(y[1]) === x[0][0] && y[0] === x.at(-1)) return true
  }
  const shorter = Math.min(a.length, b.length)
  if (shorter < 5) return false
  return editDistance(a, b, shorter >= 10 ? 2 : 1) <= (shorter >= 10 ? 2 : 1)
}

/** "Patel, Priya (locum)" → "Priya Patel": bracketed notes removed, "Surname, First" reordered. For initials. */
export function firstLastOrder(name: string): string {
  const cleaned = name.replace(/\([^)]*\)|\[[^\]]*\]/gu, ' ')
  const parts = cleaned.split(',')
  const ordered = parts.length === 2 && parts[0].trim() && parts[1].trim() ? `${parts[1]} ${parts[0]}` : cleaned.replace(/,/gu, ' ')
  return ordered.replace(/\s+/gu, ' ').trim()
}

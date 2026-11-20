/**
 * Normalise a staff name for exact, unambiguous matching between rota imports, enrolment and
 * locum self-entry: Unicode NFKD with combining marks removed, lowercase, trimmed, and internal
 * whitespace collapsed to single spaces. Punctuation is kept, so "O'Neil" and "ONeil" differ.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}

import { useMemo, useState } from 'react'
import { ChevronRight, Search, UserPlus, X } from 'lucide-react'
import { normalizeName } from '#/utils/staffNames'
import { shiftLabel } from './copy'
import { Avatar, ScreenTitle } from './ui'

export type RosterEntry = {
  id: number
  name: string
  role: string | null
  shiftStart: string | null
  shiftEnd: string | null
  source: string
}

/**
 * Step 1 of sign-up (and the "without Face ID" name picker): today's rota as a searchable list
 * with large rows. The search field is never auto-focused, so the keyboard doesn't cover the list.
 */
export function RosterPicker({ entries, title, sub, onPick, onLocum, locumLabel = 'Not on today’s rota?' }: {
  entries: RosterEntry[]
  title: string
  sub: string
  onPick: (entry: RosterEntry) => void
  onLocum: () => void
  locumLabel?: string
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeName(query)
    if (!q) return entries
    return entries.filter((e) => normalizeName(`${e.name} ${e.role ?? ''}`).includes(q))
  }, [entries, query])

  const locumRow = (
    <button
      type="button"
      onClick={onLocum}
      className="ui-press group flex min-h-[68px] w-full items-center gap-3.5 rounded-[20px] border border-dashed border-hairline bg-canvas/60 px-4 py-3 text-left hover:border-ink/30 hover:bg-canvas"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-ink" aria-hidden="true">
        <UserPlus className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{locumLabel}</span>
        <span className="block text-sm text-muted">Locum, bank or agency — add yourself</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
    </button>
  )

  return (
    <div className="ck-screen flex flex-1 flex-col pt-2">
      <ScreenTitle sub={sub}>{title}</ScreenTitle>

      <div className="sticky top-0 z-10 -mx-5 mt-5 bg-surface-soft/95 px-5 pt-1 pb-3 backdrop-blur supports-[backdrop-filter]:bg-surface-soft/80">
        <label htmlFor="ck-search" className="sr-only">Search today’s rota</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="ck-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or role"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
            className="h-13 w-full rounded-[16px] border border-hairline bg-canvas pr-12 pl-12 text-base text-ink placeholder:text-muted outline-none focus:border-ink focus:ring-4 focus:ring-ink/8 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {query ? `${filtered.length} ${filtered.length === 1 ? 'person' : 'people'} found` : ''}
      </p>

      {filtered.length > 0 ? (
        <ul className="overflow-hidden rounded-[20px] bg-canvas shadow-card" aria-label="Today’s rota">
          {filtered.map((entry) => {
            const shift = shiftLabel(entry.shiftStart, entry.shiftEnd)
            const detail = [entry.role, shift].filter(Boolean).join(' · ')
            return (
              <li key={entry.id} className="border-b border-hairline-soft last:border-0">
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="flex min-h-[68px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-soft active:bg-surface-strong focus-visible:-outline-offset-2"
                >
                  <Avatar name={entry.name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{entry.name}</span>
                    {detail ? <span className="block truncate text-sm text-muted">{detail}</span> : null}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-[20px] bg-canvas px-5 py-8 text-center shadow-card">
          <p className="font-semibold text-ink">{entries.length === 0 ? 'Nobody is on today’s rota yet' : `No one called “${query.trim()}” today`}</p>
          <p className="mt-1 text-sm text-muted">If you’re a locum or not on the rota, add yourself below.</p>
        </div>
      )}

      <div className="mt-4 pb-2">{locumRow}</div>
    </div>
  )
}

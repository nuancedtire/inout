import { useEffect, useId, useRef, useState } from 'react'
import { Hospital, MapPin, Search, X } from 'lucide-react'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { inputClass, linkButtonClass } from './kit'
import type { MapPoint as Point } from '#/components/maps/AreaMap'

type Place = { id: number; name: string; detail: string; point: Point }

type NominatimHit = { place_id: number; display_name: string; lat: string; lon: string; name?: string }

/** One-tap suggestion for the pilot site. */
export const SUGGESTED_SITE = {
  label: 'Whipps Cross Hospital A&E',
  point: { latitude: 51.5781, longitude: 0.00405 },
  radiusM: 120,
}

// Nominatim usage policy: at most one request a second and no search-as-you-type.
const MIN_GAP_MS = 1100
let lastRequestAt = 0
const cache = new Map<string, Place[]>()

async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit
  const wait = lastRequestAt + MIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  lastRequestAt = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=en-GB&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many searches. Wait a moment and try again.' : 'Search is unavailable right now.')
  const data = (await res.json()) as NominatimHit[]
  const places = data
    .map((d) => {
      const [first, ...rest] = d.display_name.split(', ')
      return {
        id: d.place_id,
        name: d.name || first,
        detail: (d.name && d.name !== first ? [first, ...rest] : rest).slice(0, 4).join(', '),
        point: { latitude: Number(d.lat), longitude: Number(d.lon) },
      }
    })
    .filter((p) => Number.isFinite(p.point.latitude) && Number.isFinite(p.point.longitude))
  cache.set(key, places)
  return places
}

/**
 * "Find a place" search over OpenStreetMap Nominatim. It runs only when someone submits, never per
 * keystroke, and requests are spaced at least a second apart.
 */
export function PlaceSearch({ onPick, onSuggest }: { onPick: (p: Point, name: string) => void; onSuggest: () => void }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    if (query.length < 3 || busy) return
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    setError(null)
    try {
      setResults(await searchPlaces(query, ctl.signal))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setResults(null)
        setError(err instanceof Error && err.message.startsWith('Too many') ? err.message : "Search couldn't reach OpenStreetMap. Check the connection, or drag the pin instead.")
      }
    } finally {
      if (abort.current === ctl) setBusy(false)
    }
  }

  const clear = () => {
    setResults(null)
    setError(null)
  }

  return (
    <div className="relative flex flex-col gap-2.5">
      <form role="search" onSubmit={submit} className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Find a place
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a place"
            autoComplete="off"
            enterKeyHint="search"
            className={cn(inputClass, 'pl-10')}
          />
        </div>
        <Button type="submit" variant="secondary" loading={busy} disabled={q.trim().length < 3} className="shrink-0">
          Search
        </Button>
      </form>

      {error ? (
        <p role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-800">
          {error}
        </p>
      ) : null}

      {results ? (
        <div
          className="animate-reveal absolute inset-x-0 top-[calc(2.75rem+0.5rem)] z-[1100] overflow-hidden rounded-control border border-hairline-soft bg-canvas shadow-overlay"
          aria-live="polite"
          onKeyDown={(e) => e.key === 'Escape' && clear()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-hairline-soft py-1 pl-3.5 pr-1">
            <p className="text-xs font-semibold text-muted">{results.length ? `${results.length} ${results.length === 1 ? 'place' : 'places'} found` : 'No places found'}</p>
            <button type="button" onClick={clear} className={linkButtonClass} aria-label="Close search results">
              <X aria-hidden="true" />
            </button>
          </div>
          {results.length ? (
            <ul className="divide-y divide-hairline-soft">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.point, p.name)
                      clear()
                    }}
                    className="flex min-h-11 w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent-accessible" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                      {p.detail ? <span className="block truncate text-xs text-muted">{p.detail}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-3 text-sm text-muted">Try the hospital’s name with its town, or a postcode.</p>
          )}
          <p className="border-t border-hairline-soft px-3.5 py-1.5 text-[11px] text-muted">
            Search by{' '}
            <a href="https://nominatim.org" target="_blank" rel="noopener noreferrer" className="underline">
              Nominatim
            </a>{' '}
            · ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
              OpenStreetMap
            </a>{' '}
            contributors
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Suggested</span>
        <button
          type="button"
          onClick={onSuggest}
          className="ui-press inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-canvas px-3.5 text-sm font-semibold text-ink hover:border-ink/40 hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Hospital className="size-4 text-accent-accessible" aria-hidden="true" />
          {SUGGESTED_SITE.label}
          <span className="font-normal text-muted">· {SUGGESTED_SITE.radiusM} m</span>
        </button>
      </div>
    </div>
  )
}

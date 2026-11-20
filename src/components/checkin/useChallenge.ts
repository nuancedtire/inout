import { useCallback, useRef } from 'react'

/**
 * Keeps one server challenge ready before the person acts.
 *
 * Safari only lets a page open the Face ID sheet close to a tap. Fetching the challenge after the
 * tap can use up that window, so we fetch it ahead of time and hand it over synchronously when
 * the tap comes. Challenges live for 5 minutes on the server; we refresh after 4.
 */
const FRESH_FOR_MS = 4 * 60 * 1000

export function usePrefetched<T>(fetcher: () => Promise<T>) {
  const ref = useRef<{ at: number; value: T } | null>(null)
  const pending = useRef<Promise<T> | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const load = useCallback(() => {
    if (pending.current) return pending.current
    const p = fetcherRef.current()
      .then((value) => {
        ref.current = { at: Date.now(), value }
        return value
      })
      .finally(() => {
        pending.current = null
      })
    pending.current = p
    return p
  }, [])

  /** Warm the cache; errors are swallowed (the next `take` retries and surfaces them). */
  const prefetch = useCallback(() => {
    ref.current = null
    load().catch(() => {})
  }, [load])

  /** A fresh value now if one is ready, else a promise. The value is single-use. */
  const take = useCallback((): T | Promise<T> => {
    const cached = ref.current
    ref.current = null
    if (cached && Date.now() - cached.at < FRESH_FOR_MS) return cached.value
    return (pending.current ?? load()).then((v) => {
      ref.current = null
      return v
    })
  }, [load])

  const clear = useCallback(() => {
    ref.current = null
  }, [])

  return { prefetch, take, clear }
}

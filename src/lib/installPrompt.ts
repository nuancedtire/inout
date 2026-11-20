import { useEffect, useState } from 'react'
import { currentPlatform, isStandalone, type Platform } from './platform'

/**
 * "Add to Home Screen" support.
 * - Chromium fires `beforeinstallprompt`; we keep the event and replay it from our own button.
 * - iOS has no prompt API: we show illustrated Share › Add to Home Screen steps instead.
 * - Dismissing the card snoozes it for 7 days (per browser).
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const SNOOZE_KEY = 'inout-install-snoozed-until'
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Capture as early as this module loads on the client; the event can fire before React hydrates.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Pure: is the card snoozed at `now`, given the stored value? */
export function isSnoozed(stored: string | null, now: number): boolean {
  const until = Number(stored)
  return Number.isFinite(until) && until > now
}

function readSnooze(): string | null {
  try {
    return localStorage.getItem(SNOOZE_KEY)
  } catch {
    return null
  }
}

export function snoozeInstallCard(now = Date.now()) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS))
  } catch {
    // Private mode: the card simply returns next visit.
  }
}

export type InstallState =
  | { kind: 'hidden' }
  | { kind: 'prompt'; install: () => Promise<boolean> } // Chromium one-tap install
  | { kind: 'manual'; platform: Platform } // illustrated steps

/** Client-only (call after mount). */
export function useInstallState(): [InstallState, () => void] {
  const [, force] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const dismiss = () => {
    snoozeInstallCard()
    setDismissed(true)
  }

  if (dismissed || isStandalone() || isSnoozed(readSnooze(), Date.now())) return [{ kind: 'hidden' }, dismiss]
  if (deferred) {
    const event = deferred
    return [{
      kind: 'prompt',
      install: async () => {
        await event.prompt()
        const { outcome } = await event.userChoice
        deferred = null
        notify()
        return outcome === 'accepted'
      },
    }, dismiss]
  }
  const platform = currentPlatform()
  // Desktop browsers without an install prompt: nothing useful to suggest.
  if (platform === 'other') return [{ kind: 'hidden' }, dismiss]
  return [{ kind: 'manual', platform }, dismiss]
}

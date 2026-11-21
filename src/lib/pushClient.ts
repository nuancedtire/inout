/**
 * Browser side of shift-end reminders (Web Push). Everything here is client-only and tolerates
 * missing APIs; nothing throws except `subscribeToPush`, whose errors are already worded for staff.
 *
 * - iPhone/iPad only allow push for InOut added to the Home Screen (iOS 16.4+), and the
 *   permission prompt must come from a tap: `subscribeToPush` asks for permission first, before
 *   any await, so call it straight from the click handler.
 * - The service worker registers in production builds only, so reminders are offered there only.
 * - Local storage keeps the person's choice for UI state; the server's subscription row is what
 *   actually sends reminders.
 */
import { isStandalone, type Platform } from './platform'

export type PushAvailability = 'yes' | 'install' | 'no'
export type PushPermission = 'default' | 'granted' | 'denied'

const CHOICE_KEY = 'inout-reminders-v1'
const SNOOZE_KEY = 'inout-reminders-snoozed-until'
export const REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
const READY_TIMEOUT_MS = 10_000

function hasPushApis(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/**
 * Can this browser get reminders? 'install' on an iPhone/iPad browser tab (push needs the Home
 * Screen app), 'no' in development (no service worker) or without the APIs.
 */
export function pushAvailability(platform: Platform, production = import.meta.env.PROD): PushAvailability {
  if (!production || typeof window === 'undefined') return 'no'
  if (platform === 'ios' && !isStandalone()) return 'install'
  return hasPushApis() ? 'yes' : 'no'
}

export function pushPermission(): PushPermission {
  try {
    const p = Notification.permission
    return p === 'granted' || p === 'denied' ? p : 'default'
  } catch {
    return 'default'
  }
}

// ── Local choice ───────────────────────────────────────────────────────────────

export type ReminderChoice = 'on' | 'off' | null

/** The choice made on this phone by this staff member (another person's choice counts as none). */
export function readReminderChoice(staffId: number): ReminderChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null') as { staffId?: number; on?: boolean } | null
    if (!raw || raw.staffId !== staffId || typeof raw.on !== 'boolean') return null
    return raw.on ? 'on' : 'off'
  } catch {
    return null
  }
}

export function storeReminderChoice(staffId: number, choice: ReminderChoice) {
  try {
    if (choice === null) localStorage.removeItem(CHOICE_KEY)
    else localStorage.setItem(CHOICE_KEY, JSON.stringify({ staffId, on: choice === 'on' }))
  } catch {
    // Storage unavailable: the card simply comes back next visit.
  }
}

export function reminderSnoozed(now = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY))
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

export function snoozeReminders(now = Date.now()) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + REMINDER_SNOOZE_MS))
  } catch {
    // Storage unavailable.
  }
}

export function clearReminderSnooze() {
  try {
    localStorage.removeItem(SNOOZE_KEY)
  } catch {
    // Storage unavailable.
  }
}

// ── What to show ───────────────────────────────────────────────────────────────

export type ReminderPrompt =
  | 'none' // nothing to show (unknown yet, unavailable, snoozed or turned off)
  | 'offer' // "Remind me to check out"
  | 'install' // iPhone tab: add to Home Screen first
  | 'denied' // notifications blocked: how to allow them
  | 'on'

/**
 * Pure: which reminder card (if any) Home and the result screen show. Never nags: a dismissed
 * card is snoozed for 7 days, an explicit "off" hides the card for good (the menu still has the
 * switch), and the "blocked" help only appears after the person asked for reminders.
 */
export function reminderPrompt(input: {
  availability: PushAvailability
  permission: PushPermission
  /** Does this browser hold a push subscription? null while still checking. */
  subscribed: boolean | null
  choice: ReminderChoice
  snoozed: boolean
  /** The person tapped "Turn on" during this visit. */
  asked: boolean
}): ReminderPrompt {
  const { availability, permission, subscribed, choice, snoozed, asked } = input
  if (availability === 'no') return 'none'
  if (availability === 'install') return 'install'
  if (permission === 'denied') return (asked || (choice === 'on' && !snoozed)) ? 'denied' : 'none'
  if (subscribed === null) return 'none'
  if (choice === 'on' && subscribed && permission === 'granted') return 'on'
  if (choice === 'off' || snoozed) return 'none'
  return 'offer'
}

// ── Subscription ───────────────────────────────────────────────────────────────

export class PushSetupError extends Error {
  kind: 'denied' | 'dismissed' | 'failed'
  constructor(kind: PushSetupError['kind'], message: string) {
    super(message)
    this.name = 'PushSetupError'
    this.kind = kind
  }
}

/** VAPID public key (base64url) → bytes for `applicationServerKey`. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!hasPushApis()) return null
  return withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS)
}

/** This browser's current push subscription, or null (none, or no service worker yet). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!hasPushApis()) return null
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/** Ask permission (from the tap) and subscribe. Returns the subscription to send to the server. */
export function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  if (!hasPushApis()) return Promise.reject(new PushSetupError('failed', 'This browser can’t show notifications.'))
  // Must start inside the tap, before anything is awaited (iOS requires it).
  const asked = pushPermission() === 'granted' ? Promise.resolve<NotificationPermission>('granted') : Notification.requestPermission()
  return (async () => {
    const permission = await asked
    if (permission === 'denied') throw new PushSetupError('denied', 'Notifications are blocked for InOut.')
    if (permission !== 'granted') throw new PushSetupError('dismissed', 'Notifications weren’t allowed.')
    const reg = await registration()
    if (!reg) throw new PushSetupError('failed', 'InOut isn’t ready on this phone yet. Reload the page and try again.')
    const key = base64UrlToBytes(publicKey)
    let sub = await reg.pushManager.getSubscription()
    // A subscription made with a different server key can't be reused.
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
      await sub.unsubscribe().catch(() => false)
      sub = null
    }
    try {
      return sub ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    } catch {
      throw new PushSetupError('failed', 'Your phone’s notification service didn’t respond. Please try again.')
    }
  })()
}

/** Drop this browser's subscription (best effort). Returns its endpoint, if there was one. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => false)
  return endpoint
}

export type SubscriptionJSON = { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }

export function subscriptionJSON(sub: PushSubscription): SubscriptionJSON {
  const json = sub.toJSON() as { endpoint?: string; expirationTime?: number | null; keys?: { p256dh?: string; auth?: string } }
  return {
    endpoint: json.endpoint ?? sub.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  }
}

/** Where to re-allow notifications, in this browser's words. */
export function notificationSettingsSteps(platform: Platform, flavor: 'samsung' | 'standalone' | 'browser'): string {
  if (platform === 'ios') return 'Open Settings › Notifications › InOut and turn on Allow Notifications.'
  if (platform === 'android') {
    if (flavor === 'standalone') return 'Open Settings › Apps › InOut › Notifications and allow them.'
    if (flavor === 'samsung') return 'In Samsung Internet, tap ☰ › Settings › Sites and downloads › Notifications, then allow InOut.'
    return 'In Chrome, tap ⋮ › Settings › Site settings › Notifications, then allow InOut.'
  }
  return 'Open your browser’s site settings for InOut and allow notifications.'
}

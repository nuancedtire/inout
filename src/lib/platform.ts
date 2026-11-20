/**
 * Best-effort platform detection for wording only (never for security or feature gating).
 * iPadOS reports a Mac user agent, so a touch-capable "Macintosh" counts as iOS.
 */
export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return 'other'
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
}

export type UnlockCopy = {
  /** Short name for buttons: "Continue with Face ID". */
  name: string
  /** Every way the phone may unlock the passkey, for explanations. */
  long: string
  /** How to set a screen lock if the phone has none. */
  screenLockHelp: string
}

const COPY: Record<Platform, UnlockCopy> = {
  ios: {
    name: 'Face ID',
    long: 'Face ID or Touch ID',
    screenLockHelp: 'Open Settings › Face ID & Passcode and turn on a passcode, then try again.',
  },
  android: {
    name: 'fingerprint',
    long: 'fingerprint, face or screen lock',
    screenLockHelp: 'Open Settings › Security and set a screen lock (PIN, pattern or fingerprint), then try again.',
  },
  other: {
    name: 'screen lock',
    long: "your device's screen lock",
    screenLockHelp: "Turn on a screen lock or PIN in your device's settings, then try again.",
  },
}

export function unlockCopy(platform: Platform): UnlockCopy {
  return COPY[platform]
}

/** Launched from the Home Screen (installed web app) rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}

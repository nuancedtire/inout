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

/** Which browser's "Add to Home Screen" steps to show. Wording only. */
export type InstallFlavor =
  | 'ios-safari-26' // Share lives in the ••• menu of the compact bottom bar
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android-samsung'
  | 'android'
  | 'other'

export function detectInstallFlavor(userAgent: string, maxTouchPoints = 0): InstallFlavor {
  const platform = detectPlatform(userAgent, maxTouchPoints)
  if (platform === 'android') return /SamsungBrowser/i.test(userAgent) ? 'android-samsung' : 'android'
  if (platform !== 'ios') return 'other'
  if (/CriOS/i.test(userAgent)) return 'ios-chrome'
  if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)) return 'ios-other'
  // iOS 26 freezes the OS version in the UA; Safari's own "Version/" still says 26.
  const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1] ?? /OS (\d+)_/.exec(userAgent)?.[1] ?? 0)
  return version >= 26 ? 'ios-safari-26' : 'ios-safari'
}

export function currentInstallFlavor(): InstallFlavor {
  if (typeof navigator === 'undefined') return 'other'
  return detectInstallFlavor(navigator.userAgent, navigator.maxTouchPoints ?? 0)
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

/** Which "Turn on location" steps to show. Wording only. */
export type LocationFlavor =
  | 'ios-safari-26' // Website Settings live behind the page menu at the left of the address bar
  | 'ios-safari' // the "aA" Page Settings button
  | 'ios-home' // Home Screen web app: follows Safari Websites, no address bar
  | 'ios-chrome'
  | 'ios-other'
  | 'android-chrome'
  | 'android-chrome-app' // installed from Chrome: no address bar
  | 'android-samsung'
  | 'other'

export function detectLocationFlavor(userAgent: string, maxTouchPoints = 0, standalone = false): LocationFlavor {
  const install = detectInstallFlavor(userAgent, maxTouchPoints)
  switch (install) {
    case 'ios-safari-26':
    case 'ios-safari':
      return standalone ? 'ios-home' : install
    case 'ios-chrome':
    case 'ios-other':
      return install
    case 'android-samsung':
      return 'android-samsung'
    case 'android':
      return standalone ? 'android-chrome-app' : 'android-chrome'
    default:
      return 'other'
  }
}

export function currentLocationFlavor(): LocationFlavor {
  if (typeof navigator === 'undefined') return 'other'
  return detectLocationFlavor(navigator.userAgent, navigator.maxTouchPoints ?? 0, isStandalone())
}

/**
 * Friendly provider names for passkey AAGUIDs. Every entry was checked against the community
 * registry at github.com/passkeydeveloper/passkey-authenticator-aaguids (aaguid.json, fetched
 * 20 November 2026). Only commonly used providers are listed; unknown AAGUIDs fall back to a
 * label derived from the User-Agent. Apple's iCloud Keychain often reports an all-zero AAGUID.
 */
const AAGUID_LABELS: Record<string, string> = {
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'Apple Passwords',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud Keychain (Managed)',
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  'b78a0a55-6ef8-d246-a042-ba0f6d55050c': 'LastPass',
  'b84e4048-15dc-4dd0-8640-f4f60813c8af': 'NordPass',
  '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'Keeper',
  'f3809540-7f14-49c1-a8b3-8f813b225541': 'Enpass',
  '50726f74-6f6e-5061-7373-50726f746f6e': 'Proton Pass',
  'd3452668-01fd-4c12-926c-83a4204853aa': 'Microsoft Password Manager',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
  '771b48fd-d3d4-4f74-9232-fc157ab0507a': 'Edge on Mac',
  'b5397666-4885-aa6b-cebf-e52262a439a2': 'Chromium Browser',
  'fdb141b2-5d84-443e-8a35-4698c205a502': 'KeePassXC',
  'eaecdef2-1c31-5634-8639-f1cbd9c00a08': 'KeePassDX',
}

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000'

/** Coarse device label from a User-Agent string, for when the AAGUID is unknown or all-zero. */
export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/CrOS/i.test(userAgent)) return 'Chromebook'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return null
}

/** Friendly authenticator label: known provider name, else the UA-derived device, else null. */
export function passkeyLabel(aaguid: string | null | undefined, userAgent?: string | null): string | null {
  const key = aaguid?.toLowerCase()
  if (key && key !== ZERO_AAGUID && AAGUID_LABELS[key]) return AAGUID_LABELS[key]
  return deviceLabelFromUserAgent(userAgent)
}

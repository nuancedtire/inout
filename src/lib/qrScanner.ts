import jsQR from 'jsqr'

/** Daily QR tokens: 12 characters of RFC 4648 base32 (A–Z, 2–7). */
export const TOKEN_PATTERN = /^[A-Z2-7]{12}$/

/** Uppercase and drop anything that isn't part of the code (spaces, dashes, look-alike separators). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

/** "ABCDEFGHJKLM" → "ABCD EFGH JKLM" for display while typing. */
export function groupCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ')
}

export function isValidToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export type ScanOutcome =
  | { kind: 'token'; token: string }
  | { kind: 'foreign' } // a QR code, but not an InOut check-in code

/**
 * Accepts a check-in URL from this site (`https://host/?token=XXXX`) or a bare 12-character code.
 * URLs for other sites are refused so a look-alike poster cannot redirect the scanner.
 */
export function parseScannedText(text: string, origin?: string): ScanOutcome {
  const trimmed = text.trim()
  const bare = trimmed.toUpperCase()
  if (isValidToken(bare)) return { kind: 'token', token: bare }
  try {
    const url = new URL(trimmed)
    if (origin && url.origin !== origin) return { kind: 'foreign' }
    const token = url.searchParams.get('token')?.toUpperCase() ?? ''
    return isValidToken(token) ? { kind: 'token', token } : { kind: 'foreign' }
  } catch {
    return { kind: 'foreign' }
  }
}

export type CameraError = 'denied' | 'unavailable' | 'unsupported'

export function classifyCameraError(error: unknown): CameraError {
  const name = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException)
    ? (error as Error).name
    : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'TypeError') return 'unsupported'
  return 'unavailable'
}

export type ScannerHandle = { stop: () => void }

/**
 * Starts the rear camera on `video` and decodes frames on an offscreen canvas at about 10 fps.
 * Calls `onText` for each decoded QR payload. Always stop the handle (tracks are released).
 */
export async function startQrScanner(
  video: HTMLVideoElement,
  onText: (text: string) => void,
): Promise<ScannerHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Camera not supported'), { name: 'TypeError' })
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  const stop = () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    for (const track of stream.getTracks()) track.stop()
    if (video.srcObject === stream) video.srcObject = null
  }

  video.srcObject = stream
  video.setAttribute('playsinline', '')
  video.muted = true
  try {
    await video.play()
  } catch {
    // Autoplay can be refused before metadata loads; frames still arrive once it plays.
  }

  const tick = () => {
    if (stopped) return
    if (context && video.readyState >= 2 && video.videoWidth > 0) {
      // Decode a centred square crop, scaled down: faster, and matches the viewfinder.
      const side = Math.min(video.videoWidth, video.videoHeight)
      const size = Math.min(side, 640)
      canvas.width = size
      canvas.height = size
      const sx = (video.videoWidth - side) / 2
      const sy = (video.videoHeight - side) / 2
      context.drawImage(video, sx, sy, side, side, 0, 0, size, size)
      const image = context.getImageData(0, 0, size, size)
      const code = jsQR(image.data, size, size, { inversionAttempts: 'dontInvert' })
      if (code?.data) onText(code.data)
    }
    if (!stopped) timer = setTimeout(tick, 100)
  }
  tick()
  return { stop }
}

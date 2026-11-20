import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard, ScanLine } from 'lucide-react'
import {
  classifyCameraError,
  groupCode,
  isValidToken,
  normalizeCode,
  parseScannedText,
  startQrScanner,
  type CameraError,
  type ScannerHandle,
} from '#/lib/qrScanner'
import { BigButton, Notice, ScreenTitle, TextLink } from './ui'

type CameraState = 'starting' | 'live' | 'found' | CameraError | 'paused'

/**
 * "Scan today's QR": a live rear-camera scanner (for Home Screen launches and anyone without a
 * token), with typed-code entry as the fallback. The camera stops whenever the page is hidden.
 */
export function ScanScreen({ greetingName, notice, onToken }: {
  greetingName?: string | null
  notice?: { title: string; message: string } | null
  onToken: (token: string) => void
}) {
  const [mode, setMode] = useState<'camera' | 'code'>('camera')
  return (
    <div className="ck-screen flex flex-1 flex-col pt-4">
      <ScreenTitle
        eyebrow={greetingName ? `Hi ${greetingName}` : undefined}
        sub={mode === 'camera'
          ? 'Point your camera at the InOut QR code in the department.'
          : 'Type the 12-character code shown with today’s QR code. Ask the coordinator if you can’t see it.'}
      >
        {mode === 'camera' ? 'Scan today’s QR code' : 'Enter today’s code'}
      </ScreenTitle>

      {notice ? (
        <Notice tone="warning" role="alert" title={notice.title} className="mt-5">{notice.message}</Notice>
      ) : null}

      {mode === 'camera'
        ? <CameraScanner onToken={onToken} onTypeInstead={() => setMode('code')} />
        : <CodeEntry onToken={onToken} onUseCamera={() => setMode('camera')} />}
    </div>
  )
}

function CameraScanner({ onToken, onTypeInstead }: { onToken: (t: string) => void; onTypeInstead: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const handleRef = useRef<ScannerHandle | null>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [hint, setHint] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let cancelled = false
    let foreignTimer: ReturnType<typeof setTimeout> | null = null

    const stop = () => {
      handleRef.current?.stop()
      handleRef.current = null
    }

    const start = async () => {
      if (!videoRef.current || handleRef.current) return
      setState('starting')
      try {
        const handle = await startQrScanner(videoRef.current, (text) => {
          const outcome = parseScannedText(text, window.location.origin)
          if (outcome.kind === 'token') {
            stop()
            setState('found')
            // Let the green frame register before moving on.
            window.setTimeout(() => !cancelled && onTokenRef.current(outcome.token), 350)
          } else {
            setHint('That QR code isn’t for InOut. Look for the InOut poster.')
            if (foreignTimer) clearTimeout(foreignTimer)
            foreignTimer = setTimeout(() => setHint(null), 3000)
          }
        })
        if (cancelled) return handle.stop()
        handleRef.current = handle
        setState('live')
      } catch (e) {
        if (!cancelled) setState(classifyCameraError(e))
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop()
        setState((s) => (s === 'live' || s === 'starting' ? 'paused' : s))
      } else {
        void start()
      }
    }

    void start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      if (foreignTimer) clearTimeout(foreignTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [attempt])

  const failed = state === 'denied' || state === 'unavailable' || state === 'unsupported'

  return (
    <div className="mt-6 flex flex-1 flex-col">
      <div
        className={`relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[#111] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] ${state === 'found' ? 'ck-found' : ''}`}
      >
        <video
          ref={videoRef}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${state === 'live' || state === 'found' ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          aria-hidden="true"
        />
        {/* Viewfinder */}
        {!failed ? (
          <div className="pointer-events-none absolute inset-[14%]" aria-hidden="true">
            <svg className="ck-corners absolute inset-0 size-full" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
              <path d="M2 22V10a8 8 0 0 1 8-8h12M78 2h12a8 8 0 0 1 8 8v12M98 78v12a8 8 0 0 1-8 8H78M22 98H10a8 8 0 0 1-8-8V78" />
            </svg>
            {state === 'live' ? (
              <span className="ck-sweep absolute inset-x-[6%] h-0.5 rounded-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_12px_2px_rgba(255,255,255,0.5)]" />
            ) : null}
          </div>
        ) : null}

        {state === 'starting' || state === 'paused' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/85">
            <Camera className="size-8" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm font-medium">{state === 'paused' ? 'Camera paused' : 'Starting camera…'}</p>
          </div>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white">
            <CameraOff className="size-8 text-white/80" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-base font-semibold">
              {state === 'denied' ? 'Camera access is off' : 'Camera isn’t available'}
            </p>
            <p className="text-sm leading-relaxed text-white/75">
              {state === 'denied'
                ? 'Allow camera access for InOut in your browser settings, or type the code instead.'
                : 'You can type the code shown with today’s QR code instead.'}
            </p>
          </div>
        ) : null}

        {state === 'found' ? (
          <div className="absolute inset-x-0 bottom-4 flex justify-center" role="status">
            <span className="rounded-full bg-success-accessible px-4 py-1.5 text-sm font-semibold text-white">Code found</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-h-6 text-center text-sm text-body" role="status" aria-live="polite">
        {hint ?? (state === 'live' ? 'Hold steady — it scans automatically.' : '')}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {failed ? (
          <>
            <BigButton variant="ink" icon={<Keyboard className="size-5" aria-hidden="true" />} onClick={onTypeInstead}>
              Type the code
            </BigButton>
            {state !== 'unsupported' ? (
              <TextLink onClick={() => setAttempt((n) => n + 1)}>Try the camera again</TextLink>
            ) : null}
          </>
        ) : (
          <>
            {state === 'paused' ? (
              <BigButton variant="ink" icon={<ScanLine className="size-5" aria-hidden="true" />} onClick={() => setAttempt((n) => n + 1)}>
                Resume camera
              </BigButton>
            ) : null}
            <TextLink onClick={onTypeInstead}><Keyboard className="size-4" aria-hidden="true" />Can’t scan? Type the code</TextLink>
          </>
        )}
      </div>
    </div>
  )
}

function CodeEntry({ onToken, onUseCamera }: { onToken: (t: string) => void; onUseCamera: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidToken(code)) {
      setError(code.length < 12 ? 'The code has 12 letters and numbers.' : 'That code isn’t right. Check it against the poster.')
      return
    }
    onToken(code)
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-1 flex-col" noValidate>
      <label htmlFor="ck-code" className="sr-only">Today’s code</label>
      <input
        ref={inputRef}
        id="ck-code"
        value={groupCode(code)}
        onChange={(e) => {
          setError(null)
          setCode(normalizeCode(e.target.value))
        }}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ABCD EFGH JKLM"
        aria-invalid={error ? true : undefined}
        aria-describedby="ck-code-help"
        className="h-[72px] w-full rounded-[20px] border border-hairline bg-canvas px-5 text-center font-mono text-[1.625rem] font-semibold tracking-[0.12em] text-ink uppercase placeholder:text-neutral-400 outline-none focus:border-ink focus:ring-4 focus:ring-ink/8 aria-invalid:border-danger-600"
      />
      <p id="ck-code-help" className={`mt-2 text-center text-sm ${error ? 'text-danger-700' : 'text-muted'}`} role={error ? 'alert' : undefined}>
        {error ?? `${code.length} of 12`}
      </p>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <BigButton type="submit" variant="ink" disabled={code.length === 0}>Continue</BigButton>
        <TextLink onClick={onUseCamera}><Camera className="size-4" aria-hidden="true" />Use the camera instead</TextLink>
      </div>
    </form>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

/**
 * Slide-to-confirm control for check-in (slide right) and checkout (slide left).
 *
 * `onComplete` runs synchronously inside the releasing pointer/key event, so the caller can open
 * the Face ID sheet while the browser still counts the gesture as a user activation (Safari is
 * strict about this). `onArm` fires as the thumb is grabbed (used to warm up location) and
 * `onDisarm` if it is let go short of the end.
 */

const THUMB = 56
const PAD = 4
const THRESHOLD = 0.78
const SNAP = 'cubic-bezier(0.2, 0, 0, 1)'
const LAND = 'cubic-bezier(0.34, 1.4, 0.64, 1)'

type Phase = 'idle' | 'dragging' | 'done'

type Props = {
  mode: 'in' | 'out'
  onComplete: () => void
  onArm?: () => void
  onDisarm?: () => void
  disabled?: boolean
  /** Visible label, e.g. "Slide to check in". */
  label?: string
  /** Accessible name for the button alternative (screen readers), e.g. "Check in with Face ID". */
  actionLabel?: string
}

export function SlideToAction({ mode, onComplete, onArm, onDisarm, disabled = false, label, actionLabel }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const offsetRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const [trackW, setTrackW] = useState(0)
  const [offset, setOffset] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [animate, setAnimate] = useState<false | 'snap' | 'land'>(false)

  const maxDrag = Math.max(0, trackW - THUMB - 2 * PAD)
  // Check-in travels left→right; checkout right→left. `progress` is 0 at rest, 1 at the end.
  const rest = mode === 'in' ? 0 : maxDrag
  const end = mode === 'in' ? maxDrag : 0
  const progress = maxDrag > 0 ? Math.abs(offset - rest) / maxDrag : 0
  const interactive = !disabled && phase !== 'done'

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => setTrackW(el.offsetWidth)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  // Reset to rest when the mode changes or the track is measured.
  useEffect(() => {
    phaseRef.current = 'idle'
    setPhase('idle')
    offsetRef.current = rest
    setOffset(rest)
  }, [mode, rest])

  const move = (next: number) => {
    offsetRef.current = next
    setOffset(next)
  }

  const settle = (to: number, how: 'snap' | 'land') => {
    setAnimate(how)
    move(to)
    window.setTimeout(() => setAnimate(false), 420)
  }

  const complete = useCallback(() => {
    if (phaseRef.current === 'done') return
    phaseRef.current = 'done'
    setPhase('done')
    settle(end, 'land')
    try {
      navigator.vibrate?.(12)
    } catch {
      // Not supported.
    }
    onComplete()
  }, [end, onComplete])

  const release = useCallback(() => {
    if (phaseRef.current !== 'dragging') return
    const prog = maxDrag > 0 ? Math.abs(offsetRef.current - rest) / maxDrag : 0
    if (prog >= THRESHOLD) {
      complete()
    } else {
      phaseRef.current = 'idle'
      setPhase('idle')
      settle(rest, 'snap')
      onDisarm?.()
    }
  }, [complete, maxDrag, rest, onDisarm])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || maxDrag === 0) return
    e.preventDefault()
    trackRef.current?.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    startOffset.current = offsetRef.current
    phaseRef.current = 'dragging'
    setPhase('dragging')
    setAnimate(false)
    onArm?.()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'dragging') return
    move(Math.max(0, Math.min(startOffset.current + e.clientX - startX.current, maxDrag)))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const track = trackRef.current
    if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
    release()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return
    const STEP = Math.max(24, maxDrag / 6)
    let next = offsetRef.current
    switch (e.key) {
      case 'ArrowRight': next += STEP; break
      case 'ArrowLeft': next -= STEP; break
      case 'Home': next = 0; break
      case 'End': next = maxDrag; break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (!e.repeat) {
          onArm?.()
          complete()
        }
        return
      default: return
    }
    e.preventDefault()
    if (phaseRef.current !== 'dragging') {
      phaseRef.current = 'dragging'
      setPhase('dragging')
      onArm?.()
    }
    move(Math.max(0, Math.min(next, maxDrag)))
  }

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) release()
  }

  const inMode = mode === 'in'
  const text = label ?? (inMode ? 'Slide to check in' : 'Slide to check out')
  const transition = animate === 'land'
    ? `left 420ms ${LAND}, width 420ms ${LAND}`
    : animate === 'snap'
      ? `left 360ms ${SNAP}, width 360ms ${SNAP}`
      : 'none'
  const thumbLeft = PAD + offset
  const fill = inMode
    ? { left: PAD, width: offset + THUMB }
    : { left: thumbLeft, width: maxDrag - offset + THUMB }
  const Arrow = inMode ? ArrowRight : ArrowLeft

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={phase === 'done' ? 'Done' : `${Math.round(progress * 100)}%`}
        aria-disabled={!interactive || undefined}
        aria-keyshortcuts="Enter"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className={[
          'relative h-16 touch-none overflow-hidden rounded-full bg-surface-strong',
          'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06),inset_0_2px_4px_rgba(0,0,0,0.05)]',
          'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus',
          interactive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        {/* Fill trails the thumb. */}
        <div
          aria-hidden="true"
          className={`absolute rounded-full ${inMode ? (phase === 'done' ? 'bg-success-accessible' : 'bg-primary-500') : 'bg-ink'}`}
          style={{ ...fill, top: PAD, bottom: PAD, transition, opacity: Math.min(1, 0.25 + progress) }}
        />

        {/* Label fades as the thumb travels. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[0.9375rem] font-semibold ${inMode ? 'pl-12' : 'pr-12'}`}
          style={{ opacity: phase === 'done' ? 0 : Math.max(0, 1 - progress / 0.4) }}
        >
          <span className="text-body">{text}</span>
        </div>

        {/* Thumb */}
        <div
          aria-hidden="true"
          className={[
            'pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-300',
            inMode
              ? phase === 'done'
                ? 'bg-success-accessible text-white shadow-[0_4px_12px_-2px_rgba(0,138,5,0.45)]'
                : 'bg-accent-accessible text-white shadow-[0_4px_12px_-2px_rgba(213,11,64,0.45)]'
              : 'bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.18)]',
          ].join(' ')}
          style={{ width: THUMB, height: THUMB, left: thumbLeft, transition: transition === 'none' ? undefined : transition }}
        >
          {phase === 'done' ? (
            <Check className="size-6" strokeWidth={2.75} />
          ) : (
            <Arrow className="size-6" strokeWidth={2.5} />
          )}
        </div>
      </div>

      {/* Screen readers: a plain button alternative (not in the tab order; the slider handles Enter). */}
      <button type="button" tabIndex={-1} className="sr-only" disabled={!interactive} onClick={() => { onArm?.(); complete() }}>
        {actionLabel ?? (inMode ? 'Check in' : 'Check out')}
      </button>
    </div>
  )
}

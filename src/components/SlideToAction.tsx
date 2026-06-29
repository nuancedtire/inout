import { useRef, useState, useCallback, useEffect } from 'react'
import { ChevronRight, ChevronLeft, Loader2, Clock, LogOut } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

// ── Constants ─────────────────────────────────────────────────────────────────
const THUMB = 48
const PAD = 4
const SPRING = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
const ANIM_MS = 450
const SNAP_MS = 380
const THRESHOLD = 0.72

type Status = 'idle' | 'dragging' | 'completing' | 'loading' | 'confirming'

// ── Live elapsed-time hook ────────────────────────────────────────────────────
function useElapsed(checkInAt: string | null) {
  const compute = () => {
    if (!checkInAt) return ''
    const ms = Date.now() - new Date(checkInAt).getTime()
    const m = Math.floor(ms / 60_000)
    const h = Math.floor(m / 60)
    const rm = m % 60
    return h === 0 ? `${m}m` : rm === 0 ? `${h}h` : `${h}h ${rm}m`
  }
  const [t, setT] = useState(compute)
  useEffect(() => {
    if (!checkInAt) return
    setT(compute())
    const id = setInterval(() => setT(compute()), 30_000)
    return () => clearInterval(id)
  }, [checkInAt])
  return t
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  mode: 'in' | 'out'
  checkInAt?: string | null
  onCheckIn: () => Promise<void>
  onCheckOut: () => Promise<void>
  disabled?: boolean
}

export function SlideToAction({ mode, checkInAt, onCheckIn, onCheckOut, disabled = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Mutable mirror of offset so pointer handlers always read the latest value
  const offsetRef = useRef(0)
  // Track where the pointer and thumb were when the drag started (relative drag)
  const pointerStartXRef = useRef(0)
  const thumbStartRef = useRef(0)

  const elapsed = useElapsed(mode === 'out' ? (checkInAt ?? null) : null)

  const [offset, setOffset] = useState(0)
  const [trackW, setTrackW] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [anim, setAnim] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const maxDrag = Math.max(0, trackW - THUMB - 2 * PAD)
  const natural = mode === 'out' ? maxDrag : 0

  // ── Measure track ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTrackW(el.offsetWidth))
    ro.observe(el)
    setTrackW(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  // ── Sync thumb to natural position on mode change or first measure ──────────
  const prevModeRef = useRef(mode)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (maxDrag === 0) return

    if (!initializedRef.current) {
      initializedRef.current = true
      offsetRef.current = natural
      setOffset(natural)
      return
    }

    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode
      setConfirm(false)
      setStatus('idle')
      setAnim(true)
      offsetRef.current = natural
      setOffset(natural)
      setTimeout(() => setAnim(false), ANIM_MS)
    }
  }, [mode, natural, maxDrag])

  // ── Derived values ──────────────────────────────────────────────────────────
  const thumbLeft = PAD + offset
  const progress = maxDrag > 0
    ? mode === 'in' ? offset / maxDrag : (maxDrag - offset) / maxDrag
    : 0
  const labelOpacity = Math.max(0, 1 - progress / 0.45)

  // Fill sweeps L→R for check-in (green), R→L for check-out (red)
  const fillStyle: React.CSSProperties = mode === 'in'
    ? { left: 0, width: PAD + offset + THUMB }
    : { right: 0, width: trackW - thumbLeft }

  const interactive = !disabled && status !== 'completing' && status !== 'loading' && status !== 'confirming'

  // ── Pointer handlers ────────────────────────────────────────────────────────
  const onDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return
    e.preventDefault()
    const track = trackRef.current
    if (!track) return
    track.setPointerCapture(e.pointerId)
    // Relative drag: record where we started
    pointerStartXRef.current = e.clientX
    thumbStartRef.current = offsetRef.current
    setAnim(false)
    setStatus('dragging')
  }, [interactive])

  const onMove = useCallback((e: React.PointerEvent) => {
    if (status !== 'dragging') return
    const dx = e.clientX - pointerStartXRef.current
    const next = Math.max(0, Math.min(thumbStartRef.current + dx, maxDrag))
    offsetRef.current = next
    setOffset(next)
  }, [status, maxDrag])

  const onUp = useCallback(async (e: React.PointerEvent) => {
    if (status !== 'dragging') return
    const track = trackRef.current
    if (!track) return
    track.releasePointerCapture(e.pointerId)

    const cur = offsetRef.current
    const prog = mode === 'in' ? cur / maxDrag : (maxDrag - cur) / maxDrag

    if (prog >= THRESHOLD) {
      if (mode === 'in') {
        // ── Complete check-in ───────────────────────────────────────────────
        setStatus('completing')
        setAnim(true)
        offsetRef.current = maxDrag
        setOffset(maxDrag)
        await new Promise(r => setTimeout(r, ANIM_MS))
        setAnim(false)
        setStatus('loading')
        try {
          await onCheckIn()
          // mode prop will flip to 'out', effect handles thumb position
        } catch {
          setStatus('idle')
          setAnim(true)
          offsetRef.current = 0
          setOffset(0)
          setTimeout(() => setAnim(false), SNAP_MS)
        }
      } else {
        // ── Threshold reached → snap left and show confirmation ─────────────
        setStatus('completing')
        setAnim(true)
        offsetRef.current = 0
        setOffset(0)
        await new Promise(r => setTimeout(r, ANIM_MS))
        setAnim(false)
        setStatus('confirming')
        setConfirm(true)
      }
    } else {
      // ── Below threshold → spring back to natural position ──────────────────
      setStatus('idle')
      setAnim(true)
      offsetRef.current = natural
      setOffset(natural)
      setTimeout(() => setAnim(false), SNAP_MS)
    }
  }, [status, mode, maxDrag, natural, onCheckIn])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (!interactive) return
    const STEP = 24
    let next = offsetRef.current
    if (e.key === 'ArrowRight') { e.preventDefault(); next = Math.min(next + STEP, maxDrag) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); next = Math.max(next - STEP, 0) }
    else return
    offsetRef.current = next
    setOffset(next)
    setStatus('dragging')
  }, [interactive, maxDrag])

  // ── Confirmation actions ────────────────────────────────────────────────────
  const onCancel = useCallback(() => {
    setConfirm(false)
    setStatus('idle')
    setAnim(true)
    offsetRef.current = maxDrag
    setOffset(maxDrag)
    setTimeout(() => setAnim(false), SNAP_MS)
  }, [maxDrag])

  const onConfirmOut = useCallback(async () => {
    setConfirm(false)
    setStatus('loading')
    try {
      await onCheckOut()
      // mode flips to 'in', effect resets thumb
    } catch {
      setStatus('idle')
      setAnim(true)
      offsetRef.current = maxDrag
      setOffset(maxDrag)
      setTimeout(() => setAnim(false), SNAP_MS)
    }
  }, [onCheckOut, maxDrag])

  // ── Thumb icon ───────────────────────────────────────────────────────────────
  const thumbIcon = (() => {
    if (status === 'loading') return <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
    if (status === 'confirming') return <LogOut className="w-5 h-5 text-danger-500" />
    if (mode === 'out') {
      if (progress > 0.2) return <ChevronLeft className="w-5 h-5 text-danger-500" />
      return <ChevronLeft className="w-5 h-5 text-neutral-400" />
    }
    if (progress > 0.2) return <ChevronRight className="w-5 h-5 text-success-600" />
    return <ChevronRight className="w-5 h-5 text-neutral-400" />
  })()

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 select-none touch-none">

      {/* ── Checked-in status row ─────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {mode === 'out' && checkInAt && (
          <motion.div
            key="checkin-status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2 px-1"
          >
            <Clock className="w-3.5 h-3.5 shrink-0 text-success-600" />
            <span className="text-sm font-medium text-success-700">
              Since {fmtTime(checkInAt)}
            </span>
            <span className="text-neutral-300">·</span>
            <span className="text-sm font-bold tabular-nums text-success-700">{elapsed}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Slider track ──────────────────────────────────────────────────────── */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label={mode === 'in' ? 'Slide right to check in' : 'Slide left to check out'}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={[
          'relative h-14 rounded-full overflow-hidden',
          'bg-neutral-100 border border-neutral-200 shadow-sm',
          interactive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        {/* Color fill */}
        <div
          className={`absolute inset-y-0 ${mode === 'in' ? 'bg-success-500' : 'bg-danger-400'}`}
          style={{
            ...fillStyle,
            opacity: 0.9,
            transition: anim ? `all ${ANIM_MS}ms ${SPRING}` : 'none',
          }}
        />

        {/* Center label — fades as thumb travels */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-medium text-neutral-500 pointer-events-none"
          style={{ opacity: labelOpacity, transition: 'opacity 80ms linear' }}
        >
          {mode === 'out'
            ? <><Clock className="w-3.5 h-3.5" /><span>slide left to check out</span></>
            : <><span>slide to check in</span><ChevronRight className="w-3.5 h-3.5 opacity-40" /></>
          }
        </div>

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-md flex items-center justify-center pointer-events-none"
          style={{
            width: THUMB,
            height: THUMB,
            left: thumbLeft,
            transition: anim ? `left ${ANIM_MS}ms ${SPRING}` : 'none',
          }}
        >
          {thumbIcon}
        </div>
      </div>

      {/* ── Confirmation panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mt-1 rounded-2xl border border-danger-100 bg-canvas px-4 py-4"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                  <LogOut className="w-4 h-4 text-danger-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Check out?</p>
                  {checkInAt && (
                    <p className="text-xs text-muted mt-0.5">
                      Checked in at {fmtTime(checkInAt)} · {elapsed} ago
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-2.5 text-sm font-medium text-ink border border-hairline rounded-xl hover:bg-surface-soft transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirmOut}
                  disabled={status === 'loading'}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-danger-600 rounded-xl hover:bg-danger-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                >
                  {status === 'loading'
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking out…</>
                    : 'Check out'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

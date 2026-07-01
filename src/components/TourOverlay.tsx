import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTour } from '#/lib/tour/TourContext'
import { SPRING_PANEL } from '#/lib/ease'

const SPOTLIGHT_PADDING = 8
const MAX_RESOLVE_ATTEMPTS = 90 // ~1.5s at 60fps

type Rect = { top: number; left: number; width: number; height: number }

function rectFromEl(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function resolveTarget(selectors: string[] | null): HTMLElement | null {
  if (!selectors) return null
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el && el.getClientRects().length > 0) return el
  }
  return null
}

/** Positions the tooltip card relative to the highlighted rect, clamped to the viewport. */
function placeTooltip(rect: Rect, cardWidth: number, cardHeight: number) {
  const margin = 16
  const vw = window.innerWidth
  const vh = window.innerHeight

  const spaceBelow = vh - (rect.top + rect.height)
  const spaceAbove = rect.top
  const placeBelow = spaceBelow >= cardHeight + margin || spaceBelow >= spaceAbove

  const top = placeBelow
    ? Math.min(rect.top + rect.height + margin, vh - cardHeight - margin)
    : Math.max(rect.top - cardHeight - margin, margin)

  let left = rect.left + rect.width / 2 - cardWidth / 2
  left = Math.max(margin, Math.min(left, vw - cardWidth - margin))

  return { top: Math.max(margin, top), left }
}

export function TourOverlay() {
  const { active, step, stepIndex, totalSteps, next, back, skip } = useTour()
  const reduceMotion = useReducedMotion() ?? false
  const [rect, setRect] = useState<Rect | null>(null)
  const [resolved, setResolved] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)

  // Resolve + track the current step's target element
  useLayoutEffect(() => {
    if (!active || !step) {
      setRect(null)
      setResolved(false)
      return
    }
    if (!step.target) {
      setRect(null)
      setResolved(true)
      return
    }

    setResolved(false)
    let cancelled = false
    let attempts = 0
    let scrolled = false
    let raf = 0

    const tick = () => {
      if (cancelled) return
      const el = resolveTarget(step.target)
      if (el) {
        // Show immediately at the best-known position, then correct once the
        // scroll settles — avoids a blank gap while scrolling into view.
        setRect(rectFromEl(el))
        setResolved(true)
        if (!scrolled) {
          scrolled = true
          el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
          window.setTimeout(() => {
            if (!cancelled) setRect(rectFromEl(el))
          }, reduceMotion ? 0 : 350)
        }
        return
      }
      attempts += 1
      if (attempts >= MAX_RESOLVE_ATTEMPTS) {
        // Couldn't find it (e.g. slow data load) — fall back to a centered card rather than getting stuck
        setRect(null)
        setResolved(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [active, step, reduceMotion])

  // Recompute on resize while a target is active. Scroll isn't tracked here:
  // the backdrop blocks background interaction, and our own scrollIntoView
  // call (above) already fires scroll events — listening for those too would
  // fight itself, chasing a moving target on every intermediate scroll frame.
  useEffect(() => {
    if (!active || !step?.target) return
    const onResize = () => {
      const el = resolveTarget(step.target)
      if (el) setRect(rectFromEl(el))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active, step])

  // Position the tooltip card once we know its size. Computed in plain
  // pixels (not CSS transform) because Motion's own transform animation on
  // this element (for the enter/exit y-slide) writes directly to
  // element.style.transform and would otherwise clobber a transform-based
  // centering offset.
  useLayoutEffect(() => {
    if (!resolved) return
    const card = cardRef.current
    if (!card) return
    const { width, height } = card.getBoundingClientRect()
    if (!rect) {
      setCardPos({
        top: Math.max(16, (window.innerHeight - height) / 2),
        left: Math.max(16, (window.innerWidth - width) / 2),
      })
      return
    }
    setCardPos(placeTooltip(rect, width, height))
  }, [rect, resolved, step])

  // Focus + Escape handling per step, with a small focus trap so Tab can't
  // escape into the (visually obscured) page behind the overlay
  useEffect(() => {
    if (!active || !resolved) return
    cardRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
        return
      }
      if (e.key === 'Tab') {
        const card = cardRef.current
        if (!card) return
        const focusable = card.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, resolved, step, skip])

  if (!active || !step || !resolved) return null

  const isLast = stepIndex === totalSteps - 1

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {/* Backdrop + spotlight cutout */}
      {rect ? (
        <motion.div
          className="fixed rounded-2xl ring-2 ring-primary-500"
          initial={false}
          animate={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
          transition={reduceMotion ? { duration: 0 } : SPRING_PANEL}
          style={{ boxShadow: '0 0 0 9999px rgba(20,20,20,0.6)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(20,20,20,0.6)]" />
      )}

      {/* Tooltip / centered card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={cardRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-step-title"
          aria-describedby="tour-step-body"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduceMotion ? { duration: 0.1 } : SPRING_PANEL}
          className="fixed w-[min(360px,calc(100vw-2rem))] bg-canvas rounded-2xl p-5 outline-none"
          style={{
            boxShadow: 'var(--shadow-hover)',
            top: cardPos?.top ?? -9999,
            left: cardPos?.left ?? -9999,
            visibility: cardPos ? 'visible' : 'hidden',
            transition: reduceMotion ? undefined : 'top 300ms ease, left 300ms ease',
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Step {stepIndex + 1} of {totalSteps}
            </p>
            <button
              onClick={skip}
              aria-label="Skip tour"
              className="text-muted hover:text-ink -m-1 p-1 rounded-full hover:bg-surface-soft transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="h-1 bg-surface-strong rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>

          <h2 id="tour-step-title" className="font-semibold text-ink mb-1.5">
            {step.title}
          </h2>
          <p id="tour-step-body" className="text-sm text-body leading-relaxed">
            {step.body}
          </p>

          <div className="flex items-center justify-between mt-5">
            <button
              onClick={back}
              disabled={stepIndex === 0}
              className="flex items-center gap-1 text-sm text-muted hover:text-ink disabled:opacity-0 disabled:pointer-events-none transition-opacity"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <button onClick={skip} className="text-sm text-muted hover:text-ink transition-colors">
                Skip
              </button>
              <button
                onClick={next}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 active:scale-[0.98] transition-all"
              >
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}

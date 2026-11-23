import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTour } from '#/lib/tour/TourContext'
import { Button } from './Button'
import { SPRING_PANEL } from '#/lib/ease'

const SPOTLIGHT_PADDING = 8
const MAX_RESOLVE_ATTEMPTS = 90 // ~1.5s at 60fps
const SETTLE_FRAMES = 4 // a moved target must hold still this long before the spotlight follows
const BACKDROP = 'rgba(20,20,20,0.6)'

type Rect = { top: number; left: number; width: number; height: number }

function rectFromEl(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function sameRect(a: Rect, b: Rect) {
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
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
  const need = cardWidth + margin + SPOTLIGHT_PADDING

  // A tall target leaves no room above or below: sit beside it if the
  // viewport is wide enough, rather than covering part of it.
  if (spaceBelow < cardHeight + margin && spaceAbove < cardHeight + margin) {
    const spaceLeft = rect.left
    const spaceRight = vw - (rect.left + rect.width)
    if (Math.max(spaceLeft, spaceRight) >= need + margin) {
      const left =
        spaceRight >= spaceLeft
          ? rect.left + rect.width + SPOTLIGHT_PADDING + margin
          : rect.left - SPOTLIGHT_PADDING - margin - cardWidth
      const visibleTop = Math.max(rect.top, 0)
      const visibleBottom = Math.min(rect.top + rect.height, vh)
      const top = (visibleTop + visibleBottom) / 2 - cardHeight / 2
      return { top: Math.max(margin, Math.min(top, vh - cardHeight - margin)), left }
    }
  }

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

  // Resolve + track the current step's target element. One frame loop runs
  // for the whole step: it finds the target (which may only appear once the
  // page's data has loaded), scrolls it into view once, and then re-commits
  // the spotlight whenever the target has moved and come to rest again —
  // after the smooth scroll, a late layout shift, a resize or the admin
  // scrolling the page. Only settled positions are committed, so the
  // spotlight never chases a scroll frame by frame.
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
    let frames = 0
    let tracked: HTMLElement | null = null
    let last: Rect | null = null
    let stableFrames = 0
    let raf = 0

    const tick = () => {
      if (cancelled) return
      frames += 1
      const el = resolveTarget(step.target)
      if (el) {
        const r = rectFromEl(el)
        if (tracked !== el) {
          // Show immediately at the best-known position, then correct once
          // the scroll settles — avoids a blank gap while scrolling into view.
          tracked = el
          last = r
          stableFrames = 0
          setRect(r)
          setResolved(true)
          el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
        } else if (last && sameRect(last, r)) {
          stableFrames += 1
          if (stableFrames === SETTLE_FRAMES) setRect((prev) => (prev && sameRect(prev, r) ? prev : r))
        } else {
          last = r
          stableFrames = 0
        }
      } else if (tracked) {
        // The target went away (e.g. the page fell back to a skeleton).
        tracked = null
        last = null
        setRect(null)
      } else if (frames === MAX_RESOLVE_ATTEMPTS) {
        // Not there yet (e.g. slow data load) — show a centered card rather
        // than getting stuck. The loop keeps looking, so the spotlight still
        // appears if the target turns up later.
        setRect(null)
        setResolved(true)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [active, step, reduceMotion])

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
        if (!card.contains(document.activeElement) || document.activeElement === card) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        } else if (e.shiftKey && document.activeElement === first) {
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

  if (!active || !step) return null

  // Still looking for the target (usually one frame; longer right after a
  // page change): keep the page dimmed and blocked rather than flashing it.
  if (!resolved) {
    return createPortal(
      <div className="fixed inset-0 z-[200]" role="presentation" style={{ background: BACKDROP }} onClick={(e) => e.stopPropagation()} />,
      document.body,
    )
  }

  const isLast = stepIndex === totalSteps - 1

  return createPortal(
    <div className="fixed inset-0 z-[200]" onClick={(e) => e.stopPropagation()} role="presentation">
      {/* Backdrop + spotlight cutout */}
      {rect ? (
        <motion.div
          className="fixed rounded-card ring-2 ring-primary-500"
          initial={false}
          animate={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
          transition={reduceMotion ? { duration: 0 } : SPRING_PANEL}
          style={{ boxShadow: `0 0 0 9999px ${BACKDROP}` }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: BACKDROP }} />
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
          className="fixed w-[min(360px,calc(100vw-2rem))] bg-canvas rounded-card p-5 outline-none"
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
              className="ui-press -m-2 flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="h-1 bg-surface-strong rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-accent-accessible rounded-full transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>

          <h2 id="tour-step-title" className="text-base font-semibold text-ink mb-1.5">
            {step.title}
          </h2>
          <p id="tour-step-body" className="text-sm text-body leading-relaxed">
            {step.body}
          </p>

          <div className="flex items-center justify-between mt-5">
            <button
              onClick={back}
              disabled={stepIndex === 0}
              className="ui-press -ml-2 flex min-h-9 items-center gap-1 rounded-control px-2 text-sm font-medium text-muted hover:bg-surface-soft hover:text-ink disabled:opacity-0 disabled:pointer-events-none"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={skip}
                className="ui-press flex min-h-9 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-surface-soft hover:text-ink"
              >
                Skip
              </button>
              <Button size="sm" onClick={next}>
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}

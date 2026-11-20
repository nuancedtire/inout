import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { RUNNER_GRADIENT_Y, RUNNER_MATRIX, RUNNER_PATHS, RUNNER_VIEWBOX } from './runnerArt'

export type RunnerAnimation = 'run' | 'idle' | 'none'
export type RunnerTone = 'brand' | 'ink' | 'white' | 'current'

export type RunnerMarkProps = {
  /** Rendered width and height. Numbers are pixels; strings accept any CSS length (e.g. `'1.6em'`). */
  size?: number | string
  /**
   * `run`  – continuous stride, for working/loading states. Lands on the next footfall when it stops.
   * `idle` – one stride on mount and whenever the pointer enters the mark (or the nearest ancestor with
   *          `data-runner-hover`), then rests.
   * `none` – the static logo.
   */
  animate?: RunnerAnimation
  /** `brand` gradient for light surfaces, `ink`, `white` for brand/dark surfaces, `current` = currentColor. */
  tone?: RunnerTone
  /** Accessible name. Omit for a decorative mark (hidden from assistive technology). */
  label?: string
  className?: string
  style?: CSSProperties
}

const TONE_FILL: Record<Exclude<RunnerTone, 'brand'>, string> = {
  ink: 'var(--color-ink, #222222)',
  white: '#ffffff',
  current: 'currentColor',
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * The InOut runner. At rest it is pixel-identical to the original logo; when animated, the figure's own
 * parts (shin, rear leg, arm, head, speed lines) are rigged at their true joints. See `brand/runner.css`.
 */
export function RunnerMark({ size = 32, animate = 'none', tone = 'brand', label, className, style }: RunnerMarkProps) {
  const gradientId = `rm-g-${useId().replace(/[^\w-]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)
  // `mode` trails `animate` while a running stride lands, so the figure never snaps mid-pose.
  const [mode, setMode] = useState<RunnerAnimation>(animate)
  const [playing, setPlaying] = useState(animate === 'idle')

  useEffect(() => {
    const svg = ref.current
    const animations = svg && typeof svg.getAnimations === 'function' ? svg.getAnimations({ subtree: true }) : []

    if (animate === 'run') {
      // Resuming during a landing: cancel the pending stop.
      for (const animation of animations) animation.effect?.updateTiming({ iterations: Infinity })
      setMode('run')
      return
    }
    if (mode !== 'run') {
      setMode(animate)
      setPlaying(animate === 'idle')
      return
    }

    let cancelled = false
    const settle = () => {
      if (cancelled) return
      setMode(animate)
      setPlaying(false)
    }
    if (!animations.length || prefersReducedMotion() || svg?.hasAttribute('data-offscreen')) {
      settle()
      return
    }
    // Finish the current cycle of every part; each one ends on its rest pose.
    for (const animation of animations) {
      const iteration = animation.effect?.getComputedTiming().currentIteration
      if (iteration != null) animation.effect?.updateTiming({ iterations: iteration + 1 })
    }
    Promise.all(animations.map((animation) => animation.finished)).then(settle, settle)
    return () => {
      cancelled = true
    }
    // Only `animate` drives this effect; `mode` is read as the previous state on purpose.
  }, [animate])

  // Idle: replay one stride on hover.
  useEffect(() => {
    if (mode !== 'idle') return
    const svg = ref.current
    if (!svg) return
    const striding = () =>
      typeof svg.getAnimations === 'function' &&
      svg
        .getAnimations({ subtree: true })
        .some((a) => (a as CSSAnimation).animationName === 'rm-body' && a.playState === 'running')
    // A server-rendered intro stride can finish before hydration attaches onAnimationEnd.
    if (!striding()) setPlaying(false)

    let frame = 0
    const host = svg.closest<HTMLElement | SVGElement>('[data-runner-hover]') ?? svg
    const replay = () => {
      if (striding()) return
      // Drop and re-add the attribute on the next frame so the stride restarts from its first pose.
      setPlaying(false)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPlaying(true))
    }
    host.addEventListener('pointerenter', replay)
    return () => {
      cancelAnimationFrame(frame)
      host.removeEventListener('pointerenter', replay)
    }
  }, [mode])

  // Running: pause while scrolled out of view.
  useEffect(() => {
    if (mode !== 'run' || typeof IntersectionObserver === 'undefined') return
    const svg = ref.current
    if (!svg) return
    const observer = new IntersectionObserver(([entry]) => {
      svg.toggleAttribute('data-offscreen', !entry.isIntersecting)
    })
    observer.observe(svg)
    return () => {
      observer.disconnect()
      svg.removeAttribute('data-offscreen')
    }
  }, [mode])

  const fill = tone === 'brand' ? `url(#${gradientId})` : TONE_FILL[tone]
  const part = (d: string) => <path transform={RUNNER_MATRIX} d={d} />

  return (
    <svg
      ref={ref}
      className={['rm', className].filter(Boolean).join(' ')}
      style={style}
      width={size}
      height={size}
      viewBox={RUNNER_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      data-animate={mode}
      data-playing={mode === 'idle' && playing ? '' : undefined}
      onAnimationEnd={(event) => {
        if (event.animationName === 'rm-body') setPlaying(false)
      }}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {tone === 'brand' ? (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            x2="0"
            y1={RUNNER_GRADIENT_Y[0]}
            y2={RUNNER_GRADIENT_Y[1]}
          >
            <stop offset="0" stopColor="#ff6b81" />
            <stop offset="1" stopColor="#e00b41" />
          </linearGradient>
        </defs>
      ) : null}
      {mode === 'none' ? (
        <path transform={RUNNER_MATRIX} d={RUNNER_PATHS.static} fill={fill} fillRule="evenodd" />
      ) : (
        <g fill={fill} fillRule="evenodd">
          <g className="rm-part rm-trail rm-trail-1">{part(RUNNER_PATHS.trail1)}</g>
          <g className="rm-part rm-trail rm-trail-0">{part(RUNNER_PATHS.trail0)}</g>
          <g className="rm-part rm-trail rm-trail-2">{part(RUNNER_PATHS.trail2)}</g>
          {part(RUNNER_PATHS.ground)}
          <g className="rm-part rm-body">
            <g className="rm-part rm-leg">{part(RUNNER_PATHS.leg)}</g>
            {part(RUNNER_PATHS.torso)}
            {part(RUNNER_PATHS.knee)}
            {part(RUNNER_PATHS.shoulder)}
            <g className="rm-part rm-shin">{part(RUNNER_PATHS.shin)}</g>
            <g className="rm-part rm-arm">{part(RUNNER_PATHS.arm)}</g>
            <g className="rm-part rm-head">
              {part(RUNNER_PATHS.head)}
              {part(RUNNER_PATHS.cap)}
            </g>
          </g>
        </g>
      )}
    </svg>
  )
}

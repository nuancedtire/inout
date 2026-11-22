import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { RUNNER_GRADIENT_Y, RUNNER_MATRIX, RUNNER_PATHS, RUNNER_VIEWBOX } from './runnerArt'

export type RunnerAnimation = 'run' | 'ambient' | 'idle' | 'none'
export type RunnerTone = 'brand' | 'ink' | 'white' | 'current'

export type RunnerMarkProps = {
  /** Rendered width and height. Numbers are pixels; strings accept any CSS length (e.g. `'1.6em'`). */
  size?: number | string
  /**
   * `run`     – continuous stride, for hero lockups and working states. Lands on the next footfall when it
   *             stops; pauses while offscreen or while the tab is hidden.
   * `ambient` – small header marks: one stride shortly after hydration, then one every ~6–8 s while the mark
   *             is on screen and the tab is visible, plus one on hover or tap.
   * `idle`    – one stride shortly after hydration, then only on hover or tap.
   * `none`    – the static logo.
   * Strides are started on the client after mount, so they are actually seen; the server renders the rest
   * pose. Hover/tap is read from the mark or the nearest ancestor with `data-runner-hover`. Under
   * prefers-reduced-motion nothing moves.
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

/** Delay before the first stride, so it plays after hydration and page reveal, when someone is looking. */
const INTRO_DELAY_MS = 700
/** Ambient cadence: a stride every 6–8 s (jittered so several marks never fall into lockstep). */
const AMBIENT_MIN_MS = 6000
const AMBIENT_JITTER_MS = 2000

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * The InOut runner with its stopwatch cap. At rest it is pixel-identical to the static logo; when animated,
 * the figure's own parts (shin, rear leg, arm, head, speed lines) run a full stride, rigged at their true
 * joints, with the legs scissoring past each other. See `brand/runner.css`.
 */
export function RunnerMark({ size = 32, animate = 'none', tone = 'brand', label, className, style }: RunnerMarkProps) {
  const uid = useId().replace(/[^\w-]/g, '')
  const gradientId = `rm-g-${uid}`
  const maskId = `rm-m-${uid}`
  const ref = useRef<SVGSVGElement>(null)
  // `mode` trails `animate` while a running stride lands, so the figure never snaps mid-pose.
  const [mode, setMode] = useState<RunnerAnimation>(animate)
  // A single stride (idle/ambient). Never true on the server: strides start after mount.
  const [playing, setPlaying] = useState(false)

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
      setPlaying(false)
      return
    }

    let cancelled = false
    const settle = () => {
      if (cancelled) return
      setMode(animate)
      setPlaying(false)
    }
    if (!animations.length || prefersReducedMotion() || svg?.hasAttribute('data-paused')) {
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

  // Idle / ambient: single strides — once after mount, on a cadence (ambient), and on hover or tap.
  useEffect(() => {
    if (mode !== 'idle' && mode !== 'ambient') return
    const svg = ref.current
    if (!svg) return
    const striding = () =>
      typeof svg.getAnimations === 'function' &&
      svg
        .getAnimations({ subtree: true })
        .some((a) => (a as CSSAnimation).animationName === 'rm-body' && a.playState === 'running')

    let onScreen = true
    let frame = 0
    let timer = 0
    const play = () => {
      if (prefersReducedMotion() || document.hidden || !onScreen || striding()) return
      // Drop and re-add the attribute on the next frame so the stride restarts from its first pose.
      setPlaying(false)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPlaying(true))
    }
    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        play()
        if (mode === 'ambient') schedule(AMBIENT_MIN_MS + Math.random() * AMBIENT_JITTER_MS)
      }, delay)
    }
    schedule(INTRO_DELAY_MS)

    // Coming back to the tab: greet with a stride and restart the cadence.
    const onVisibility = () => {
      if (!document.hidden && mode === 'ambient') schedule(INTRO_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisibility)

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
          })
    observer?.observe(svg)

    const host = svg.closest<HTMLElement | SVGElement>('[data-runner-hover]') ?? svg
    host.addEventListener('pointerenter', play)
    host.addEventListener('pointerdown', play)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
      host.removeEventListener('pointerenter', play)
      host.removeEventListener('pointerdown', play)
    }
  }, [mode])

  // Running: pause while scrolled out of view or while the tab is hidden.
  useEffect(() => {
    if (mode !== 'run') return
    const svg = ref.current
    if (!svg) return
    let onScreen = true
    const sync = () => svg.toggleAttribute('data-paused', !onScreen || document.hidden)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            sync()
          })
    observer?.observe(svg)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      svg.removeAttribute('data-paused')
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
      data-playing={(mode === 'idle' || mode === 'ambient') && playing ? '' : undefined}
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
        <g fill={fill} fillRule="evenodd">
          {part(RUNNER_PATHS.static)}
          {part(RUNNER_PATHS.ring)}
        </g>
      ) : (
        <g fill={fill} fillRule="evenodd">
          <g className="rm-part rm-trail rm-trail-1">{part(RUNNER_PATHS.trail1)}</g>
          <g className="rm-part rm-trail rm-trail-0">{part(RUNNER_PATHS.trail0)}</g>
          <g className="rm-part rm-trail rm-trail-2">{part(RUNNER_PATHS.trail2)}</g>
          {part(RUNNER_PATHS.ground)}
          <g className="rm-part rm-body">
            {/* Where the front shin crosses the rear leg, a thin gap is cut from the rear leg so the two
                never merge into one shape. The mask holds a copy of the shin running the same animation. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x="-300" y="-300" width="1700" height="1700">
              <rect x="-300" y="-300" width="1700" height="1700" fill="#fff" />
              <g className="rm-part rm-shin">
                <path
                  transform={RUNNER_MATRIX}
                  d={RUNNER_PATHS.shin}
                  fill="#000"
                  stroke="#000"
                  strokeWidth={10}
                  strokeLinejoin="round"
                />
              </g>
            </mask>
            <g mask={`url(#${maskId})`}>
              <g className="rm-part rm-leg">{part(RUNNER_PATHS.leg)}</g>
            </g>
            {part(RUNNER_PATHS.torso)}
            {part(RUNNER_PATHS.knee)}
            {part(RUNNER_PATHS.shoulder)}
            <g className="rm-part rm-shin">{part(RUNNER_PATHS.shin)}</g>
            <g className="rm-part rm-arm">{part(RUNNER_PATHS.arm)}</g>
            <g className="rm-part rm-head">
              {part(RUNNER_PATHS.head)}
              {part(RUNNER_PATHS.cap)}
              {part(RUNNER_PATHS.ring)}
            </g>
          </g>
        </g>
      )}
    </svg>
  )
}

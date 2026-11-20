import type { CSSProperties } from 'react'
import { RunnerMark, type RunnerAnimation } from './RunnerMark'

export type WordmarkSize = 'sm' | 'md' | 'lg'
export type WordmarkTone = 'brand' | 'ink' | 'white'

export type WordmarkProps = {
  /** sm = 24px type, md = 32px, lg = 52px. The runner scales with the type. */
  size?: WordmarkSize
  /** Runner motion. Letters answer each footfall with a small ripple only while the runner moves. */
  animate?: RunnerAnimation
  /** `brand`: brand runner with ink letters. `ink`: all ink. `white`: all white, for brand/dark surfaces. */
  tone?: WordmarkTone
  /** Element to render; use `h1` when the lockup is the page title. */
  as?: 'div' | 'span' | 'h1' | 'h2' | 'p'
  /** Accessible text for the lockup. */
  label?: string
  className?: string
  style?: CSSProperties
}

// Ripple delays, ordered by distance from the runner's planted foot (just below the "O").
const IN = [
  ['I', 70],
  ['n', 25],
] as const
const OUT = [
  ['O', 0],
  ['u', 40],
  ['t', 80],
] as const

function Letters({ letters }: { letters: ReadonlyArray<readonly [string, number]> }) {
  return (
    <span className="wm-word" aria-hidden="true">
      {letters.map(([letter, delay]) => (
        <span key={letter} className="wm-letter" style={{ '--wm-delay': `${delay}ms` } as CSSProperties}>
          {letter}
        </span>
      ))}
    </span>
  )
}

/**
 * The "In [runner] Out" lockup. Hovering or tapping it replays a stride. Hero placements use `run`; header
 * placements use `ambient`.
 */
export function Wordmark({
  size = 'md',
  animate = 'idle',
  tone = 'brand',
  as: Tag = 'div',
  label = 'InOut',
  className,
  style,
}: WordmarkProps) {
  return (
    <Tag
      className={['wm', `wm-${size}`, className].filter(Boolean).join(' ')}
      style={style}
      data-tone={tone}
      data-runner-hover=""
    >
      <span className="sr-only">{label}</span>
      <Letters letters={IN} />
      <RunnerMark size="1.62em" animate={animate} tone={tone} />
      <Letters letters={OUT} />
    </Tag>
  )
}

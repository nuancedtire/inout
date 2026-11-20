import { RunnerMark, type RunnerTone } from './brand/RunnerMark'

/**
 * InOut logo mark (static). Kept for existing call sites; new code can use `brand/RunnerMark` directly.
 * variant="rausch"  → brand gradient (default, for light backgrounds)
 * variant="white"   → solid white (for dark / brand backgrounds)
 * variant="dark"    → ink (for monochrome use)
 */
type LogoVariant = 'rausch' | 'white' | 'dark'

type LogoProps = {
  size?: number
  variant?: LogoVariant
  className?: string
  /** Adds a soft brand glow. */
  glow?: boolean
}

const toneMap: Record<LogoVariant, RunnerTone> = {
  rausch: 'brand',
  white: 'white',
  dark: 'ink',
}

export function Logo({ size = 32, variant = 'rausch', className = '', glow = false }: LogoProps) {
  return (
    <RunnerMark
      size={size}
      tone={toneMap[variant]}
      className={className}
      label="InOut logo"
      style={glow ? { filter: 'drop-shadow(0 0 12px rgba(255,56,92,0.45))' } : undefined}
    />
  )
}

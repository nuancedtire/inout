/**
 * InAndOutLogo
 *
 * "IN" and "OUT" are drawn as heavy geometric stroke letterforms (no
 * font dependency, fully portable and crisp at any size). The "&"
 * between them is a running figure: a forward-leaning spine with two
 * pumping arms, a running stride, a solid head and a tilted flat cap.
 * Speed lines trail behind.
 *
 * This is the exact same artwork as /public/logo.svg — keep the two
 * in sync. The only difference here is the `ink` color is themeable.
 *
 * Props:
 *   height    — rendered height in px; width scales proportionally
 *   dark      — invert to white for dark backgrounds
 *   className — forwarded to the <svg>
 */

const VW = 1000
const VH = 250

interface InAndOutLogoProps {
  height?: number
  dark?: boolean
  className?: string
}

export function InAndOutLogo({ height = 80, dark = false, className }: InAndOutLogoProps) {
  const ink = dark ? '#ffffff' : '#1e293b'

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      height={height}
      width={Math.round((height * VW) / VH)}
      aria-label="In and Out"
      role="img"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ============ "IN" + "OUT" (heavy stroke letterforms) ============ */}
      <g fill="none" stroke={ink} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        {/* I */}
        <path d="M55 55 L55 195" />
        {/* N */}
        <path d="M120 195 L120 55 L205 195 L205 55" />

        {/* O */}
        <circle cx="610" cy="125" r="70" />
        {/* U */}
        <path d="M745 55 L745 150 Q745 195 785 195 Q825 195 825 150 L825 55" />
        {/* T */}
        <path d="M870 55 L965 55" />
        <path d="M917 55 L917 195" />
      </g>

      {/* ============ RUNNING FIGURE (the "&") ============ */}
      <g transform="translate(35,0)">
        {/* Speed lines trailing behind */}
        <g fill="none" stroke={ink} strokeWidth="15" strokeLinecap="round">
          <path d="M258 104 L300 104" />
          <path d="M246 132 L300 132" />
          <path d="M258 160 L300 160" />
        </g>

        {/* Limbs + spine */}
        <g fill="none" stroke={ink} strokeWidth="28" strokeLinecap="round" strokeLinejoin="round">
          {/* Spine: leans forward into the run */}
          <path d="M370 92 C356 106 352 126 360 150" />
          {/* Front arm: drives forward and down */}
          <path d="M368 98 L400 92 L416 116" />
          {/* Back arm: swings up behind */}
          <path d="M360 104 L334 112 L320 98" />
          {/* Front leg: knee high, lower leg forward */}
          <path d="M362 150 L398 144 L400 186" />
          {/* Back leg: extended back, pushing off */}
          <path d="M356 152 L328 174 L312 198" />
        </g>

        {/* Head + cap (solid) */}
        <g fill={ink}>
          <circle cx="378" cy="66" r="25" />
          {/* Cap crown (flat-topped, tilted forward) */}
          <path d="M350 52 Q352 26 380 25 Q406 24 410 46 Q380 38 350 52 Z" />
          {/* Cap brim, pointing forward */}
          <rect x="405" y="38" width="36" height="14" rx="7" transform="rotate(10 405 45)" />
        </g>
      </g>
    </svg>
  )
}

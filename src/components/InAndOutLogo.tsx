/**
 * InAndOutLogo
 *
 * "IN" and "OUT" are drawn as solid geometric letterforms (no font
 * dependency, fully portable). The "&" between them is a running
 * figure: an ampersand-style loop forms the torso, with an attached
 * head, flat cap, two pumping arms and a running stride. Speed lines
 * trail behind.
 *
 * Everything shares one visual language: heavy solid shapes with
 * round joints. The same artwork is mirrored in /public/logo.svg —
 * keep the two in sync.
 *
 * Props:
 *   height    — rendered height in px; width scales proportionally
 *   dark      — invert to white for dark backgrounds
 *   className — forwarded to the <svg>
 */

const VW = 900
const VH = 220

interface InAndOutLogoProps {
  height?: number
  dark?: boolean
  className?: string
}

export function InAndOutLogo({ height = 80, dark = false, className }: InAndOutLogoProps) {
  const ink = dark ? '#ffffff' : '#111827'

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
      {/* ============ "IN" + "OUT" (solid letterforms) ============ */}
      <g fill={ink}>
        {/* I */}
        <rect x="40" y="55" width="34" height="130" rx="4" />
        {/* N — left stem, right stem, diagonal slab */}
        <rect x="104" y="55" width="34" height="130" rx="4" />
        <rect x="196" y="55" width="34" height="130" rx="4" />
        <path d="M104 55 L138 55 L230 185 L196 185 Z" />

        {/* T — top bar + stem */}
        <rect x="752" y="55" width="116" height="34" rx="4" />
        <rect x="793" y="55" width="34" height="130" rx="4" />
      </g>

      {/* O — thick ring (even-odd hole) */}
      <path
        fill={ink}
        fillRule="evenodd"
        d="M548 55 a65 65 0 1 0 0.1 0 Z M548 89 a31 31 0 1 1 -0.1 0 Z"
      />

      {/* U — round-bottomed stroke */}
      <path
        d="M636 55 L636 128 A44 44 0 0 0 724 128 L724 55"
        fill="none"
        stroke={ink}
        strokeWidth="34"
        strokeLinecap="round"
      />

      {/* ============ RUNNING FIGURE (the "&") ============ */}
      <g
        fill="none"
        stroke={ink}
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(16,0)"
      >
        {/* Torso — ampersand loop forms the upper body */}
        <path
          d="M372 158
             C372 122 330 120 334 92
             C336 66 376 66 376 94
             C378 120 340 126 360 158"
        />
        {/* Front arm — pumps forward */}
        <path d="M368 112 L404 100 L418 124" />
        {/* Back arm — bent, swings behind */}
        <path d="M346 108 L318 118 L300 138" />
        {/* Front leg — stride ahead, plants down */}
        <path d="M360 158 L396 176 L390 206" />
        {/* Back leg — kicks back, foot up */}
        <path d="M360 158 L322 178 L296 168" />
        {/* Speed lines trailing behind */}
        <path d="M252 96 L288 96" strokeWidth="14" />
        <path d="M240 124 L288 124" strokeWidth="14" />
        <path d="M252 152 L288 152" strokeWidth="14" />
      </g>

      {/* Head + cap (solid) */}
      <g fill={ink} transform="translate(16,0)">
        {/* Head */}
        <circle cx="356" cy="60" r="26" />
        {/* Cap crown */}
        <path d="M330 50 q4 -22 30 -22 q26 0 26 18 l0 6 q-28 -6 -56 -2 Z" />
        {/* Cap brim */}
        <rect x="380" y="42" width="34" height="12" rx="6" />
      </g>
    </svg>
  )
}

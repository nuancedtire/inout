import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { MapFix } from '#/components/maps/AreaMap'
import type { PublicArea } from '#/utils/passkeys.functions'
import { cn } from '#/lib/utils'

// Leaflet and its CSS load with the map itself, never on the critical path to the slider.
const AreaMap = lazy(() => import('#/components/maps/AreaMap').then((m) => ({ default: m.AreaMap })))

export type StaffMapTone = 'brand' | 'neutral' | 'success' | 'warning'

/**
 * The department on a small fixed map for staff screens: the area circle, and the person's own dot
 * and accuracy once a reading exists. Never interactive. It frames the department, so map tiles
 * only ever show the hospital; a reading far away gets an edge arrow instead of a pan.
 * Falls back to a drawn map when there's no area yet, no connection, or tiles fail.
 */
export function StaffMap({ area, position = null, tone = 'brand', scanning = false, height = 'var(--ck-map-h)', label, overlay, action, className }: {
  area: PublicArea | null | undefined
  position?: MapFix | null
  tone?: StaffMapTone
  /** Radar rings from the department while a reading is being taken. */
  scanning?: boolean
  height?: string
  label: string
  /** Chips laid over the map (top-left). */
  overlay?: ReactNode
  /** One control laid over the map (top-right), e.g. "check again". */
  action?: ReactNode
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const drawn = <MapDoodle tone={tone} position={!!position} height={height} label={label} />
  return (
    <div className={cn('relative isolate overflow-hidden bg-surface-strong', className)} style={{ height }}>
      {area && !failed ? (
        <Suspense fallback={<MapDoodle tone={tone} position={false} height={height} label={label} loading />}>
          <AreaMap
            centre={area}
            radiusM={area.radiusM}
            tone={tone}
            position={position}
            positionTone={tone === 'brand' || tone === 'neutral' ? 'live' : tone}
            fitTo="area+position"
            arrowLabel={false}
            showPin={false}
            arrowInsetTop={overlay ? 56 : 28}
            height={height}
            label={label}
            className="rounded-none border-0"
            fallback={drawn}
            onUnavailable={() => setFailed(true)}
          />
        </Suspense>
      ) : (
        <MapDoodle tone={tone} position={!!position} height={height} label={label} loading={area === undefined} />
      )}
      {scanning ? (
        <span className="pointer-events-none absolute inset-0 z-[950] grid place-items-center" aria-hidden="true">
          <span className="ck-sonar absolute size-40 rounded-full border-2 border-primary-500/60" />
          <span className="ck-sonar absolute size-40 rounded-full border-2 border-primary-500/60 [animation-delay:900ms]" />
        </span>
      ) : null}
      {overlay ? <div className={cn('pointer-events-none absolute top-2.5 left-2.5 z-[960] flex flex-wrap gap-1.5', action ? 'max-w-[calc(100%-4.5rem)]' : 'max-w-[calc(100%-1.25rem)]')}>{overlay}</div> : null}
      {action ? <div className="absolute top-1.5 right-1.5 z-[960]">{action}</div> : null}
    </div>
  )
}

/** A status pill laid over the map. */
export function MapChip({ tone = 'neutral', icon, children }: { tone?: StaffMapTone; icon?: ReactNode; children: ReactNode }) {
  const t = {
    brand: 'bg-canvas/95 text-ink',
    neutral: 'bg-canvas/95 text-ink',
    success: 'bg-success-accessible text-white',
    warning: 'bg-warning-100/95 text-warning-800 ring-1 ring-inset ring-warning-200',
  }[tone]
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold leading-tight shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)] backdrop-blur-sm [&_svg]:size-3.5 [&_svg]:shrink-0', t)}>
      {icon}
      {children}
    </span>
  )
}

const DOODLE_TONE: Record<StaffMapTone, { stroke: string; fill: string }> = {
  brand: { stroke: '#e00b41', fill: 'rgba(255,56,92,0.14)' },
  neutral: { stroke: '#6a6a6a', fill: 'rgba(0,0,0,0.06)' },
  success: { stroke: '#008a05', fill: 'rgba(0,138,5,0.14)' },
  warning: { stroke: '#b45309', fill: 'rgba(217,119,6,0.16)' },
}

/** Drawn stand-in for the map: soft streets, the area ring and its pin. */
function MapDoodle({ tone, position, height, label, loading }: { tone: StaffMapTone; position: boolean; height: string; label: string; loading?: boolean }) {
  const t = DOODLE_TONE[tone]
  return (
    <div role="img" aria-label={label} className="absolute inset-0 overflow-hidden bg-[#f2efe9]" style={{ height }}>
      <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 200" aria-hidden="true">
        <g stroke="#fff" strokeLinecap="round" fill="none">
          <path d="M-20 150 C 80 130, 160 170, 420 120" strokeWidth="14" />
          <path d="M110 -20 L 150 230" strokeWidth="10" />
          <path d="M290 -20 C 270 60, 300 140, 260 230" strokeWidth="8" />
          <path d="M-20 52 L 420 70" strokeWidth="6" />
        </g>
        <g fill="#e6e1d8">
          <rect x="166" y="78" width="40" height="28" rx="3" />
          <rect x="214" y="84" width="26" height="40" rx="3" />
          <rect x="30" y="80" width="56" height="30" rx="3" />
          <rect x="316" y="88" width="50" height="22" rx="3" />
          <rect x="172" y="116" width="30" height="18" rx="3" />
        </g>
        <circle cx="200" cy="100" r="58" fill={t.fill} stroke={t.stroke} strokeWidth="2.5" />
        {position ? <circle cx="214" cy="112" r="7" fill={t.stroke} stroke="#fff" strokeWidth="3" /> : null}
      </svg>
      <span className={cn('absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+12px)]', position && 'hidden')} aria-hidden="true">
        <svg width="30" height="38" viewBox="0 0 44 54">
          <path d="M22 52S4 33.6 4 21a18 18 0 0 1 36 0c0 12.6-18 31-18 31Z" fill={t.stroke} stroke="#fff" strokeWidth="3" />
          <circle cx="22" cy="21" r="6.5" fill="#fff" />
        </svg>
      </span>
      {loading ? <span className="absolute inset-0 animate-pulse bg-white/30 motion-reduce:animate-none" /> : null}
    </div>
  )
}

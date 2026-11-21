import { Fingerprint, KeyRound } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import type { Platform } from '#/lib/platform'

/** Soft brand disc that every step illustration sits on. */
function Disc({ children, size = 112, tone = 'brand' }: { children: React.ReactNode; size?: number; tone?: 'brand' | 'success' | 'neutral' }) {
  const bg = tone === 'brand'
    ? 'radial-gradient(circle at 30% 25%, #ffffff 0%, #fff1f4 55%, #ffe1e8 100%)'
    : tone === 'success'
      ? 'radial-gradient(circle at 30% 25%, #ffffff 0%, #effaf1 55%, #d9f3df 100%)'
      : 'radial-gradient(circle at 30% 25%, #ffffff 0%, #f7f7f7 60%, #ececec 100%)'
  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(213,11,64,0.25)]"
      style={{ width: size, height: size, background: bg }}
    >
      {children}
    </div>
  )
}

/** iOS-style Face ID frame. */
function FaceGlyph({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16V11a7 7 0 0 1 7-7h5M40 4h5a7 7 0 0 1 7 7v5M52 40v5a7 7 0 0 1-7 7h-5M16 52h-5a7 7 0 0 1-7-7v-5" />
      <path d="M19 20v4M37 20v4M28 20v11h-3M20 38c4.5 4 11.5 4 16 0" />
    </svg>
  )
}

export function UnlockIllustration({ platform }: { platform: Platform }) {
  const Glyph = platform === 'ios' ? FaceGlyph : platform === 'android' ? Fingerprint : KeyRound
  return (
    <Disc>
      <span className="relative overflow-hidden text-accent-accessible">
        <Glyph size={56} {...(platform === 'ios' ? {} : { strokeWidth: 1.75 })} />
        <span className="ck-scan pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -mt-px rounded-full bg-gradient-to-r from-transparent via-[#ff385c]/70 to-transparent opacity-0 shadow-[0_0_10px_1px_rgba(255,56,92,0.3)]" />
      </span>
    </Disc>
  )
}

/** Small inline glyph for buttons. */
export function UnlockIcon({ platform, className = 'size-5' }: { platform: Platform; className?: string }) {
  if (platform === 'ios') {
    return (
      <svg className={className} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16V11a7 7 0 0 1 7-7h5M40 4h5a7 7 0 0 1 7 7v5M52 40v5a7 7 0 0 1-7 7h-5M16 52h-5a7 7 0 0 1-7-7v-5" />
        <path d="M19 20v4M37 20v4M28 20v11h-3M20 38c4.5 4 11.5 4 16 0" />
      </svg>
    )
  }
  const Icon = platform === 'android' ? Fingerprint : KeyRound
  return <Icon className={className} aria-hidden="true" />
}

export function LocationIllustration() {
  return (
    <Disc>
      <svg width="112" height="112" viewBox="0 0 112 112" className="absolute inset-0" aria-hidden="true">
        <circle className="ck-ring" cx="56" cy="62" r="46" fill="none" stroke="#ff385c" strokeOpacity="0.35" strokeWidth="1.5" />
        <circle className="ck-ring ck-ring-2" cx="56" cy="62" r="46" fill="none" stroke="#ff385c" strokeOpacity="0.35" strokeWidth="1.5" />
        <circle className="ck-ring ck-ring-3" cx="56" cy="62" r="46" fill="none" stroke="#ff385c" strokeOpacity="0.35" strokeWidth="1.5" />
        <ellipse cx="56" cy="70" rx="9" ry="3" fill="#d50b40" fillOpacity="0.18" />
      </svg>
      <svg width="44" height="54" viewBox="0 0 44 54" className="ck-pin relative -mt-3" aria-hidden="true">
        <defs>
          <linearGradient id="ck-pin-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ff6b81" />
            <stop offset="1" stopColor="#e00b41" />
          </linearGradient>
        </defs>
        <path d="M22 52S4 33.6 4 21a18 18 0 0 1 36 0c0 12.6-18 31-18 31Z" fill="url(#ck-pin-g)" />
        <circle cx="22" cy="21" r="7" fill="#fff" />
      </svg>
    </Disc>
  )
}

/**
 * Success: the runner lands, the ring closes and a check draws in.
 * `tone="neutral"` is used for undo results (no check, a calm grey ring).
 */
export function SuccessMark({ tone = 'success' }: { tone?: 'success' | 'neutral' }) {
  const stroke = tone === 'success' ? '#008a05' : '#6a6a6a'
  return (
    <div className="relative flex size-[132px] items-center justify-center" aria-hidden="true">
      <span className="ck-halo absolute inset-3 rounded-full" style={{ background: tone === 'success' ? 'rgba(0,138,5,0.18)' : 'rgba(0,0,0,0.06)' }} />
      <svg className="absolute inset-0" viewBox="0 0 132 132" fill="none">
        <circle cx="66" cy="66" r="58" stroke="#ebebeb" strokeWidth="4" />
        <circle className="ck-check-ring" cx="66" cy="66" r="58" stroke={stroke} strokeWidth="4" strokeLinecap="round" transform="rotate(-90 66 66)" pathLength="164" />
      </svg>
      <RunnerMark size={68} animate="idle" tone={tone === 'success' ? 'brand' : 'ink'} />
      {tone === 'success' ? (
        <span className="ck-pop absolute right-[6px] bottom-[6px] flex size-[44px] items-center justify-center rounded-full bg-success-accessible shadow-[0_0_0_4px_#f7f7f7,0_6px_14px_-4px_rgba(0,138,5,0.6)]">
          <svg viewBox="0 0 24 24" className="size-[24px]" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path className="ck-check-tick" d="M5 12.5l4.5 4.5L19 7.5" pathLength="48" />
          </svg>
        </span>
      ) : null}
    </div>
  )
}

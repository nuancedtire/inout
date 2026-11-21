import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronRight, EllipsisVertical, LocateFixed, Menu, Navigation, RefreshCw, SlidersHorizontal, Wifi, Bluetooth, Flashlight, Plane } from 'lucide-react'
import { currentLocationFlavor, type LocationFlavor, type Platform } from '#/lib/platform'
import { ALLOW_CHECKIN_WITHOUT_LOCATION } from '#/lib/locationPolicy'
import type { LocationPermission } from '#/lib/geolocation'
import { cn } from '#/lib/utils'
import { UnlockIcon } from './Illustrations'
import { BigButton, ScreenTitle } from './ui'

/**
 * "Turn on location": shown when the phone or browser has blocked location. Location is required
 * to check in, so instead of asking again (browsers ignore repeat prompts after a refusal) this
 * shows the exact steps for this phone, with a picture of each screen, and notices by itself when
 * location comes back on (Permissions API `change`, plus a re-try whenever the page becomes visible
 * again — iOS Safari doesn't fire `change`).
 *
 * Steps follow Apple's iPhone User Guide (Location Services, Safari Page Settings / Page Menu),
 * Google's Chrome Help ("Use your location", site settings) and Android Help (location settings,
 * app permissions), and Samsung's Internet settings. See docs in README.
 */

export type HelpMode =
  /** Opened from Home: nothing pending. */
  | { kind: 'help' }
  /** Mid check-in: identity is confirmed and the check-in is waiting for location. */
  | { kind: 'inflow'; action: 'in' | 'out' }
  /** Slid while location was known to be off: nothing has started yet. */
  | { kind: 'preflight'; action: 'in' | 'out'; viaFaceId: boolean }

type Family = 'iphone' | 'android' | 'samsung'

function familyOf(flavor: LocationFlavor): Family {
  if (flavor.startsWith('ios')) return 'iphone'
  if (flavor === 'android-samsung') return 'samsung'
  return 'android'
}

const b = (t: ReactNode) => <b className="font-semibold text-ink">{t}</b>
// "Settings › Privacy & Security › …": wraps between (and, at large text sizes, within) the parts.
const path = (...parts: string[]) => (
  <>
    {parts.map((p, i) => (
      <span key={`${i}-${p}`}>
        {i > 0 ? <> <span className="text-muted" aria-hidden="true">›</span>{'\u00a0'}</> : null}
        {b(p)}
      </span>
    ))}
  </>
)

type Step = { text: ReactNode; mock: ReactNode }
type Guide = { intro: ReactNode; steps: Step[]; after?: ReactNode }

export function locationGuide(flavor: LocationFlavor, host: string): Guide {
  const iosSettings = (app: 'Safari Websites' | 'Chrome' | 'your browser'): Step[] => [
    {
      text: <>Open {path('Settings', 'Privacy & Security', 'Location Services')} and turn {b('Location Services')} on.</>,
      mock: <IosGroup><IosRow tile="bg-[#007aff]" icon={<Navigation className="size-3.5 rotate-45 fill-white" />} label="Location Services" accessory={<IosSwitch />} /></IosGroup>,
    },
    {
      text: <>Scroll down, tap {b(app === 'your browser' ? 'your browser’s name' : app)} and choose {b('While Using the App')}.</>,
      mock: (
        <IosGroup title={app === 'your browser' ? 'Browser' : app}>
          <IosChoice label="Never" />
          <IosChoice label="Ask Next Time Or When I Share" />
          <IosChoice label="While Using the App" selected />
        </IosGroup>
      ),
    },
    {
      text: <>On the same screen, turn on {b('Precise Location')}.</>,
      mock: <IosGroup><IosRow label="Precise Location" accessory={<IosSwitch />} /></IosGroup>,
    },
  ]
  switch (flavor) {
    case 'ios-safari':
    case 'ios-safari-26':
      return {
        intro: <>Two places on iPhone can block location: your phone’s Settings and Safari itself. Check both.</>,
        steps: [
          ...iosSettings('Safari Websites'),
          {
            text: flavor === 'ios-safari-26'
              ? <>Back in Safari, tap the {b('page menu')} button at the left of the address bar, then {path('Website Settings')} <span className="text-muted">(under More)</span> › {b('Location')} › {b('Allow')}.</>
              : <>Back in Safari, tap {b('aA')} in the address bar, then {path('Website Settings', 'Location')} › {b('Allow')}.</>,
            mock: (
              <div className="grid gap-2">
                <MockAddressBar host={host} bottom target={flavor === 'ios-safari-26' ? <SlidersHorizontal className="size-3.5" /> : <span className="text-[13px] font-semibold leading-none"><span className="text-[10px]">a</span>A</span>} />
                <IosGroup title="Location">
                  <IosChoice label="Ask" />
                  <IosChoice label="Deny" />
                  <IosChoice label="Allow" selected />
                </IosGroup>
              </div>
            ),
          },
        ],
      }
    case 'ios-home':
      return {
        intro: <>InOut on your Home Screen uses Safari’s location setting.</>,
        steps: iosSettings('Safari Websites'),
        after: <>Still blocked? Open InOut in Safari instead and allow location there.</>,
      }
    case 'ios-chrome':
      return { intro: <>Chrome on iPhone uses your phone’s location setting for Chrome.</>, steps: iosSettings('Chrome') }
    case 'ios-other':
      return { intro: <>Your browser uses your phone’s location setting for that app.</>, steps: iosSettings('your browser') }
    case 'android-chrome':
    case 'android-chrome-app':
      return {
        intro: <>Two things need to be on: your phone’s Location, and location for this site in Chrome.</>,
        steps: [
          {
            text: <>Swipe down from the top of the screen and turn on {b('Location')}.</>,
            mock: <QuickTiles />,
          },
          flavor === 'android-chrome'
            ? {
                text: <>Tap the {b('site settings')} icon at the left of the web address, then {path('Permissions', 'Location')} › {b('Allow')}.</>,
                mock: (
                  <div className="grid gap-2">
                    <MockAddressBar host={host} target={<SlidersHorizontal className="size-3.5" />} trailing={<EllipsisVertical className="size-4 text-muted" />} />
                    <MdGroup><MdRow icon={<LocateFixed className="size-4" />} label="Location" sub="Allowed" accessory={<MdSwitch />} /></MdGroup>
                  </div>
                ),
              }
            : {
                text: <>Open Chrome, tap {b('⋮')} › {path('Settings', 'Site settings', 'Location')}, find {b(host)} under Blocked and choose {b('Allow')}.</>,
                mock: (
                  <MdGroup title="Location">
                    <MdRow icon={<span className="text-[10px] font-bold">IO</span>} label={host} sub="Blocked → Allowed" accessory={<MdSwitch />} />
                  </MdGroup>
                ),
              },
          {
            text: <>Still off? Open {path('Settings', 'Apps', 'Chrome', 'Permissions', 'Location')}, choose {b('Allow only while using the app')} and turn on {b('Use precise location')}.</>,
            mock: (
              <MdGroup title="Location permission">
                <MdRadio label="Allow only while using the app" selected />
                <MdRadio label="Don’t allow" />
                <MdRow label="Use precise location" accessory={<MdSwitch />} />
              </MdGroup>
            ),
          },
        ],
      }
    case 'android-samsung':
      return {
        intro: <>Two things need to be on: your phone’s Location, and location for this site in Samsung Internet.</>,
        steps: [
          { text: <>Swipe down from the top of the screen and turn on {b('Location')} in the quick panel.</>, mock: <QuickTiles samsung /> },
          {
            text: <>In Samsung Internet, tap {b('☰')} › {path('Settings', 'Sites and downloads', 'Site permissions', 'Location')}, then allow {b(host)}.</>,
            mock: (
              <div className="grid gap-2">
                <MockAddressBar host={host} bottom target={<Menu className="size-3.5" />} targetEnd />
                <MdGroup title="Location"><MdRow icon={<span className="text-[10px] font-bold">IO</span>} label={host} accessory={<MdSwitch samsung />} /></MdGroup>
              </div>
            ),
          },
          {
            text: <>Still off? Open {path('Settings', 'Apps', 'Samsung Internet', 'Permissions', 'Location')}, choose {b('Allow only while using the app')} and turn on {b('Use precise location')}.</>,
            mock: (
              <MdGroup title="Location permission">
                <MdRadio label="Allow only while using the app" selected samsung />
                <MdRow label="Use precise location" accessory={<MdSwitch samsung />} />
              </MdGroup>
            ),
          },
        ],
      }
    default:
      return {
        intro: <>Your browser is blocking location for this site.</>,
        steps: [
          {
            text: <>Click the {b('site settings')} icon at the left of the address bar, set {b('Location')} to {b('Allow')}, then come back here.</>,
            mock: <MockAddressBar host={host} target={<SlidersHorizontal className="size-3.5" />} />,
          },
        ],
      }
  }
}

const FAMILY_DEFAULT: Record<Family, LocationFlavor> = { iphone: 'ios-safari-26', android: 'android-chrome', samsung: 'android-samsung' }

export function LocationHelp({ platform, mode, unlockName, permission, ready, onRetry, onContinue, onWithout, openInBrowserHref }: {
  platform: Platform
  mode: HelpMode
  unlockName: string
  permission: LocationPermission
  /** Preflight only: location is back on and the check-in can start. */
  ready: boolean
  /** Ask for location again. Resolves false if it's still blocked. */
  onRetry: () => Promise<boolean>
  /** Preflight: start the check-in now that location is on. */
  onContinue: () => void
  /** Check in without location (flagged). Only offered when the policy allows it. */
  onWithout?: () => void
  /** Home Screen web app: open InOut in Safari, which may have its own permission. */
  openInBrowserHref?: string
}) {
  const [detected, setDetected] = useState<LocationFlavor>('other')
  const [family, setFamily] = useState<Family>(platform === 'android' ? 'android' : 'iphone')
  const [host, setHost] = useState('this site')
  const [busy, setBusy] = useState(false)
  const [still, setStill] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    const f = currentLocationFlavor()
    setDetected(f)
    setFamily(f === 'other' ? (platform === 'android' ? 'android' : 'iphone') : familyOf(f))
    setHost(window.location.host)
  }, [platform])

  const flavor = familyOf(detected) === family && detected !== 'other' ? detected : FAMILY_DEFAULT[family]
  const guide = locationGuide(flavor, host)
  const actionWord = mode.kind === 'help' ? null : mode.action === 'in' ? 'check in' : 'check out'

  const retry = async (auto = false) => {
    if (busyRef.current || ready) return
    busyRef.current = true
    setBusy(true)
    try {
      const ok = await onRetry()
      if (!ok && !auto) setStill((n) => n + 1)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // Opened from Home or before a check-in: location may already be back on (iOS can't say until asked).
  useEffect(() => {
    if (mode.kind !== 'inflow') void retry(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Notice by itself when location comes back: Permissions API change (Chrome) …
  useEffect(() => {
    if (permission === 'granted') void retry(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission])
  // … and coming back from Settings (iOS doesn't report the change; a silent re-try is the only way to know).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void retry(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  const statusLine = ready
    ? { tone: 'ok' as const, text: 'Location is on. You’re ready.' }
    : busy
      ? { tone: 'busy' as const, text: 'Checking your location…' }
      : still > 0
        ? { tone: 'warn' as const, text: 'Still blocked. Check each step, then try again.' }
        : { tone: 'wait' as const, text: 'We’ll notice as soon as it’s on.' }

  const actions = (
    <div className="flex flex-col gap-2">
      <p
        role="status"
        aria-live="polite"
        key={still}
        className={cn(
          'flex min-h-6 items-center justify-center gap-2 text-center text-sm font-medium',
          statusLine.tone === 'ok' ? 'text-success-800' : statusLine.tone === 'warn' ? 'ck-nudge text-warning-800' : 'text-muted',
        )}
      >
        {statusLine.tone === 'ok' ? (
          <span className="grid size-5 place-items-center rounded-full bg-success-accessible text-white" aria-hidden="true"><Check className="size-3" strokeWidth={3.5} /></span>
        ) : statusLine.tone === 'busy' ? (
          <span className="spinner size-3.5 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
        ) : statusLine.tone === 'wait' ? (
          <span className="ck-live size-2 rounded-full bg-primary-500 text-primary-500" aria-hidden="true" />
        ) : null}
        {statusLine.text}
      </p>
      {ready && mode.kind === 'preflight' ? (
        <BigButton
          variant="primary"
          onClick={onContinue}
          icon={mode.viaFaceId ? <UnlockIcon platform={platform} className="size-[22px]" /> : undefined}
        >
          {capital(actionWord ?? 'check in')}{mode.viaFaceId ? ` with ${unlockName}` : ''}
        </BigButton>
      ) : (
        <BigButton variant="ink" busy={busy} onClick={() => void retry()} icon={<RefreshCw className="size-5" aria-hidden="true" />}>
          Try again
        </BigButton>
      )}
      {onWithout && ALLOW_CHECKIN_WITHOUT_LOCATION && !ready && actionWord ? (
        <button
          type="button"
          onClick={onWithout}
          className="ui-press mx-auto inline-flex min-h-11 items-center rounded-control px-3 text-center text-[0.8125rem] leading-snug text-muted underline decoration-hairline underline-offset-4 hover:text-ink hover:decoration-ink text-balance"
        >
          Can’t turn it on? {capital(actionWord)} anyway — the coordinator will be told
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="ck-screen ck-split flex flex-1 flex-col gap-x-10 min-[640px]:grid min-[640px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[640px]:items-start">
      <div className="flex flex-col min-[640px]:sticky min-[640px]:top-4">
        <div className="flex flex-wrap items-center gap-4 pt-2 min-[640px]:flex-col min-[640px]:items-start">
          <LocationOffMark />
          <ScreenTitle
            className="min-w-[min(12rem,100%)] flex-1 min-[640px]:min-w-0"
            sub={mode.kind === 'help'
              ? 'InOut checks you’re in the department when you check in or out. Your phone is blocking it.'
              : `To ${actionWord}, InOut needs to see you’re in the department. Your phone is blocking location.`}
          >
            Turn on location
          </ScreenTitle>
        </div>
        <div className="mt-5 hidden min-[640px]:block">{actions}</div>
      </div>

      <div className="ck-seg-end mt-5 flex flex-col min-[640px]:mt-2">
        <DeviceTabs value={family} onChange={setFamily} />
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-body text-pretty">{guide.intro}</p>
        <ol className="ck-stagger mt-4 flex flex-col gap-3" aria-label="Steps">
          {guide.steps.map((step, i) => (
            <li key={i} className="rounded-card bg-canvas p-4 shadow-card">
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white tabular-nums" aria-hidden="true">{i + 1}</span>
                <p className="min-w-0 flex-1 pt-0.5 text-[0.9375rem] leading-relaxed text-body text-pretty">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.text}
                </p>
              </div>
              <div className="mt-3 sm:ml-10" aria-hidden="true">{step.mock}</div>
            </li>
          ))}
        </ol>
        {guide.after ? (
          <p className="mt-4 text-sm leading-relaxed text-muted text-pretty">
            {guide.after}{' '}
            {openInBrowserHref ? (
              <a href={openInBrowserHref} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-accessible underline-offset-4 hover:underline">
                Open in Safari<ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-muted text-pretty">
          Then come back to InOut. Only “in the department” or not is kept — never where you are.
        </p>
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-surface-soft from-75% to-surface-soft/0 px-5 pt-6 pb-1 min-[640px]:hidden">
        {actions}
      </div>
    </div>
  )
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function DeviceTabs({ value, onChange }: { value: Family; onChange: (f: Family) => void }) {
  const tabs: { id: Family; label: string }[] = [
    { id: 'iphone', label: 'iPhone' },
    { id: 'android', label: 'Android' },
    { id: 'samsung', label: 'Samsung' },
  ]
  return (
    <div role="radiogroup" aria-label="Your phone" className="grid grid-cols-3 gap-1 rounded-control bg-surface-strong p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'ui-press min-h-11 rounded-inner px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            value === t.id ? 'bg-canvas text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** The pin, struck through, on a soft amber disc. */
function LocationOffMark() {
  return (
    <span
      aria-hidden="true"
      className="relative grid size-16 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),0_10px_28px_-12px_rgba(180,83,9,0.45)] min-[640px]:size-20"
      style={{ background: 'radial-gradient(circle at 30% 25%, #ffffff 0%, #fff7ea 55%, #ffe8c7 100%)' }}
    >
      <svg viewBox="0 0 44 54" className="h-9 w-8 min-[640px]:h-11 min-[640px]:w-10">
        <path d="M22 52S4 33.6 4 21a18 18 0 0 1 36 0c0 12.6-18 31-18 31Z" fill="#b45309" />
        <circle cx="22" cy="21" r="7" fill="#fff" />
        <path d="M6 6 38 44" stroke="#fff7ea" strokeWidth="7" strokeLinecap="round" />
        <path d="M6 6 38 44" stroke="#92400e" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// ── Pictures of each screen (decorative; the step text says it all) ───────────

function IosGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[#f2f2f7] p-2 font-[-apple-system,BlinkMacSystemFont,system-ui,sans-serif]">
      {title ? <p className="px-3 pt-0.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-[#6d6d72]">{title}</p> : null}
      <div className="divide-y divide-[#c6c6c8]/60 overflow-hidden rounded-[10px] bg-white">{children}</div>
    </div>
  )
}

function IosRow({ tile, icon, label, accessory }: { tile?: string; icon?: ReactNode; label: string; accessory?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-1.5">
      {tile ? <span className={cn('grid size-[26px] shrink-0 place-items-center rounded-[7px] text-white', tile)}>{icon}</span> : null}
      <span className="min-w-0 flex-1 text-[14px] text-black">{label}</span>
      {accessory ?? <ChevronRight className="size-4 text-[#c4c4c6]" />}
    </div>
  )
}

function IosChoice({ label, selected }: { label: string; selected?: boolean }) {
  return (
    <div className={cn('flex min-h-11 items-center gap-3 px-3 py-1.5', selected && 'ck-target ck-in')}>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-black">{label}</span>
      {selected ? <Check className="size-4 text-[#007aff]" strokeWidth={3} /> : null}
    </div>
  )
}

function IosSwitch() {
  return (
    <span className="ck-target relative inline-flex h-[24px] w-[40px] shrink-0 items-center rounded-full bg-[#34c759] p-[2px]">
      <span className="ml-auto size-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)]" />
    </span>
  )
}

function MdGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] bg-[#f3f5fb] p-1.5">
      {title ? <p className="px-3 pt-1 pb-1 text-[12px] font-medium text-[#0b57d0]">{title}</p> : null}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function MdRow({ icon, label, sub, accessory }: { icon?: ReactNode; label: string; sub?: string; accessory?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-[12px] bg-white px-3 py-1.5">
      {icon ? <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8eefb] text-[#0b57d0]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-[#1f1f1f]">{label}</span>
        {sub ? <span className="block text-[12px] text-[#444746]">{sub}</span> : null}
      </span>
      {accessory}
    </div>
  )
}

function MdRadio({ label, selected, samsung }: { label: string; selected?: boolean; samsung?: boolean }) {
  const c = samsung ? 'border-[#3e91ff]' : 'border-[#0b57d0]'
  return (
    <div className={cn('flex min-h-11 items-center gap-3 rounded-[12px] bg-white px-3 py-1.5', selected && 'ck-target ck-in')}>
      <span className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border-2', selected ? c : 'border-[#747775]')}>
        {selected ? <span className={cn('size-2 rounded-full', samsung ? 'bg-[#3e91ff]' : 'bg-[#0b57d0]')} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-[#1f1f1f]">{label}</span>
    </div>
  )
}

function MdSwitch({ samsung }: { samsung?: boolean }) {
  return (
    <span className={cn('ck-target relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full p-[3px]', samsung ? 'bg-[#3e91ff]' : 'bg-[#0b57d0]')}>
      <span className="ml-auto grid size-[18px] place-items-center rounded-full bg-white">
        <Check className={cn('size-3', samsung ? 'text-[#3e91ff]' : 'text-[#0b57d0]')} strokeWidth={3.5} />
      </span>
    </span>
  )
}

function QuickTiles({ samsung }: { samsung?: boolean }) {
  const on = samsung ? 'bg-[#3e91ff] text-white' : 'bg-[#d3e3fd] text-[#041e49]'
  const off = samsung ? 'bg-white text-[#555]' : 'bg-[#e9e9ee] text-[#444746]'
  const tiles: { label: string; icon: ReactNode; on?: boolean; target?: boolean }[] = [
    { label: 'Wi-Fi', icon: <Wifi className="size-4" />, on: true },
    { label: 'Bluetooth', icon: <Bluetooth className="size-4" /> },
    { label: 'Location', icon: <LocateFixed className="size-4" />, on: true, target: true },
    { label: samsung ? 'Airplane' : 'Torch', icon: samsung ? <Plane className="size-4" /> : <Flashlight className="size-4" /> },
  ]
  return (
    <div className={cn('grid grid-cols-2 gap-1.5 rounded-[18px] p-2', samsung ? 'bg-[#eceef3]' : 'bg-[#1f1f1f]/90')}>
      {tiles.map((t) => (
        <span
          key={t.label}
          className={cn(
            'flex min-h-10 min-w-0 items-center gap-2 px-3 text-[13px] font-medium',
            samsung ? 'rounded-[14px]' : 'rounded-full',
            t.on ? on : off,
            t.target && 'ck-target',
          )}
        >
          {t.icon}
          <span className="truncate">{t.label}</span>
        </span>
      ))}
    </div>
  )
}

function MockAddressBar({ host, target, trailing, bottom, targetEnd }: { host: string; target: ReactNode; trailing?: ReactNode; bottom?: boolean; targetEnd?: boolean }) {
  const pulse = (
    <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-white text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/30" />
      <span className="relative">{target}</span>
    </span>
  )
  return (
    <div className={cn('flex items-center gap-2 rounded-[18px] bg-[#e9e9ee] p-1.5', bottom && 'shadow-[0_-1px_0_rgba(0,0,0,0.04)]')}>
      {targetEnd ? null : pulse}
      <span className="flex h-8 min-w-0 flex-1 items-center rounded-full bg-white px-3 text-[12px] text-[#444]">
        <span className="truncate">{host}</span>
      </span>
      {targetEnd ? pulse : trailing}
    </div>
  )
}

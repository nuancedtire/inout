import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, Ellipsis, EllipsisVertical, Menu, Plus, Share, SquarePlus } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { currentInstallFlavor, type InstallFlavor } from '#/lib/platform'
import { BigButton, Sheet } from './ui'

type Step = { icon: ReactNode; text: ReactNode }

const b = (t: string) => <b className="font-semibold text-ink">{t}</b>

/** Steps per browser. iOS 26 Safari moved Share into the ••• menu of its compact bottom bar. */
export function installSteps(flavor: InstallFlavor): Step[] {
  switch (flavor) {
    case 'ios-safari-26':
      return [
        { icon: <Ellipsis className="size-[18px]" />, text: <>Tap {b('•••')} at the bottom right of Safari</> },
        { icon: <Share className="size-[18px] text-[#0a84ff]" />, text: <>Tap {b('Share')}</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Scroll down and tap {b('Add to Home Screen')} <span className="text-muted">(under “View More” if you don’t see it)</span></> },
        { icon: <Plus className="size-[18px]" />, text: <>Keep {b('Open as Web App')} on, then tap {b('Add')}</> },
      ]
    case 'ios-safari':
      return [
        { icon: <Share className="size-[18px] text-[#0a84ff]" />, text: <>Tap {b('Share')} in Safari’s toolbar</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Scroll down and tap {b('Add to Home Screen')}</> },
        { icon: <Plus className="size-[18px]" />, text: <>Tap {b('Add')} at the top right</> },
      ]
    case 'ios-chrome':
      return [
        { icon: <Share className="size-[18px] text-[#0a84ff]" />, text: <>Tap {b('Share')} in the address bar</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Tap {b('Add to Home Screen')}</> },
        { icon: <Plus className="size-[18px]" />, text: <>Tap {b('Add')}</> },
      ]
    case 'ios-other':
      return [
        { icon: <Share className="size-[18px] text-[#0a84ff]" />, text: <>Open your browser’s {b('Share')} menu</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Tap {b('Add to Home Screen')}</> },
        { icon: <Plus className="size-[18px]" />, text: <>Tap {b('Add')}</> },
      ]
    case 'android-samsung':
      return [
        { icon: <Menu className="size-[18px]" />, text: <>Tap {b('☰ menu')} at the bottom</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Tap {b('Add page to')} › {b('Home screen')}</> },
        { icon: <Plus className="size-[18px]" />, text: <>Tap {b('Add')}</> },
      ]
    default:
      return [
        { icon: <EllipsisVertical className="size-[18px]" />, text: <>Tap the {b('⋮ menu')} at the top right</> },
        { icon: <SquarePlus className="size-[18px]" />, text: <>Tap {b('Add to Home screen')} or {b('Install app')}</> },
        { icon: <Plus className="size-[18px]" />, text: <>Tap {b('Install')}</> },
      ]
  }
}

/** A tiny animated picture of where to tap: the browser bar, with the button to press pulsing. */
function WhereToTap({ flavor }: { flavor: InstallFlavor }) {
  const bottomBar = flavor === 'ios-safari-26' || flavor === 'ios-safari' || flavor === 'android-samsung'
  const target =
    flavor === 'ios-safari-26' ? <Ellipsis className="size-4" />
    : flavor === 'ios-safari' || flavor === 'ios-chrome' || flavor === 'ios-other' ? <Share className="size-4 text-[#0a84ff]" />
    : flavor === 'android-samsung' ? <Menu className="size-4" />
    : <EllipsisVertical className="size-4" />
  const pulse = (
    <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <span className="ck-radar absolute inset-0 rounded-full bg-accent-accessible/30" />
      <span className="relative">{target}</span>
    </span>
  )
  const url = (
    <span className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-full bg-canvas px-3 text-xs font-medium text-muted shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
      <span className="truncate">inout.fzn.workers.dev</span>
    </span>
  )
  return (
    <div className="relative mx-auto h-40 w-full max-w-[260px] overflow-hidden rounded-card bg-surface-soft ring-1 ring-inset ring-hairline-soft" aria-hidden="true">
      <div className={`absolute inset-x-3 flex items-center gap-2 ${bottomBar ? 'bottom-3' : 'top-3'}`}>
        {flavor === 'ios-safari-26' ? (
          <>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-muted shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"><ChevronLeft className="size-4" /></span>
            {url}
            {pulse}
          </>
        ) : flavor === 'ios-safari' ? (
          <div className="flex w-full items-center justify-around rounded-control bg-canvas/80 py-1.5">{pulse}</div>
        ) : (
          <>
            {url}
            {pulse}
          </>
        )}
      </div>
      <div className={`absolute inset-x-6 grid gap-2 ${bottomBar ? 'top-6' : 'bottom-6'}`}>
        <div className="flex items-center gap-2">
          <RunnerMark size={28} />
          <span className="h-2.5 w-24 rounded-full bg-hairline" />
        </div>
        <span className="h-2 w-40 rounded-full bg-hairline-soft" />
        <span className="h-2 w-32 rounded-full bg-hairline-soft" />
      </div>
    </div>
  )
}

/**
 * "Put InOut on your Home Screen": a bottom sheet with the exact steps for this browser and a
 * picture of where to tap. Chromium with a captured install prompt gets a one-tap Install button.
 */
export function InstallGuide({ open, onOpenChange, install, onSnooze }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when the browser offered a native install prompt. */
  install?: () => Promise<boolean>
  onSnooze: () => void
}) {
  const [flavor, setFlavor] = useState<InstallFlavor>('other')
  const [installing, setInstalling] = useState(false)
  useEffect(() => setFlavor(currentInstallFlavor()), [])
  const steps = installSteps(flavor)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Put InOut on your Home Screen"
      description="Next shift, open it like an app and slide — no scanning, and your phone remembers the location permission."
    >
      {install ? (
        <div className="grid gap-3">
          <ul className="grid gap-2 text-sm text-body">
            {['Opens straight to your check-in', 'Works like an app — nothing to download from a store'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-success-accessible" aria-hidden="true" />{t}</li>
            ))}
          </ul>
          <BigButton
            variant="ink"
            busy={installing}
            icon={<SquarePlus className="size-5" aria-hidden="true" />}
            onClick={async () => {
              setInstalling(true)
              try {
                if (await install()) onOpenChange(false)
              } finally {
                setInstalling(false)
              }
            }}
          >
            Install InOut
          </BigButton>
        </div>
      ) : (
        <div className="grid gap-4">
          <WhereToTap flavor={flavor} />
          <ol className="grid gap-2" aria-label="How to add InOut">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 rounded-control bg-surface-soft px-3 py-2.5 text-sm text-body">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" aria-hidden="true">{i + 1}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-inner bg-canvas text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" aria-hidden="true">{step.icon}</span>
                <span className="min-w-0 leading-snug">{step.text}</span>
              </li>
            ))}
          </ol>
          <BigButton variant="ink" onClick={() => onOpenChange(false)}>Got it</BigButton>
        </div>
      )}
      <button
        type="button"
        onClick={() => { onSnooze(); onOpenChange(false) }}
        className="ui-press mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-control text-sm font-semibold text-muted hover:text-ink"
      >
        Not now
      </button>
    </Sheet>
  )
}

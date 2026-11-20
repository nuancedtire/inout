import { EyeOff, ShieldCheck, Timer } from 'lucide-react'
import { LocationIllustration } from './Illustrations'
import { BigButton, ScreenTitle } from './ui'

/**
 * Shown once, before the browser's own location prompt, so the request never arrives unexplained.
 * "Not now" sends a "denied" reading: the action is still recorded, just flagged.
 */
export function LocationExplainer({ actionLabel, onAllow, onSkip }: {
  actionLabel: string
  onAllow: () => void
  onSkip: () => void
}) {
  const points = [
    { Icon: Timer, text: 'Checked once — only at the moment you check in or out.' },
    { Icon: EyeOff, text: 'We never track you or store where you are. Only “in the department” or not is kept.' },
    { Icon: ShieldCheck, text: 'If your phone can’t tell, you’re still checked in.' },
  ]
  return (
    <div className="ck-screen flex flex-1 flex-col pt-2">
      <div className="flex justify-center pt-2 pb-6">
        <LocationIllustration />
      </div>
      <ScreenTitle className="text-center" sub="Your phone will ask to share your location with InOut.">
        Check you’re in the department
      </ScreenTitle>
      <ul className="ck-stagger mt-7 flex flex-col gap-4">
        {points.map(({ Icon, text }) => (
          <li key={text} className="flex items-start gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink shadow-card" aria-hidden="true">
              <Icon className="size-[18px]" />
            </span>
            <span className="pt-1.5 text-[0.9375rem] leading-relaxed text-body">{text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-1 pt-8">
        <BigButton variant="primary" onClick={onAllow}>Allow location &amp; {actionLabel}</BigButton>
        <BigButton variant="quiet" onClick={onSkip}>Not now</BigButton>
      </div>
    </div>
  )
}

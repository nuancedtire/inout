import { EyeOff, MapPin, ShieldCheck, Timer } from 'lucide-react'
import type { PublicArea } from '#/utils/passkeys.functions'
import { LocationIllustration } from './Illustrations'
import { MapChip, StaffMap } from './StaffMap'
import { BigButton, ScreenTitle } from './ui'

/**
 * Shown once, before the browser's own location prompt, so the request never arrives unexplained
 * (web.dev "Permissions best practices"; Apple HIG: explain first, then one "Continue" that leads
 * to the system prompt). Location is required for staff: there is no "Not now". If the phone
 * refuses, the check-in flow shows how to turn location on.
 */
export function LocationExplainer({ actionLabel, area, onAllow }: {
  actionLabel: string
  area: PublicArea | null | undefined
  onAllow: () => void
}) {
  const points = [
    { Icon: Timer, text: `Checked once, only at the moment you ${actionLabel}.` },
    { Icon: EyeOff, text: 'Never tracked or stored. Only “in the department” or not is kept.' },
    { Icon: ShieldCheck, text: 'It’s how your hours are confirmed, so it’s needed every time.' },
  ]
  return (
    <div className="ck-screen ck-split flex flex-1 flex-col gap-x-10 pt-2 min-[640px]:grid min-[640px]:grid-cols-2 min-[640px]:items-center">
      <div className="relative">
        {area === null ? (
          <div className="flex justify-center pt-2 pb-2"><LocationIllustration /></div>
        ) : (
          <div className="overflow-hidden rounded-card bg-canvas shadow-card">
            <StaffMap
              area={area}
              tone="brand"
              height="var(--ck-map-lg)"
              label="Map of the department. Your check-in needs to be inside the shaded area."
              overlay={<MapChip tone="brand" icon={<MapPin className="text-accent-accessible" />}>Check-in area</MapChip>}
            />
            <p className="flex items-center gap-2 px-4 py-3 text-[0.8125rem] leading-snug text-muted">
              <span className="inline-block size-3 shrink-0 rounded-full border-2 border-primary-500 bg-primary-500/15" aria-hidden="true" />
              Check-ins inside the circle show as “In the department”.
            </p>
          </div>
        )}
      </div>
      <div className="ck-seg-end flex flex-1 flex-col">
        <ScreenTitle className="mt-6 min-[640px]:mt-0" sub="Next, your phone will ask to share your location with InOut.">
          Check you’re in the department
        </ScreenTitle>
        <ul className="ck-stagger mt-5 flex flex-col gap-3.5">
          {points.map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink shadow-card" aria-hidden="true">
                <Icon className="size-[18px]" />
              </span>
              <span className="pt-1.5 text-[0.9375rem] leading-relaxed text-body text-pretty">{text}</span>
            </li>
          ))}
        </ul>
        <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-surface-soft from-70% to-surface-soft/0 px-5 pt-6 pb-1 min-[640px]:static min-[640px]:mx-0 min-[640px]:mt-8 min-[640px]:bg-none min-[640px]:p-0">
          <BigButton variant="primary" onClick={onAllow}>Continue</BigButton>
        </div>
      </div>
    </div>
  )
}

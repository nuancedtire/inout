import { Lock, ShieldCheck, Smartphone } from 'lucide-react'
import type { PasskeyErrorKind } from '#/lib/passkeyClient'
import { unlockCopy, type Platform } from '#/lib/platform'
import { capitalise } from './copy'
import { UnlockIcon, UnlockIllustration } from './Illustrations'
import { Avatar, BigButton, Notice, ScreenTitle, TextLink, Toggle } from './ui'

export type SetupProblem =
  | { kind: PasskeyErrorKind }
  | { kind: 'server'; title: string; message: string }

/** Step 2 of sign-up: create the passkey. */
export function PasskeySetupScreen({ platform, name, role, checkInNow, onCheckInNow, busy, problem, onSetUp, onChangePerson, onIdentify, onWithout }: {
  platform: Platform
  name: string
  role: string | null
  checkInNow: boolean
  onCheckInNow: (v: boolean) => void
  busy: boolean
  problem: SetupProblem | null
  onSetUp: () => void
  onChangePerson: () => void
  onIdentify: () => void
  onWithout: () => void
}) {
  const unlock = unlockCopy(platform)
  return (
    <div className="ck-screen flex flex-1 flex-col pt-2">
      <div className="flex justify-center pt-2 pb-6">
        <UnlockIllustration platform={platform} />
      </div>
      <ScreenTitle
        className="text-center"
        sub={
          <>
            Your phone will ask to save a <span className="font-semibold text-body">passkey</span> for InOut.
            It’s unlocked with {unlock.long} — {platform === 'ios' ? 'your face never leaves your phone' : 'nothing about you leaves your phone'}.
          </>
        }
      >
        Set up {platform === 'other' ? 'your screen lock' : unlock.name === 'fingerprint' ? 'fingerprint sign-in' : unlock.name}
      </ScreenTitle>

      <div className="mt-6 overflow-hidden rounded-[20px] bg-canvas shadow-card">
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <Avatar name={name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">{role ?? 'Setting up this phone'}</p>
          </div>
          <button
            type="button"
            onClick={onChangePerson}
            disabled={busy}
            className="ui-press min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-accent-accessible hover:bg-primary-50 disabled:opacity-45"
          >
            Change
          </button>
        </div>
        <div className="flex items-center gap-3.5 border-t border-hairline-soft px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p id="ck-checkin-now" className="font-semibold text-ink">Check me in now</p>
            <p id="ck-checkin-now-hint" className="text-sm text-muted">Turn off if you’re not starting a shift</p>
          </div>
          <Toggle checked={checkInNow} onChange={onCheckInNow} disabled={busy} labelledBy="ck-checkin-now" describedBy="ck-checkin-now-hint" />
        </div>
      </div>

      {problem ? <ProblemNotice problem={problem} platform={platform} onIdentify={onIdentify} onWithout={onWithout} /> : null}

      <ul className="mt-6 flex flex-col gap-3 text-sm text-body" aria-label="About passkeys">
        <li className="flex gap-3"><ShieldCheck className="mt-px size-5 shrink-0 text-success-accessible" aria-hidden="true" />Nobody else can check in as you — not even with your QR code.</li>
        <li className="flex gap-3"><Smartphone className="mt-px size-5 shrink-0 text-muted" aria-hidden="true" />Saved in {platform === 'ios' ? 'your iCloud Keychain' : platform === 'android' ? 'your Google or Samsung password manager' : 'your password manager'}. No password to remember.</li>
      </ul>

      <div className="mt-auto pt-8">
        <BigButton variant="primary" busy={busy} onClick={onSetUp} icon={<UnlockIcon platform={platform} className="size-[22px]" />}>
          {problem && problem.kind !== 'already_registered' ? 'Try again' : `Set up ${unlock.name}`}
        </BigButton>
      </div>
    </div>
  )
}

function ProblemNotice({ problem, platform, onIdentify, onWithout }: {
  problem: SetupProblem
  platform: Platform
  onIdentify: () => void
  onWithout: () => void
}) {
  const unlock = unlockCopy(platform)
  const without = <TextLink onClick={onWithout} className="-ml-3">Use without {unlock.name}</TextLink>
  switch (problem.kind) {
    case 'cancelled':
      return (
        <Notice tone="neutral" role="alert" title="Set-up was cancelled" className="mt-5" action={without}>
          Nothing was saved. Tap “Try again” and follow your phone’s prompt.
        </Notice>
      )
    case 'already_registered':
      return (
        <Notice
          tone="neutral"
          role="alert"
          title="This phone is already set up for you"
          className="mt-5"
          action={<TextLink onClick={onIdentify} className="-ml-3">Continue with {unlock.name}</TextLink>}
        >
          You don’t need to set it up again.
        </Notice>
      )
    case 'no_screen_lock':
      return (
        <Notice tone="warning" role="alert" icon={<Lock className="size-5" />} title="Your phone needs a screen lock" className="mt-5" action={without}>
          {unlock.screenLockHelp}
        </Notice>
      )
    case 'unsupported':
      return (
        <Notice tone="warning" role="alert" title={`This browser can’t save a passkey`} className="mt-5" action={without}>
          {platform === 'ios' ? 'Open InOut in Safari and try again.' : platform === 'android' ? 'Open InOut in Chrome and try again.' : 'Try a different browser, or check in without it.'}
        </Notice>
      )
    case 'misconfigured':
      return (
        <Notice tone="warning" role="alert" title="InOut can’t set up passkeys at this address" className="mt-5" action={without}>
          Tell the coordinator. You can still check in today.
        </Notice>
      )
    case 'server':
      return (
        <Notice tone="warning" role="alert" title={problem.title} className="mt-5" action={without}>{problem.message}</Notice>
      )
    default:
      return (
        <Notice tone="warning" role="alert" title={`${capitalise(unlock.name)} set-up didn’t finish`} className="mt-5" action={without}>
          Please try again. If it keeps happening, you can check in without it today.
        </Notice>
      )
  }
}

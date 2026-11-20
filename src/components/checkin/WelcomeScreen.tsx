import { ChevronRight, Sparkles } from 'lucide-react'
import { Wordmark } from '#/components/brand/Wordmark'
import { unlockCopy, type Platform } from '#/lib/platform'
import { UnlockIcon } from './Illustrations'
import { BigButton, Notice, ScreenTitle, TextLink } from './ui'

export type WelcomeNotice = { tone: 'neutral' | 'warning'; title: string; message: string } | null

/**
 * First screen on a phone InOut doesn't recognise. Two clear doors: "I've done this before"
 * (a passkey sign-in tells us who you are) and "First time" (sign-up).
 */
export function WelcomeScreen({ platform, supported, busy, notice, dateLabel, onIdentify, onSignUp, onWithout }: {
  platform: Platform
  supported: boolean
  busy: boolean
  notice: WelcomeNotice
  dateLabel: string
  onIdentify: () => void
  onSignUp: () => void
  onWithout: () => void
}) {
  const unlock = unlockCopy(platform)
  return (
    <div className="ck-screen flex flex-1 flex-col">
      <div className="ck-stagger flex flex-1 flex-col items-center justify-center pt-4 pb-2 text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-x-6 -inset-y-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,56,92,0.14),transparent)]" aria-hidden="true" />
          <Wordmark size="lg" as="p" className="relative" />
        </div>
        <ScreenTitle sub={dateLabel}>Check in for your shift</ScreenTitle>
      </div>

      {notice ? (
        <Notice tone={notice.tone} role="status" title={notice.title} className="mt-6">{notice.message}</Notice>
      ) : null}

      <div className="flex flex-col gap-3 pt-6">
        {supported ? (
          <>
            <BigButton
              variant="ink"
              busy={busy}
              onClick={onIdentify}
              icon={<UnlockIcon platform={platform} className="size-[22px]" />}
              describedBy="ck-identify-hint"
            >
              Continue with {unlock.name}
            </BigButton>
            <p id="ck-identify-hint" className="-mt-1 text-center text-sm text-muted">If you’ve used InOut on this phone before</p>

            <div className="my-2 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.08em] text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-hairline" />or<span className="h-px flex-1 bg-hairline" />
            </div>

            <button
              type="button"
              onClick={onSignUp}
              disabled={busy}
              className="ui-press group flex min-h-[76px] w-full items-center gap-4 rounded-[20px] bg-canvas px-5 py-4 text-left shadow-card hover:shadow-hover disabled:opacity-45"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-accent-accessible" aria-hidden="true">
                <Sparkles className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-ink">First time here?</span>
                <span className="mt-0.5 block text-sm text-muted">Set up this phone in about 30 seconds</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <Notice tone="neutral" title="This browser can’t use Face ID or fingerprint sign-in">
              Open this page in Safari on iPhone or Chrome on Android to set up your phone. You can still check in now
              by choosing your name — it’ll be marked for the coordinator to check.
            </Notice>
            <BigButton variant="ink" onClick={onWithout}>Choose my name</BigButton>
          </>
        )}
      </div>

      {supported ? (
        <div className="mt-3 flex justify-center">
          <TextLink onClick={onWithout} className="text-sm font-medium !text-muted hover:!text-ink">
            Can’t use {unlock.name}? Check in without it
          </TextLink>
        </div>
      ) : null}
    </div>
  )
}

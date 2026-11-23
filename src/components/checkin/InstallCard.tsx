import { useEffect, useState } from 'react'
import { SquarePlus, X } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { useInstallState } from '#/lib/installPrompt'
import { InstallGuide } from './InstallGuide'

const GUIDE_SHOWN_KEY = 'inout-install-guide-shown'
function guideShown() {
  try { return localStorage.getItem(GUIDE_SHOWN_KEY) === '1' } catch { return true }
}
function markGuideShown() {
  try { localStorage.setItem(GUIDE_SHOWN_KEY, '1') } catch { /* storage unavailable */ }
}

/**
 * Encourages Add to Home Screen. Chromium: one-tap install from the captured prompt.
 * Others: a guide sheet with this browser's exact steps (opened once by itself after a first check-in). Hidden when already installed; "Not now" snoozes for 7 days.
 */
export function InstallCard({ autoOpen = false, reminders = false }: {
  autoOpen?: boolean
  /** iPhone tab with reminders available: say the Home Screen app is what gets them. */
  reminders?: boolean
}) {
  const [state, dismiss] = useInstallState()
  const [open, setOpen] = useState(false)
  // Right after someone's first check-in: open the guide once, by itself, after the success moment.
  useEffect(() => {
    if (!autoOpen || state.kind === 'hidden' || guideShown()) return
    const id = window.setTimeout(() => { markGuideShown(); setOpen(true) }, 1600)
    return () => window.clearTimeout(id)
  }, [autoOpen, state.kind])
  if (state.kind === 'hidden') return null

  return (
    <section
      aria-labelledby="ck-install-title"
      className="animate-reveal relative overflow-hidden rounded-card bg-canvas p-4 shadow-card"
    >
      <div className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-[radial-gradient(circle,rgba(255,56,92,0.12),transparent_70%)]" aria-hidden="true" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="ui-press absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-strong hover:text-ink"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-3.5 pr-8">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-canvas shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_10px_-4px_rgba(0,0,0,0.2)]" aria-hidden="true">
          <RunnerMark size={34} />
        </span>
        <div className="min-w-0">
          <h2 id="ck-install-title" className="font-semibold leading-snug text-ink text-balance">
            {reminders ? 'Add InOut to your Home Screen to get reminders' : 'Add InOut to your Home Screen'}
          </h2>
          <p className="text-sm leading-snug text-muted text-pretty">
            {reminders
              ? 'iPhone only sends reminders to the Home Screen app.'
              : 'Next shift, open it and slide. No scanning.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`ui-press mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-5 font-semibold ${state.kind === 'prompt' ? 'bg-ink text-white hover:bg-neutral-800' : 'bg-surface-strong text-ink hover:bg-neutral-200'}`}
      >
        <SquarePlus className="size-5" aria-hidden="true" />
        {state.kind === 'prompt' ? 'Install InOut' : 'Show me how'}
      </button>
      <InstallGuide
        open={open}
        onOpenChange={setOpen}
        install={state.kind === 'prompt' ? state.install : undefined}
        onSnooze={dismiss}
      />
    </section>
  )
}

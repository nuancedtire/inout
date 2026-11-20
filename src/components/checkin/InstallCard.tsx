import { useId, useState } from 'react'
import { ChevronDown, EllipsisVertical, Plus, Share, SquarePlus, X } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { useInstallState } from '#/lib/installPrompt'

/**
 * Encourages Add to Home Screen. Chromium: one-tap install from the captured prompt.
 * iOS: three illustrated steps. Hidden when already installed; "Not now" snoozes for 7 days.
 */
export function InstallCard() {
  const [state, dismiss] = useInstallState()
  const [installing, setInstalling] = useState(false)
  const [open, setOpen] = useState(false)
  const stepsId = useId()
  if (state.kind === 'hidden') return null

  return (
    <section
      aria-labelledby="ck-install-title"
      className="animate-reveal relative overflow-hidden rounded-[24px] bg-canvas p-4 shadow-card"
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
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-canvas shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_10px_-4px_rgba(0,0,0,0.2)]" aria-hidden="true">
          <RunnerMark size={34} />
        </span>
        <div className="min-w-0">
          <h2 id="ck-install-title" className="font-semibold leading-snug text-ink">Add InOut to your Home Screen</h2>
          <p className="text-sm leading-snug text-muted">One tap next shift — scan the QR right inside the app.</p>
        </div>
      </div>

      {state.kind === 'prompt' ? (
        <button
          type="button"
          disabled={installing}
          onClick={async () => {
            setInstalling(true)
            try {
              await state.install()
            } finally {
              setInstalling(false)
            }
          }}
          className="ui-press mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ink px-5 font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          <SquarePlus className="size-5" aria-hidden="true" />
          Install InOut
        </button>
      ) : (
        <>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={stepsId}
          onClick={() => setOpen((o) => !o)}
          className="ui-press mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-surface-strong px-4 text-sm font-semibold text-ink hover:bg-neutral-200"
        >
          {open ? 'Hide steps' : 'Show me how'}
          <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <ol id={stepsId} hidden={!open} className="mt-3 grid gap-2" aria-label="How to add InOut">
          {(state.platform === 'ios'
            ? [
                { icon: <Share className="size-[18px] text-[#0a84ff]" />, text: <>Tap <b className="font-semibold text-ink">Share</b> in Safari’s toolbar</> },
                { icon: <SquarePlus className="size-[18px]" />, text: <>Choose <b className="font-semibold text-ink">Add to Home Screen</b></> },
                { icon: <Plus className="size-[18px]" />, text: <>Keep <b className="font-semibold text-ink">Open as Web App</b> on, then tap <b className="font-semibold text-ink">Add</b></> },
              ]
            : [
                { icon: <EllipsisVertical className="size-[18px]" />, text: <>Tap the <b className="font-semibold text-ink">⋮ menu</b> in your browser</> },
                { icon: <SquarePlus className="size-[18px]" />, text: <>Choose <b className="font-semibold text-ink">Add to Home screen</b> or <b className="font-semibold text-ink">Install app</b></> },
                { icon: <Plus className="size-[18px]" />, text: <>Tap <b className="font-semibold text-ink">Install</b> to confirm</> },
              ]
          ).map((step, i) => (
            <li key={i} className="flex items-center gap-3 rounded-[14px] bg-surface-soft px-3 py-2.5 text-sm text-body">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" aria-hidden="true">{i + 1}</span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-canvas text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" aria-hidden="true">{step.icon}</span>
              <span className="min-w-0">{step.text}</span>
            </li>
          ))}
        </ol>
        </>
      )}
    </section>
  )
}

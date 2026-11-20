import { Check } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'

export type WorkStage = { key: string; label: string }

/**
 * In-progress state: the runner runs while the phone confirms identity, reads location and saves.
 * Stages tick off as they finish so a slow GPS fix never looks like a hang.
 */
export function WorkingScreen({ title, stages, current }: { title: string; stages: WorkStage[]; current: number }) {
  const active = stages[Math.min(current, stages.length - 1)]
  return (
    <div className="ck-screen flex flex-1 flex-col items-center justify-center pb-16 text-center">
      <div className="relative mb-8">
        <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,56,92,0.14),transparent_70%)]" aria-hidden="true" />
        <RunnerMark size={104} animate="run" />
      </div>
      <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="sr-only" role="status" aria-live="polite">{active?.label}</p>
      <ol className="mt-6 flex w-full max-w-[280px] flex-col gap-3 text-left" aria-hidden="true">
        {stages.map((stage, i) => {
          const done = i < current
          const now = i === current
          return (
            <li key={stage.key} className={`flex items-center gap-3 text-[0.9375rem] transition-colors duration-300 ${done ? 'text-body' : now ? 'font-semibold text-ink' : 'text-muted'}`}>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${done ? 'bg-success-accessible text-white' : now ? 'bg-ink/8' : 'bg-transparent ring-1 ring-inset ring-hairline'}`}>
                {done ? <Check className="size-3.5" strokeWidth={3} /> : now ? <span className="spinner size-3.5 rounded-full border-2 border-ink border-r-transparent" /> : null}
              </span>
              {stage.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

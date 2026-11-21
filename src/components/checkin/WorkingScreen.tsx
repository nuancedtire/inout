import { Check, LocateFixed } from 'lucide-react'
import { RunnerMark } from '#/components/brand/RunnerMark'
import type { MapFix } from '#/components/maps/AreaMap'
import type { PublicArea } from '#/utils/passkeys.functions'
import { MapChip, StaffMap } from './StaffMap'

export type WorkStage = { key: string; label: string }

/**
 * In-progress state: the runner runs while the phone confirms identity, reads location and saves.
 * Stages tick off as they finish so a slow GPS fix never looks like a hang. When the check
 * includes location, a small map of the department shows the reading arrive.
 */
export function WorkingScreen({ title, stages, current, area, position }: {
  title: string
  stages: WorkStage[]
  current: number
  area?: PublicArea | null
  position?: MapFix | null
}) {
  const active = stages[Math.min(current, stages.length - 1)]
  const locIndex = stages.findIndex((s) => s.key === 'loc')
  const withMap = locIndex >= 0 && !!area
  const locating = withMap && current === locIndex && !position

  const list = (
    <ol className="mt-6 flex w-full max-w-[300px] flex-col gap-3 text-left" aria-hidden="true">
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
  )

  if (!withMap) {
    return (
      <div className="ck-screen flex flex-1 flex-col items-center justify-center pb-16 text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,56,92,0.14),transparent_70%)]" aria-hidden="true" />
          <RunnerMark size={104} animate="run" />
        </div>
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="sr-only" role="status" aria-live="polite">{active?.label}</p>
        {list}
      </div>
    )
  }

  return (
    <div className="ck-screen ck-split flex flex-1 flex-col justify-center gap-x-10 pb-8 min-[640px]:grid min-[640px]:grid-cols-2 min-[640px]:items-center">
      <div className="ck-seg-end overflow-hidden rounded-card bg-canvas shadow-card min-[640px]:order-2">
        <StaffMap
          area={area}
          position={position ?? null}
          tone="brand"
          scanning={locating}
          height="var(--ck-map-lg)"
          label={position ? 'Map of the department with your location.' : 'Map of the department. Finding your location.'}
          overlay={
            <MapChip tone="brand" icon={<LocateFixed className="text-accent-accessible" />}>
              {position ? `Found you · ±${Math.ceil(position.accuracy)} m` : current < locIndex ? 'Department' : 'Finding you…'}
            </MapChip>
          }
        />
      </div>
      <div className="mt-8 flex flex-col items-center text-center min-[640px]:mt-0 min-[640px]:order-1">
        <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
          <RunnerMark size={44} animate="run" />
          {title}
        </h1>
        <p className="sr-only" role="status" aria-live="polite">{active?.label}</p>
        {list}
      </div>
    </div>
  )
}

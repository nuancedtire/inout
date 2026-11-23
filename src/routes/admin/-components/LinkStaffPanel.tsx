import { useMemo, useState } from 'react'
import { Check, ChevronDown, Link2, Sparkles, TriangleAlert, UserRoundPlus } from 'lucide-react'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { relativeTime } from '#/utils/dateTime'
import type { StaffListRow } from '#/routes/admin/-types'
import { inputClass, Panel } from './kit'

export type UnlinkedEntry = {
  entryId: number
  name: string
  reason: 'ambiguous' | 'suggested' | 'no_match'
  candidates: { id: number; name: string; role: string | null }[]
}

function staffOptionLabel(s: StaffListRow) {
  const bits = [s.name, s.role, s.lastSeenAt ? `seen ${relativeTime(s.lastSeenAt)}` : 'not seen yet']
  return bits.filter(Boolean).join(' · ')
}

/**
 * Rota names without a staff profile. Names that match one profile (titles and notes such as
 * "(locum)" ignored, or a spelling linked by hand before) link on upload; these are the rest.
 * Only suggestions and ambiguous names need a decision. Names with no profile yet link by
 * themselves when that person sets up their phone, so they are summarised in a single line.
 */
export function LinkStaffPanel({
  unlinked,
  staff,
  onLink,
  onConfirmAll,
  linkingId,
}: {
  unlinked: UnlinkedEntry[]
  staff: StaffListRow[]
  onLink: (entryId: number, staffId: number) => Promise<void>
  onConfirmAll: (links: { entryId: number; staffId: number }[]) => Promise<void>
  linkingId: number | null
}) {
  const active = useMemo(() => staff.filter((s) => s.active), [staff])
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const suggested = unlinked.filter((u) => u.reason === 'suggested')
  const ambiguous = unlinked.filter((u) => u.reason === 'ambiguous')
  const noMatch = unlinked.filter((u) => u.reason === 'no_match')
  const oneSuggestion = suggested.filter((u) => u.candidates.length === 1)
  const [showNew, setShowNew] = useState(false)
  const [confirmingAll, setConfirmingAll] = useState(false)

  if (unlinked.length === 0) return null

  const confirmAll = async () => {
    setConfirmingAll(true)
    try {
      await onConfirmAll(oneSuggestion.map((u) => ({ entryId: u.entryId, staffId: u.candidates[0].id })))
    } finally {
      setConfirmingAll(false)
    }
  }

  const newNamesLine = noMatch.length > 0 ? (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <UserRoundPlus className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="min-w-[12rem] flex-1 text-sm text-body">
          <strong className="font-semibold text-ink">
            {noMatch.length} new {noMatch.length === 1 ? 'name' : 'names'}
          </strong>{' '}
          will link {noMatch.length === 1 ? 'itself' : 'themselves'} when {noMatch.length === 1 ? 'that person' : 'each person'} first checks in.
          Nothing to do.
        </p>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          aria-expanded={showNew}
          className="ui-press inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-accent-accessible hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {showNew ? 'Hide' : 'Link by hand'}
          <ChevronDown className={cn('size-4 transition-transform', showNew && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {showNew ? (
        <ul className="flex flex-col gap-2">
          {noMatch.map((u) => (
            <PickRow key={u.entryId} entry={u} staff={active} onLink={onLink} linking={linkingId === u.entryId} />
          ))}
        </ul>
      ) : null}
    </section>
  ) : null

  // Only new names: one quiet line, not a to-do list.
  if (suggested.length === 0 && ambiguous.length === 0) {
    return <div data-tour="link-staff" className="@container rounded-card border border-hairline-soft bg-canvas px-5 py-2 shadow-card">{newNamesLine}</div>
  }

  return (
    <Panel
      tour="link-staff"
      title="Rota names to check"
      count={suggested.length + ambiguous.length}
      icon={<Link2 />}
      description="Linking a rota name to a staff profile lets their phone check them in against this rota. InOut remembers each link you make, so the same spelling links itself on future rotas."
      actions={oneSuggestion.length > 1 ? (
        <Button variant="secondary" size="sm" loading={confirmingAll} disabled={linkingId !== null} onClick={confirmAll}>
          <Check className="size-4" aria-hidden="true" />
          Confirm all {oneSuggestion.length}
        </Button>
      ) : null}
    >
      <div className="@container flex flex-col gap-5">
        {suggested.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-sm text-body">
                <strong className="font-semibold text-ink">Did you mean…?</strong> These names are close to an existing profile — a
                title, initial, middle name or small typo apart. Confirm the ones that are the same person.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {suggested.map((u) => (
                <SuggestionRow
                  key={u.entryId}
                  entry={u}
                  staff={active}
                  byId={byId}
                  onLink={onLink}
                  linking={linkingId === u.entryId || (confirmingAll && u.candidates.length === 1)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {ambiguous.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-control bg-warning-50 px-4 py-3 text-sm text-warning-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Same name, more than one match.</strong> These names match several profiles, or appear
                twice on the rota, so InOut won’t guess. Pick the right person — check the role and when they were last seen.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {ambiguous.map((u) => (
                <PickRow key={u.entryId} entry={u} staff={active} onLink={onLink} linking={linkingId === u.entryId} />
              ))}
            </ul>
          </section>
        ) : null}

        {newNamesLine ? <div className="border-t border-hairline-soft pt-4">{newNamesLine}</div> : null}
      </div>
    </Panel>
  )
}

/** One suggested profile: confirm in one tap. Several look-alikes, or a wrong guess: pick from the list. */
function SuggestionRow({
  entry,
  staff,
  byId,
  onLink,
  linking,
}: {
  entry: UnlinkedEntry
  staff: StaffListRow[]
  byId: Map<number, StaffListRow>
  onLink: (entryId: number, staffId: number) => Promise<void>
  linking: boolean
}) {
  const [picking, setPicking] = useState(entry.candidates.length > 1)
  if (picking) return <PickRow entry={entry} staff={staff} onLink={onLink} linking={linking} />
  const [match] = entry.candidates
  const seen = byId.get(match.id)?.lastSeenAt

  return (
    <li className="flex flex-col gap-2 rounded-control border border-hairline-soft p-3 @lg:flex-row @lg:items-center @lg:gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words text-ink">{entry.name}</p>
        <p className="text-sm break-words text-muted">
          Looks like <span className="font-semibold text-ink">{match.name}</span>
          {[match.role, seen ? `seen ${relativeTime(seen)}` : 'not seen yet'].filter(Boolean).map((bit) => ` · ${bit}`)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="md" disabled={linking} onClick={() => setPicking(true)}>
          Someone else
        </Button>
        <Button variant="secondary" loading={linking} onClick={() => onLink(entry.entryId, match.id)}>
          <Check className="size-4" aria-hidden="true" />
          Confirm
        </Button>
      </div>
    </li>
  )
}

function PickRow({
  entry,
  staff,
  onLink,
  linking,
}: {
  entry: UnlinkedEntry
  staff: StaffListRow[]
  onLink: (entryId: number, staffId: number) => Promise<void>
  linking: boolean
}) {
  const [choice, setChoice] = useState('')
  const candidateIds = new Set(entry.candidates.map((c) => c.id))
  const likely = staff.filter((s) => candidateIds.has(s.id))
  const others = staff.filter((s) => !candidateIds.has(s.id))
  const selectId = `link-${entry.entryId}`

  return (
    <li className="flex flex-col gap-2 rounded-control border border-hairline-soft p-3 @lg:flex-row @lg:items-center @lg:gap-3">
      <div className="min-w-0 @lg:w-48">
        <label htmlFor={selectId} className="block font-semibold break-words text-ink">
          {entry.name}
        </label>
        <p className={cn('text-xs', entry.reason === 'ambiguous' ? 'text-warning-800' : 'text-muted')}>
          {entry.reason === 'ambiguous'
            ? likely.length > 1
              ? `${likely.length} profiles have this name`
              : 'Appears more than once on the rota'
            : entry.reason === 'suggested'
              ? `${likely.length} similar ${likely.length === 1 ? 'profile' : 'profiles'}`
              : 'No profile with this name'}
        </p>
      </div>
      <div className="relative min-w-0 flex-1">
        <select
          id={selectId}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={cn(inputClass, 'appearance-none pr-10', !choice && 'text-muted')}
        >
          <option value="">Leave unlinked</option>
          {likely.length > 0 ? (
            <optgroup label={entry.reason === 'ambiguous' ? 'Same name' : 'Similar name'}>
              {likely.map((s) => (
                <option key={s.id} value={s.id}>
                  {staffOptionLabel(s)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {others.length > 0 ? (
            <optgroup label="Everyone else">
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {staffOptionLabel(s)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
      <Button variant="secondary" disabled={!choice} loading={linking} onClick={() => onLink(entry.entryId, Number(choice))}>
        <Link2 className="size-4" aria-hidden="true" />
        Link
      </Button>
    </li>
  )
}

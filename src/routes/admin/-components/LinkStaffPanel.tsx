import { useMemo, useState } from 'react'
import { ChevronDown, Link2, TriangleAlert, UserRoundPlus } from 'lucide-react'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { relativeTime } from '#/utils/dateTime'
import { normalizeName } from '#/utils/staffNames'
import type { StaffListRow } from '#/routes/admin/-types'
import { inputClass, Panel } from './kit'

export type UnlinkedEntry = { entryId: number; name: string; reason: 'no_match' | 'ambiguous' }

function staffOptionLabel(s: StaffListRow) {
  const bits = [s.name, s.role, s.lastSeenAt ? `seen ${relativeTime(s.lastSeenAt)}` : 'not seen yet']
  return bits.filter(Boolean).join(' · ')
}

/**
 * Rota names without a stable staff profile. Exact, unambiguous names link automatically on
 * upload; these are the rest. Ambiguous names need a person to pick; unmatched names link by
 * themselves when that person sets up their phone, so linking them is optional.
 */
export function LinkStaffPanel({
  unlinked,
  staff,
  onLink,
  linkingId,
}: {
  unlinked: UnlinkedEntry[]
  staff: StaffListRow[]
  onLink: (entryId: number, staffId: number) => Promise<void>
  linkingId: number | null
}) {
  const ambiguous = unlinked.filter((u) => u.reason === 'ambiguous')
  const noMatch = unlinked.filter((u) => u.reason === 'no_match')
  const [showAll, setShowAll] = useState(ambiguous.length === 0 && noMatch.length <= 3)
  const active = useMemo(() => staff.filter((s) => s.active), [staff])

  if (unlinked.length === 0) return null

  return (
    <Panel
      tour="link-staff"
      title="Rota names to link"
      count={unlinked.length}
      icon={<Link2 />}
      description="Linking a rota name to a staff profile lets their phone check them in against this rota. Names that exactly match one profile were linked automatically."
    >
      <div className="flex flex-col gap-5">
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
                <LinkRow key={u.entryId} entry={u} staff={active} onLink={onLink} linking={linkingId === u.entryId} />
              ))}
            </ul>
          </section>
        ) : null}

        {noMatch.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <UserRoundPlus className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-sm text-body">
                <strong className="font-semibold text-ink">{noMatch.length} {noMatch.length === 1 ? 'name has' : 'names have'} no profile yet.</strong>{' '}
                Nothing to do: each links automatically the first time that person checks in with their phone. Link one now only if the
                rota spells a name differently from their profile.
              </p>
            </div>
            {showAll ? (
              <ul className="flex flex-col gap-2">
                {noMatch.map((u) => (
                  <LinkRow key={u.entryId} entry={u} staff={active} onLink={onLink} linking={linkingId === u.entryId} />
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="ui-press inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-control border border-hairline px-4 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Show {noMatch.length} names
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            )}
          </section>
        ) : null}
      </div>
    </Panel>
  )
}

function LinkRow({
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
  const key = normalizeName(entry.name)
  const sameName = staff.filter((s) => normalizeName(s.name) === key)
  const others = staff.filter((s) => normalizeName(s.name) !== key)
  const selectId = `link-${entry.entryId}`

  return (
    <li className="flex flex-col gap-2 rounded-control border border-hairline-soft p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 sm:w-48">
        <label htmlFor={selectId} className="block truncate font-semibold text-ink">
          {entry.name}
        </label>
        <p className={cn('text-xs', entry.reason === 'ambiguous' ? 'text-warning-800' : 'text-muted')}>
          {entry.reason === 'ambiguous'
            ? sameName.length > 1
              ? `${sameName.length} profiles have this name`
              : 'Appears more than once on the rota'
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
          {sameName.length > 0 ? (
            <optgroup label="Same name">
              {sameName.map((s) => (
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

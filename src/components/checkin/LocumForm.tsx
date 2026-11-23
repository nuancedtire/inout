import { useMemo, useState } from 'react'
import { nameKey } from '#/utils/staffNames'
import type { RosterEntry } from './RosterPicker'
import { Avatar, BigButton, Notice, ScreenTitle, Sheet, TextField } from './ui'

/** Locum / bank / agency self-entry: name and role. */
export function LocumForm({ entries, onSubmit, onPickExisting, submitLabel = 'Continue' }: {
  entries: RosterEntry[]
  onSubmit: (person: { name: string; role: string }) => void
  onPickExisting: (entry: RosterEntry) => void
  submitLabel?: string
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState<string | null>(null)

  const match = useMemo(() => {
    const n = nameKey(name)
    return n ? entries.find((e) => nameKey(e.name) === n) ?? null : null
  }, [entries, name])

  const roleSuggestions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries) {
      const r = e.role?.trim()
      if (r && !seen.has(r.toLowerCase())) seen.set(r.toLowerCase(), r)
    }
    return [...seen.values()].slice(0, 6)
  }, [entries])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed.length < 2) return setError('Enter your full name as it appears on your timesheet.')
    if (trimmed.length > 200) return setError('That name is too long.')
    onSubmit({ name: trimmed, role: role.trim().slice(0, 100) })
  }

  return (
    <form onSubmit={submit} noValidate className="ck-screen flex flex-1 flex-col pt-2">
      <ScreenTitle sub="For locum, bank and agency staff. You’ll be added to today’s rota so your hours are recorded.">
        Add yourself
      </ScreenTitle>

      <div className="mt-6 flex flex-col gap-5">
        <TextField
          label="Full name"
          value={name}
          onChange={(e) => {
            setError(null)
            setName(e.target.value)
          }}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="e.g. Dr Sam Patel"
          error={error}
          hint="As it appears on your timesheet"
        />

        {match ? (
          <Notice
            tone="neutral"
            title={`${match.name} is already on today’s rota`}
            action={
              <button
                type="button"
                onClick={() => onPickExisting(match)}
                className="ui-press inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-sm font-semibold text-white"
              >
                That’s me
              </button>
            }
          >
            If that’s you, pick your rota entry instead. Carry on only if you’re a different person.
          </Notice>
        ) : null}

        <div>
          <TextField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            autoComplete="organization-title"
            autoCapitalize="words"
            enterKeyHint="done"
            placeholder="e.g. ED Registrar, Staff Nurse"
          />
          {roleSuggestions.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Common roles">
              {roleSuggestions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`ui-press min-h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${role === r ? 'bg-ink text-white ring-ink' : 'bg-canvas text-body ring-hairline hover:ring-ink/30'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-auto pt-8">
        <BigButton type="submit" variant="ink" disabled={name.trim().length === 0}>{submitLabel}</BigButton>
      </div>
    </form>
  )
}

export type Person =
  | { kind: 'entry'; entry: RosterEntry }
  | { kind: 'locum'; name: string; role: string }

export function personName(p: Person) {
  return p.kind === 'entry' ? p.entry.name : p.name
}

export function personRole(p: Person) {
  return p.kind === 'entry' ? p.entry.role : p.role || null
}

/** "You're signing up as …" — the one moment we ask people to be sure. */
export function ConfirmPersonSheet({ person, onConfirm, onCancel, mode = 'enrol' }: {
  person: Person | null
  onConfirm: () => void
  onCancel: () => void
  mode?: 'enrol' | 'fallback'
}) {
  const name = person ? personName(person) : ''
  const role = person ? personRole(person) : null
  return (
    <Sheet
      open={!!person}
      onOpenChange={(o) => !o && onCancel()}
      title={mode === 'enrol' ? 'Is this you?' : 'Check in as this person?'}
      description={mode === 'enrol'
        ? 'This phone will be linked to this name. Only you should use it — the coordinator will confirm it.'
        : 'Only check in as yourself. This will be marked for the coordinator to check.'}
    >
      {person ? (
        <>
          <div className="flex items-center gap-4 rounded-control bg-surface-soft p-4">
            <Avatar name={name} size={52} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-muted">{role ?? (person.kind === 'locum' ? 'Locum' : 'On today’s rota')}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <BigButton variant="ink" onClick={onConfirm}>Yes, that’s me</BigButton>
            <BigButton variant="quiet" onClick={onCancel}>Choose someone else</BigButton>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}

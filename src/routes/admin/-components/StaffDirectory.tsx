import { useMemo, useState } from 'react'
import { ChevronDown, Power, Search, Smartphone, UsersRound } from 'lucide-react'
import { EmptyState } from '#/components/EmptyState'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import { adminSetCredentialStatus, adminSetStaffActive } from '#/utils/staff.functions'
import { formatDateTime, relativeTime } from '#/utils/dateTime'
import { normalizeName } from '#/utils/staffNames'
import { cn } from '#/lib/utils'
import { useAdminContext } from '#/routes/admin/-context'
import type { EnrolmentRow, StaffListRow } from '#/routes/admin/-types'
import { errorText, FilterChips, inputClass, linkButtonClass, Notice, Panel, StaffAvatar } from './kit'
import { phoneLabel, PhoneStatus, syncText } from './ApprovalsTab'
import { joinNames } from './verification'

type Filter = 'all' | 'approved' | 'waiting' | 'none' | 'off'

function matches(s: StaffListRow, filter: Filter) {
  const c = s.credentials
  switch (filter) {
    case 'all':
      return true
    case 'approved':
      return s.active && c.approved > 0
    case 'waiting':
      return s.active && c.pending > 0
    case 'none':
      return s.active && c.approved + c.pending === 0
    case 'off':
      return !s.active
  }
}

function PhoneSummary({ s }: { s: StaffListRow }) {
  const { approved, pending } = s.credentials
  if (!s.active) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-strong px-2.5 text-xs font-semibold text-body ring-1 ring-inset ring-hairline">
        <Power className="size-3.5" aria-hidden="true" />
        Turned off
      </span>
    )
  }
  if (approved + pending === 0) {
    return <span className="text-xs font-medium text-muted">No phone yet</span>
  }
  return (
    <span className="flex flex-wrap gap-1.5 sm:justify-end">
      {approved > 0 ? <PhoneStatus status="approved" /> : null}
      {pending > 0 ? <PhoneStatus status="pending" /> : null}
    </span>
  )
}

/** Everyone with a stable staff record: their phones, revocation and turning a profile off. */
export function StaffDirectory({
  staff,
  enrolments,
  onChanged,
}: {
  staff: StaffListRow[]
  enrolments: EnrolmentRow[]
  onChanged: () => Promise<void> | void
}) {
  const { authToken } = useAdminContext()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  const phonesByStaff = useMemo(() => {
    const map = new Map<number, EnrolmentRow[]>()
    for (const e of enrolments) map.set(e.staffId, [...(map.get(e.staffId) ?? []), e])
    return map
  }, [enrolments])

  const q = normalizeName(query)
  const searched = staff.filter((s) => !q || normalizeName(`${s.name} ${s.role ?? ''}`).includes(q))
  const visible = searched.filter((s) => matches(s, filter))
  const count = (f: Filter) => searched.filter((s) => matches(s, f)).length

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      setNotice({ text: success, tone: 'success' })
    } catch (e) {
      setNotice({ text: errorText(e, 'That didn’t work. Please try again.'), tone: 'error' })
    }
    await onChanged()
  }

  const revoke = (s: StaffListRow, phone: EnrolmentRow) =>
    setConfirm({
      title: `Revoke ${s.name}'s ${phoneLabel(phone)}?`,
      message: `Lost phone? Revoking stops it working immediately. ${s.name} can still check in by choosing their name, and can set up a new phone. Attendance already recorded is kept.`,
      confirmLabel: 'Revoke phone',
      confirmVariant: 'danger',
      onConfirm: () =>
        run(
          () => adminSetCredentialStatus({ data: { authToken, credentialId: phone.credentialId, status: 'revoked' } }),
          `${s.name}'s ${phoneLabel(phone)} was revoked.`,
        ),
    })

  const setActive = (s: StaffListRow, active: boolean) => {
    const apply = async () => {
      setBusy(s.id)
      await run(
        () => adminSetStaffActive({ data: { authToken, staffId: s.id, active } }),
        active ? `${s.name}'s profile is back on.` : `${s.name}'s profile is turned off.`,
      )
      setBusy(null)
    }
    if (active) return void apply()
    setConfirm({
      title: `Turn off ${s.name}'s profile?`,
      message:
        'Their phones stop working for check-in straight away, and new rota uploads won’t link to this profile. Attendance already recorded is kept. You can turn it back on at any time.',
      confirmLabel: 'Turn off',
      confirmVariant: 'warning',
      onConfirm: apply,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {notice ? <Notice message={notice.text} tone={notice.tone} onClose={() => setNotice(null)} /> : null}
      <Panel
        tour="staff-list"
        title="Staff"
        count={staff.length}
        icon={<UsersRound />}
        description="Profiles are created when someone sets up their phone, or when a rota name is linked. People are never deleted — turn a profile off instead."
        flush
      >
        <div className="flex flex-col gap-3 border-b border-hairline-soft px-5 py-4">
          <label className="relative block">
            <span className="sr-only">Search staff</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or role"
              className={cn(inputClass, 'pl-10')}
            />
          </label>
          <div className="relative -mx-1 overflow-x-auto px-1 pb-1">
            <FilterChips
              label="Filter staff"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'approved', label: 'Phone approved', count: count('approved') },
                { value: 'waiting', label: 'Waiting', count: count('waiting') },
                { value: 'none', label: 'No phone', count: count('none') },
                { value: 'off', label: 'Turned off', count: count('off') },
              ]}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title={staff.length === 0 ? 'No staff profiles yet' : 'No one matches'}
            description={
              staff.length === 0
                ? 'Profiles appear when people set up their phone at check-in, or when you link rota names on the Roster page.'
                : 'Try a different name or filter.'
            }
          />
        ) : (
          <ul className="divide-y divide-hairline-soft">
            {visible.map((s) => {
              const phones = (phonesByStaff.get(s.id) ?? []).filter((p) => p.status === 'pending' || p.status === 'approved')
              const past = (phonesByStaff.get(s.id) ?? []).filter((p) => p.status === 'rejected' || p.status === 'revoked')
              const open = expanded === s.id
              const panelId = `staff-${s.id}-details`
              return (
                <li key={s.id} className={cn(open && 'bg-surface-soft/60')}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpanded(open ? null : s.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <StaffAvatar name={s.name} muted={!s.active} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-semibold', s.active ? 'text-ink' : 'text-muted')}>{s.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {s.role || 'No role'}
                        {s.lastSeenAt ? ` · seen ${relativeTime(s.lastSeenAt)}` : ''}
                      </span>
                      <span className="mt-1.5 flex sm:hidden">
                        <PhoneSummary s={s} />
                      </span>
                    </span>
                    <span className="hidden sm:flex">
                      <PhoneSummary s={s} />
                    </span>
                    <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
                  </button>
                  {open ? (
                    <div id={panelId} className="animate-reveal flex flex-col gap-3 px-5 pb-5 pl-5 sm:pl-[4.25rem]">
                      {phones.length === 0 ? (
                        <p className="rounded-control border border-dashed border-hairline px-4 py-3 text-sm text-muted">
                          No working phone. {s.name.split(' ')[0]} can set one up from the check-in page.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {phones.map((p) => (
                            <li key={p.credentialId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-hairline-soft bg-canvas px-4 py-3">
                              <Smartphone className="size-5 shrink-0 text-muted" aria-hidden="true" />
                              <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">
                                <p className="text-sm font-semibold text-ink">
                                  {phoneLabel(p)}
                                  {syncText(p) ? <span className="font-normal text-muted"> · {syncText(p)}</span> : null}
                                </p>
                                <p className="text-xs text-muted">
                                  Set up {formatDateTime(p.createdAt)}
                                  {p.lastUsedAt ? ` · last used ${relativeTime(p.lastUsedAt)}` : ''} · {p.sessionsCount}{' '}
                                  {p.sessionsCount === 1 ? 'session' : 'sessions'}
                                </p>
                                {p.samePhoneAs.length > 0 ? (
                                  <p className="mt-1 text-xs font-semibold text-warning-800">Same phone as {joinNames(p.samePhoneAs)}</p>
                                ) : null}
                              </div>
                              <span className="ml-8 sm:ml-0">
                                <PhoneStatus status={p.status} />
                              </span>
                              <button
                                type="button"
                                onClick={() => revoke(s, p)}
                                className={cn(linkButtonClass, 'text-danger-700 hover:bg-danger-50')}
                              >
                                Revoke
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {past.length > 0 ? (
                        <p className="text-xs text-muted">
                          {past.length} older {past.length === 1 ? 'phone' : 'phones'} rejected or revoked.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft pt-3">
                        <p className="text-xs text-muted">Profile created {formatDateTime(s.createdAt)}</p>
                        <button
                          type="button"
                          disabled={busy === s.id}
                          onClick={() => setActive(s, !s.active)}
                          className={cn(linkButtonClass, s.active ? 'text-warning-800 hover:bg-warning-50' : 'text-success-800 hover:bg-success-50')}
                        >
                          <Power aria-hidden="true" />
                          {s.active ? 'Turn off profile' : 'Turn profile back on'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

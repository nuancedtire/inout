import { useState } from 'react'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import { formatDateTime, formatTime, isoForDateTimeLocal } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'
import { cn } from '#/lib/utils'
import { needsReview, subjectFromSession, type EvidenceSubject, type SessionRow } from '#/routes/admin/-types'
import { SessionEditForm } from './SessionEditForm'
import { duration, FilterChips, linkButtonClass, Panel, StaffAvatar } from './kit'
import { ReasonList, VerificationChip } from './verification'

type Filter = 'all' | 'review' | 'verified' | 'accepted'

function matches(s: EvidenceSubject, f: Filter) {
  if (f === 'review') return needsReview(s)
  if (f === 'verified') return s.verified && !s.accepted
  if (f === 'accepted') return s.accepted
  return true
}

export function SessionSection({
  sessions,
  onUpdate,
  onDelete,
  onDetails,
  savingId,
}: {
  sessions: SessionRow[]
  onUpdate: (sessionId: number, form: { checkInAt: string; checkOutAt: string | undefined }) => Promise<void> | void
  onDelete: (sessionId: number) => Promise<void> | void
  onDetails: (s: EvidenceSubject) => void
  savingId: number | null
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState({ checkInAt: '', checkOutAt: '' })
  const [filter, setFilter] = useState<Filter>('all')
  const subjects = sessions.map(subjectFromSession)
  const visible = subjects.filter((s) => matches(s, filter))
  const count = (f: Filter) => subjects.filter((s) => matches(s, f)).length

  const startEdit = (s: EvidenceSubject) => {
    setEditing(s.sessionId)
    setForm({ checkInAt: isoForDateTimeLocal(s.checkInAt), checkOutAt: isoForDateTimeLocal(s.checkOutAt) })
  }

  const save = async (sessionId: number) => {
    try {
      await onUpdate(sessionId, {
        checkInAt: new Date(form.checkInAt).toISOString(),
        checkOutAt: form.checkOutAt ? new Date(form.checkOutAt).toISOString() : '',
      })
      setEditing(null)
    } catch {
      // The page shows the error; keep the form open so nothing typed is lost.
    }
  }

  const editor = (s: EvidenceSubject) => (
    <SessionEditForm
      checkInAt={form.checkInAt}
      checkOutAt={form.checkOutAt}
      onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
      onSave={() => save(s.sessionId)}
      onCancel={() => setEditing(null)}
      saving={savingId === s.sessionId}
    />
  )

  return (
    <Panel
      tour="session-history"
      title="Sessions"
      count={sessions.length}
      icon={<ListChecks />}
      description="Every check-in and checkout for this date. Edits are saved as admin corrections and logged; the original evidence stays on record."
      flush
    >
      {sessions.length === 0 ? (
        <EmptyState title="No sessions for this date" description="Sessions appear here once staff check in." icon="calendar" />
      ) : (
        <>
          <div className="relative -mx-1 overflow-x-auto border-b border-hairline-soft px-6 py-3">
            <FilterChips
              label="Filter sessions"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'review', label: 'Needs review', count: count('review') },
                { value: 'verified', label: 'Verified', count: count('verified') },
                { value: 'accepted', label: 'Accepted', count: count('accepted') },
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No sessions match this filter.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="relative hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline-soft text-xs font-semibold uppercase tracking-wide text-muted">
                      <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                      <th scope="col" className="px-3 py-3 font-semibold">In</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Out</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Hours</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Verification</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline-soft">
                    {visible.map((s) => (
                      <SessionRowDesktop
                        key={s.sessionId}
                        s={s}
                        editing={editing === s.sessionId}
                        editor={editor(s)}
                        onEdit={() => startEdit(s)}
                        onDelete={() => onDelete(s.sessionId)}
                        onDetails={() => onDetails(s)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="divide-y divide-hairline-soft md:hidden">
                {visible.map((s) => (
                  <li key={s.sessionId} className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <StaffAvatar name={s.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{s.name}</p>
                        <p className="text-sm tabular-nums text-muted">
                          {formatTime(s.checkInAt)} – {s.checkOutAt ? formatTime(s.checkOutAt) : 'still in'}
                          {s.checkOutAt ? ` · ${duration(s.checkInAt, s.checkOutAt)}` : ''}
                        </p>
                      </div>
                      <VerificationChip subject={s} onOpen={() => onDetails(s)} />
                    </div>
                    {needsReview(s) ? <ReasonList reasons={s.reasons} compact className="pl-11" /> : null}
                    {editing === s.sessionId ? (
                      editor(s)
                    ) : (
                      <div className="flex gap-1 pl-9">
                        <button type="button" className={linkButtonClass} onClick={() => startEdit(s)}>
                          <Pencil aria-hidden="true" />
                          Edit times
                        </button>
                        <button type="button" className={cn(linkButtonClass, 'text-danger-700 hover:bg-danger-50')} onClick={() => onDelete(s.sessionId)}>
                          <Trash2 aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  )
}

function SessionRowDesktop({
  s,
  editing,
  editor,
  onEdit,
  onDelete,
  onDetails,
}: {
  s: EvidenceSubject
  editing: boolean
  editor: React.ReactNode
  onEdit: () => void
  onDelete: () => void
  onDetails: () => void
}) {
  return (
    <>
      <tr className={cn('align-top', editing ? 'bg-surface-soft' : 'hover:bg-surface-soft/60')}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-3">
            <StaffAvatar name={s.name} size="sm" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{s.name}</p>
              {s.role ? <p className="text-xs text-muted">{s.role}</p> : null}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 tabular-nums text-body" title={formatDateTime(s.checkInAt)}>
          <span className="leading-8">{formatTime(s.checkInAt)}</span>
        </td>
        <td className="px-3 py-3 tabular-nums text-body" title={s.checkOutAt ? formatDateTime(s.checkOutAt) : undefined}>
          <span className="leading-8">{s.checkOutAt ? formatTime(s.checkOutAt) : <span className="text-muted">Still in</span>}</span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-body">
          <span className="leading-8">{s.checkOutAt ? duration(s.checkInAt, s.checkOutAt) : '—'}</span>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col items-start gap-1.5 pt-0.5">
            <VerificationChip subject={s} onOpen={onDetails} />
            {needsReview(s) ? <ReasonList reasons={s.reasons} compact className="max-w-72 flex-col" /> : null}
            {s.accepted && s.reviewNote ? <p className="max-w-72 truncate text-xs text-muted" title={s.reviewNote}>“{s.reviewNote}”</p> : null}
          </div>
        </td>
        <td className="px-5 py-3">
          <div className="flex justify-end gap-1">
            <button type="button" className={linkButtonClass} onClick={onDetails}>
              Details
            </button>
            <button type="button" className={linkButtonClass} onClick={onEdit} aria-label={`Edit ${s.name}'s times`}>
              <Pencil aria-hidden="true" />
              Edit
            </button>
            <button type="button" className={cn(linkButtonClass, 'text-danger-700 hover:bg-danger-50')} onClick={onDelete} aria-label={`Delete ${s.name}'s session`}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {editing ? (
        <tr className="bg-surface-soft">
          <td colSpan={6} className="px-5 pb-4 pt-1">
            {editor}
          </td>
        </tr>
      ) : null}
    </>
  )
}

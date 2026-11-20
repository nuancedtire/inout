import { useState } from 'react'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { formatTime, parseShiftTime } from '#/utils/dateTime'
import { subjectFromEntry, type EvidenceSubject, type RosterEntryWithStatus } from '#/routes/admin/-types'
import { Pencil, Trash2, LogOut, FileDown, Clock, AlertTriangle, ClipboardList, Link2 } from 'lucide-react'
import { inputClass, linkButtonClass, Panel, StaffAvatar } from './kit'
import { VerificationChip } from './verification'

const LATE_THRESHOLD_MS = 15 * 60 * 1000

type EditForm = { name: string; role: string; shiftStart: string; shiftEnd: string }

function TimeFlag({ label }: { label: string }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-warning-800">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function StatusPill({ e }: { e: RosterEntryWithStatus }) {
  const [label, cls] = e.checkedIn
    ? ['In', 'bg-success-50 text-success-800 ring-success-200']
    : e.checkOutAt
      ? ['Out', 'bg-surface-strong text-body ring-hairline']
      : ['Not in', 'bg-canvas text-muted ring-hairline']
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset', cls)}>
      {e.checkedIn ? <span className="size-1.5 rounded-full bg-success-accessible" aria-hidden="true" /> : null}
      {label}
    </span>
  )
}

export function RosterSection({
  entries,
  viewDate,
  loading,
  onCheckout,
  onUpdate,
  onDelete,
  onAutoCheckout,
  onExport,
  onDetails,
  isToday,
}: {
  entries: RosterEntryWithStatus[]
  viewDate: string
  loading: Record<string, boolean>
  onCheckout: (entryId: number) => Promise<void> | void
  onUpdate: (entryId: number, form: EditForm) => Promise<void>
  onDelete: (entryId: number) => Promise<void> | void
  onAutoCheckout: () => Promise<void> | void
  onExport: () => Promise<void> | void
  onDetails: (s: EvidenceSubject) => void
  isToday: boolean
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState<EditForm>({ name: '', role: '', shiftStart: '', shiftEnd: '' })

  const startEdit = (entry: RosterEntryWithStatus) => {
    setEditing(entry.id)
    setForm({ name: entry.name, role: entry.role || '', shiftStart: entry.shift_start || '', shiftEnd: entry.shift_end || '' })
  }

  const save = async (entryId: number) => {
    try {
      await onUpdate(entryId, form)
      setEditing(null)
    } catch {
      // Error shown by the page; keep the form open.
    }
  }

  const late = (e: RosterEntryWithStatus) => {
    if (!e.checkInAt || !e.shift_start) return false
    const start = parseShiftTime(viewDate, e.shift_start)
    return !!start && new Date(e.checkInAt).getTime() - start.getTime() > LATE_THRESHOLD_MS
  }
  const early = (e: RosterEntryWithStatus) => {
    if (!e.checkOutAt || !e.shift_end) return false
    const end = parseShiftTime(viewDate, e.shift_end)
    return !!end && end.getTime() - new Date(e.checkOutAt).getTime() > LATE_THRESHOLD_MS
  }
  const shift = (e: RosterEntryWithStatus) => (e.shift_start && e.shift_end ? `${e.shift_start}–${e.shift_end}` : null)

  const editor = (entryId: number) => (
    <form
      className="grid grid-cols-2 gap-3 rounded-control border border-hairline-soft bg-canvas p-4 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto] lg:items-end"
      onSubmit={(ev) => {
        ev.preventDefault()
        void save(entryId)
      }}
    >
      <Field label="Name" className="col-span-2 lg:col-span-1">
        <input className={inputClass} value={form.name} required onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
      </Field>
      <Field label="Role" className="col-span-2 lg:col-span-1">
        <input className={inputClass} value={form.role} onChange={(ev) => setForm({ ...form, role: ev.target.value })} />
      </Field>
      <Field label="Shift start">
        <input className={inputClass} value={form.shiftStart} placeholder="08:00" inputMode="numeric" onChange={(ev) => setForm({ ...form, shiftStart: ev.target.value })} />
      </Field>
      <Field label="Shift end">
        <input className={inputClass} value={form.shiftEnd} placeholder="20:00" inputMode="numeric" onChange={(ev) => setForm({ ...form, shiftEnd: ev.target.value })} />
      </Field>
      <div className="col-span-2 flex gap-2 lg:col-span-1">
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="ui-press inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Cancel
        </button>
        <Button type="submit" loading={loading[`saveEntry-${entryId}`]} className="flex-1">
          Save
        </Button>
      </div>
    </form>
  )

  const actions = (e: RosterEntryWithStatus) => (
    <>
      {e.checkedIn ? (
        <button
          type="button"
          className={linkButtonClass}
          onClick={() => onCheckout(e.id)}
          disabled={loading[`checkout-${e.id}`]}
          aria-label={`Check out ${e.name} now`}
        >
          <LogOut aria-hidden="true" />
          Check out
        </button>
      ) : null}
      <button type="button" className={linkButtonClass} onClick={() => startEdit(e)} aria-label={`Edit ${e.name}`}>
        <Pencil aria-hidden="true" />
        <span className="md:sr-only lg:not-sr-only">Edit</span>
      </button>
      <button
        type="button"
        className={cn(linkButtonClass, 'text-danger-700 hover:bg-danger-50')}
        onClick={() => onDelete(e.id)}
        aria-label={`Remove ${e.name} from the rota`}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </>
  )

  return (
    <Panel
      tour="roster-table"
      title="Roster"
      count={entries.length}
      icon={<ClipboardList />}
      description="Export includes identity, location check, verified and review columns for each session."
      actions={
        <>
          {isToday ? (
            <Button variant="secondary" size="sm" onClick={onAutoCheckout} loading={loading['autoCheckout']}>
              <Clock className="size-4" aria-hidden="true" />
              Auto-checkout
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onExport} loading={loading['export']} disabled={entries.length === 0}>
            <FileDown className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        </>
      }
      flush
    >
      {entries.length === 0 ? (
        <EmptyState title="No one on the rota" description="Upload the rota above, or add staff by hand." icon="calendar" />
      ) : (
        <>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline-soft text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Shift</th>
                  <th scope="col" className="px-3 py-3 font-semibold">In</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Out</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {entries.map((e) => {
                  const subject = subjectFromEntry(e)
                  return (
                    <RowGroup key={e.id} editing={editing === e.id} editor={editor(e.id)}>
                      <td className="min-w-52 px-5 py-3">
                        <div className="flex items-center gap-3">
                          <StaffAvatar name={e.name} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-semibold text-ink">
                              {e.name}
                              {e.staffId ? (
                                <Link2 className="size-3.5 text-muted" aria-label="Linked to a staff profile" />
                              ) : null}
                            </p>
                            <p className="text-xs text-muted">
                              {e.role || 'No role'}
                              {e.source === 'manual' ? ' · added on the day' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-body">{shift(e) ?? <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-body">
                        {e.checkInAt ? <>{formatTime(e.checkInAt)}{late(e) ? <TimeFlag label="Late" /> : null}</> : <span className="text-muted">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-body">
                        {e.checkOutAt ? <>{formatTime(e.checkOutAt)}{early(e) ? <TimeFlag label="Early" /> : null}</> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusPill e={e} />
                          {subject ? <VerificationChip subject={subject} onOpen={() => onDetails(subject)} /> : null}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1 whitespace-nowrap">{actions(e)}</div>
                      </td>
                    </RowGroup>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-hairline-soft md:hidden">
            {entries.map((e) => {
              const subject = subjectFromEntry(e)
              return (
                <li key={e.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <StaffAvatar name={e.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold text-ink">
                        <span className="truncate">{e.name}</span>
                        {e.staffId ? <Link2 className="size-3.5 shrink-0 text-muted" aria-label="Linked to a staff profile" /> : null}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {[e.role, shift(e)].filter(Boolean).join(' · ') || 'No role or shift'}
                      </p>
                      {e.checkInAt ? (
                        <p className="text-sm tabular-nums text-body">
                          In {formatTime(e.checkInAt)}
                          {late(e) ? <TimeFlag label="Late" /> : null}
                          {e.checkOutAt ? <> · Out {formatTime(e.checkOutAt)}{early(e) ? <TimeFlag label="Early" /> : null}</> : null}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusPill e={e} />
                      {subject ? <VerificationChip subject={subject} onOpen={() => onDetails(subject)} /> : null}
                    </div>
                  </div>
                  {editing === e.id ? editor(e.id) : <div className="flex flex-wrap gap-1 pl-9">{actions(e)}</div>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}

function RowGroup({ editing, editor, children }: { editing: boolean; editor: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <tr className={cn(editing ? 'bg-surface-soft' : 'hover:bg-surface-soft/60')}>{children}</tr>
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

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

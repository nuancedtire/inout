import { useState } from 'react'
import { EmptyState } from '#/components/EmptyState'
import { Button } from '#/components/Button'
import { Badge } from '#/components/Badge'
import type { RosterEntryWithStatus } from '#/routes/admin/-types'
import { formatTime, parseShiftTime } from '#/utils/dateTime'
import { Pencil, Trash2, LogOut, FileDown, Clock, AlertTriangle } from 'lucide-react'

const LATE_THRESHOLD_MS = 15 * 60 * 1000

export function RosterSection({
  entries,
  viewDate,
  loading,
  onCheckout,
  onUpdate,
  onDelete,
  onAutoCheckout,
  onExport,
}: {
  entries: RosterEntryWithStatus[]
  viewDate: string
  loading: Record<string, boolean>
  onCheckout: (entryId: number) => Promise<void> | void
  onUpdate: (entryId: number, form: { name: string; role: string; shiftStart: string; shiftEnd: string }) => Promise<void> | void
  onDelete: (entryId: number) => Promise<void> | void
  onAutoCheckout: () => Promise<void> | void
  onExport: () => Promise<void> | void
}) {
  const [editingEntry, setEditingEntry] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; role: string; shiftStart: string; shiftEnd: string }>({
    name: '',
    role: '',
    shiftStart: '',
    shiftEnd: '',
  })

  const startEdit = (entry: RosterEntryWithStatus) => {
    setEditingEntry(entry.id)
    setEditForm({
      name: entry.name,
      role: entry.role || '',
      shiftStart: entry.shift_start || '',
      shiftEnd: entry.shift_end || '',
    })
  }

  const save = async (entryId: number) => {
    await onUpdate(entryId, editForm)
    setEditingEntry(null)
  }

  const statusBadge = (e: RosterEntryWithStatus) => {
    if (e.checkOutAt) return <Badge variant="neutral">Out</Badge>
    if (e.checkInAt) return <Badge variant="success">In</Badge>
    return <Badge variant="danger">Missing</Badge>
  }

  const lateFlag = (e: RosterEntryWithStatus) => {
    if (!e.checkInAt || !e.shift_start) return null
    const shiftStart = parseShiftTime(viewDate, e.shift_start)
    if (!shiftStart) return null
    const checkIn = new Date(e.checkInAt)
    if (checkIn.getTime() - shiftStart.getTime() > LATE_THRESHOLD_MS) {
      return (
        <span title="Late check-in" className="inline-flex items-center gap-0.5 text-warning-600 text-xs ml-1">
          <AlertTriangle className="w-3 h-3" />
          Late
        </span>
      )
    }
    return null
  }

  const earlyFlag = (e: RosterEntryWithStatus) => {
    if (!e.checkOutAt || !e.shift_end) return null
    const shiftEnd = parseShiftTime(viewDate, e.shift_end)
    if (!shiftEnd) return null
    const checkOut = new Date(e.checkOutAt)
    if (shiftEnd.getTime() - checkOut.getTime() > LATE_THRESHOLD_MS) {
      return (
        <span title="Early check-out" className="inline-flex items-center gap-0.5 text-warning-600 text-xs ml-1">
          <AlertTriangle className="w-3 h-3" />
          Early
        </span>
      )
    }
    return null
  }

  return (
    <section id="roster" data-tour="roster-table" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-neutral-900">Roster</h2>
          <Badge variant="neutral">{entries.length}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="warning" size="sm" onClick={onAutoCheckout} loading={loading['autoCheckout']}>
            <Clock className="w-3.5 h-3.5" />
            Auto-checkout
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={onExport}
            loading={loading['export']}
            disabled={entries.length === 0}
          >
            <FileDown className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No roster entries" description="Upload the rota or add ad-hoc staff for this date." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="pb-2 font-medium text-neutral-600">Name</th>
                  <th className="pb-2 font-medium text-neutral-600">Role</th>
                  <th className="pb-2 font-medium text-neutral-600">Shift</th>
                  <th className="pb-2 font-medium text-neutral-600">In</th>
                  <th className="pb-2 font-medium text-neutral-600">Out</th>
                  <th className="pb-2 font-medium text-neutral-600">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100">
                    <td className="py-2 text-neutral-900">{e.name}</td>
                    <td className="py-2 text-neutral-600">{e.role || '-'}</td>
                    <td className="py-2 text-neutral-600">
                      {e.shift_start && e.shift_end ? `${e.shift_start} - ${e.shift_end}` : '-'}
                    </td>
                    <td className="py-2 text-neutral-600">
                      {e.checkInAt ? <>{formatTime(e.checkInAt)}{lateFlag(e)}</> : <span className="text-danger-500">—</span>}
                    </td>
                    <td className="py-2 text-neutral-600">
                      {e.checkOutAt ? <>{formatTime(e.checkOutAt)}{earlyFlag(e)}</> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-2">{statusBadge(e)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {e.checkedIn && !e.checkOutAt && (
                          <button
                            className="text-sm text-danger-600 hover:text-danger-700 disabled:opacity-50"
                            onClick={() => onCheckout(e.id)}
                            disabled={loading[`checkout-${e.id}`]}
                          >
                            <LogOut className="w-3.5 h-3.5 inline mr-0.5" />
                            Check out
                          </button>
                        )}
                        {editingEntry === e.id ? (
                          <>
                            <button className="text-sm text-success-600 hover:text-success-700 font-medium" onClick={() => save(e.id)}>
                              Save
                            </button>
                            <button className="text-sm text-neutral-500 hover:text-neutral-700" onClick={() => setEditingEntry(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="text-sm text-primary-600 hover:text-primary-700" onClick={() => startEdit(e)}>
                              <Pencil className="w-3.5 h-3.5 inline mr-0.5" />
                              Edit
                            </button>
                            <button className="text-sm text-danger-600 hover:text-danger-700" onClick={() => onDelete(e.id)}>
                              <Trash2 className="w-3.5 h-3.5 inline mr-0.5" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editingEntry !== null && (
              <div className="mt-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 grid grid-cols-4 gap-2">
                <input
                  className="p-2 border border-neutral-300 rounded-lg text-sm"
                  value={editForm.name}
                  onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })}
                  placeholder="Name"
                />
                <input
                  className="p-2 border border-neutral-300 rounded-lg text-sm"
                  value={editForm.role}
                  onChange={(ev) => setEditForm({ ...editForm, role: ev.target.value })}
                  placeholder="Role"
                />
                <input
                  className="p-2 border border-neutral-300 rounded-lg text-sm"
                  value={editForm.shiftStart}
                  placeholder="HH:MM"
                  onChange={(ev) => setEditForm({ ...editForm, shiftStart: ev.target.value })}
                />
                <input
                  className="p-2 border border-neutral-300 rounded-lg text-sm"
                  value={editForm.shiftEnd}
                  placeholder="HH:MM"
                  onChange={(ev) => setEditForm({ ...editForm, shiftEnd: ev.target.value })}
                />
                <div className="col-span-4 flex gap-2">
                  <button className="text-sm text-success-600 font-medium" onClick={() => save(editingEntry)}>Save</button>
                  <button className="text-sm text-neutral-500" onClick={() => setEditingEntry(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">{e.name}</p>
                    <p className="text-sm text-neutral-500">{e.role || 'No role'}</p>
                  </div>
                  {statusBadge(e)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <p className="text-neutral-600">
                    <span className="text-neutral-400">Shift:</span>{' '}
                    {e.shift_start && e.shift_end ? `${e.shift_start} - ${e.shift_end}` : 'None'}
                  </p>
                  <p className="text-neutral-600">
                    <span className="text-neutral-400">In:</span>{' '}
                    {e.checkInAt ? <>{formatTime(e.checkInAt)}{lateFlag(e)}</> : <span className="text-danger-500">—</span>}
                  </p>
                  <p className="text-neutral-600">
                    <span className="text-neutral-400">Out:</span>{' '}
                    {e.checkOutAt ? <>{formatTime(e.checkOutAt)}{earlyFlag(e)}</> : <span className="text-neutral-400">—</span>}
                  </p>
                </div>
                {editingEntry === e.id ? (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <input
                      className="p-2 border border-neutral-300 rounded-lg text-sm"
                      value={editForm.name}
                      onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })}
                      placeholder="Name"
                    />
                    <input
                      className="p-2 border border-neutral-300 rounded-lg text-sm"
                      value={editForm.role}
                      onChange={(ev) => setEditForm({ ...editForm, role: ev.target.value })}
                      placeholder="Role"
                    />
                    <input
                      className="p-2 border border-neutral-300 rounded-lg text-sm"
                      value={editForm.shiftStart}
                      onChange={(ev) => setEditForm({ ...editForm, shiftStart: ev.target.value })}
                      placeholder="HH:MM"
                    />
                    <input
                      className="p-2 border border-neutral-300 rounded-lg text-sm"
                      value={editForm.shiftEnd}
                      onChange={(ev) => setEditForm({ ...editForm, shiftEnd: ev.target.value })}
                      placeholder="HH:MM"
                    />
                    <div className="col-span-2 flex gap-2">
                      <button className="text-sm text-success-600 font-medium" onClick={() => save(e.id)}>Save</button>
                      <button className="text-sm text-neutral-500" onClick={() => setEditingEntry(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {e.checkedIn && !e.checkOutAt && (
                      <button
                        className="text-sm text-danger-600 disabled:opacity-50"
                        onClick={() => onCheckout(e.id)}
                        disabled={loading[`checkout-${e.id}`]}
                      >
                        <LogOut className="w-3.5 h-3.5 inline mr-0.5" />
                        Check out
                      </button>
                    )}
                    <button className="text-sm text-primary-600" onClick={() => startEdit(e)}>
                      <Pencil className="w-3.5 h-3.5 inline mr-0.5" />
                      Edit
                    </button>
                    <button className="text-sm text-danger-600" onClick={() => onDelete(e.id)}>
                      <Trash2 className="w-3.5 h-3.5 inline mr-0.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

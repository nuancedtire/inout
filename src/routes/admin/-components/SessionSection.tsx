import { useState } from 'react'
import { formatDateTime, isoForDateTimeLocal } from '#/utils/dateTime'
import { EmptyState } from '#/components/EmptyState'
import { Badge } from '#/components/Badge'
import type { SessionRow } from '#/routes/admin/-types'
import { SessionEditForm } from '#/routes/admin/-components/SessionEditForm'
import { Pencil, Trash2 } from 'lucide-react'

export function SessionSection({
  sessions,
  onUpdate,
  onDelete,
}: {
  sessions: SessionRow[]
  onUpdate: (sessionId: number, form: { checkInAt: string; checkOutAt: string | undefined }) => Promise<void> | void
  onDelete: (sessionId: number) => Promise<void> | void
}) {
  const [editingSession, setEditingSession] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ checkInAt: string; checkOutAt: string }>({ checkInAt: '', checkOutAt: '' })

  const startEdit = (session: SessionRow) => {
    setEditingSession(session.id)
    setEditForm({
      checkInAt: isoForDateTimeLocal(session.check_in_at),
      checkOutAt: isoForDateTimeLocal(session.check_out_at),
    })
  }

  const handleChange = (field: 'checkInAt' | 'checkOutAt', value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const save = async (sessionId: number) => {
    await onUpdate(sessionId, {
      checkInAt: editForm.checkInAt,
      checkOutAt: editForm.checkOutAt || undefined,
    })
    setEditingSession(null)
  }

  return (
    <section id="sessions" data-tour="session-history" className="bg-white p-4 rounded-xl shadow-md border border-neutral-200">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold text-neutral-900">Session history</h2>
        <Badge variant="neutral">{sessions.length}</Badge>
      </div>
      {sessions.length === 0 ? (
        <EmptyState title="No sessions" description="Sessions will appear here once staff check in for this date." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="pb-2 font-medium text-neutral-600">Name</th>
                  <th className="pb-2 font-medium text-neutral-600">In</th>
                  <th className="pb-2 font-medium text-neutral-600">Out</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100">
                    <td className="py-2 text-neutral-900">{s.name}</td>
                    <td className="py-2 text-neutral-600">{formatDateTime(s.check_in_at)}</td>
                    <td className="py-2 text-neutral-600">{s.check_out_at ? formatDateTime(s.check_out_at) : '-'}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button className="text-sm text-primary-600 hover:text-primary-700" onClick={() => startEdit(s)}>
                          <Pencil className="w-3.5 h-3.5 inline mr-0.5" />
                          Edit
                        </button>
                        <button className="text-sm text-danger-600 hover:text-danger-700" onClick={() => onDelete(s.id)}>
                          <Trash2 className="w-3.5 h-3.5 inline mr-0.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {editingSession !== null && (
                  <tr className="bg-neutral-50">
                    <td colSpan={4} className="p-3">
                      <SessionEditForm
                        checkInAt={editForm.checkInAt}
                        checkOutAt={editForm.checkOutAt}
                        onChange={handleChange}
                        onSave={() => save(editingSession)}
                        onCancel={() => setEditingSession(null)}
                        className="flex flex-wrap gap-2 items-center"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                <p className="font-medium text-neutral-900">{s.name}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-neutral-600">
                    <span className="text-neutral-400">In:</span> {formatDateTime(s.check_in_at)}
                  </p>
                  <p className="text-neutral-600">
                    <span className="text-neutral-400">Out:</span> {s.check_out_at ? formatDateTime(s.check_out_at) : '-'}
                  </p>
                </div>
                {editingSession === s.id ? (
                  <SessionEditForm
                    checkInAt={editForm.checkInAt}
                    checkOutAt={editForm.checkOutAt}
                    onChange={handleChange}
                    onSave={() => save(s.id)}
                    onCancel={() => setEditingSession(null)}
                    className="space-y-2 mt-3"
                    inputClassName="w-full"
                  />
                ) : (
                  <div className="flex gap-3 mt-3">
                    <button className="text-sm text-primary-600" onClick={() => startEdit(s)}>
                      <Pencil className="w-3.5 h-3.5 inline mr-0.5" />
                      Edit
                    </button>
                    <button className="text-sm text-danger-600" onClick={() => onDelete(s.id)}>
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

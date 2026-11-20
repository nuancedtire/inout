import { useState } from 'react'
import { CircleCheck, Clock, History, ShieldCheck, Smartphone, TriangleAlert, UserRoundX, X } from 'lucide-react'
import { Button } from '#/components/Button'
import { EmptyState } from '#/components/EmptyState'
import { ConfirmDialog, type ConfirmDialogState } from '#/components/ConfirmDialog'
import { adminSetCredentialStatus } from '#/utils/staff.functions'
import { formatDateTime, relativeTime } from '#/utils/dateTime'
import { useAdminContext } from '#/routes/admin/-context'
import type { EnrolmentRow } from '#/routes/admin/-types'
import { AdminDialog, DialogCancel } from './AdminDialog'
import { errorText, Notice, Panel, StaffAvatar } from './kit'

export function phoneLabel(e: Pick<EnrolmentRow, 'label'>) {
  return e.label?.trim() || 'Passkey'
}

export function syncText(e: Pick<EnrolmentRow, 'deviceType' | 'backedUp'>) {
  if (e.deviceType === 'multiDevice' || e.backedUp) return 'Synced passkey'
  if (e.deviceType === 'singleDevice') return 'Stays on this device'
  return null
}

function sessionsText(n: number) {
  if (n === 0) return 'Not used for attendance yet'
  return `Used for ${n} ${n === 1 ? 'session' : 'sessions'} so far`
}

/** Pending phone enrolments as cards with Approve / Reject. */
export function ApprovalsTab({
  pending,
  allEnrolments,
  onChanged,
}: {
  pending: EnrolmentRow[]
  allEnrolments: EnrolmentRow[]
  onChanged: () => Promise<void> | void
}) {
  const { authToken } = useAdminContext()
  const [approving, setApproving] = useState<EnrolmentRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null)
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const recent = allEnrolments
    .filter((e) => e.status !== 'pending' && e.reviewedAt)
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))
    .slice(0, 5)

  const setStatus = async (e: EnrolmentRow, status: 'approved' | 'rejected') => {
    try {
      await adminSetCredentialStatus({ data: { authToken, credentialId: e.credentialId, status } })
      setNotice({
        text: status === 'approved' ? `${e.staffName}'s ${phoneLabel(e)} is approved.` : `${e.staffName}'s ${phoneLabel(e)} was rejected.`,
        tone: 'success',
      })
      await onChanged()
    } catch (err) {
      setNotice({ text: errorText(err, 'Could not update this phone. Please try again.'), tone: 'error' })
      await onChanged()
    }
  }

  const approve = async () => {
    if (!approving) return
    setBusy(true)
    await setStatus(approving, 'approved')
    setBusy(false)
    setApproving(null)
  }

  const reject = (e: EnrolmentRow) =>
    setConfirm({
      title: `Reject ${e.staffName}'s phone?`,
      message: `This ${phoneLabel(e)} stops working for check-in straight away. Attendance already recorded is kept, and ${e.staffName} can set the phone up again with you.`,
      confirmLabel: 'Reject phone',
      confirmVariant: 'danger',
      onConfirm: () => setStatus(e, 'rejected'),
    })

  return (
    <div className="flex flex-col gap-5">
      {notice ? <Notice message={notice.text} tone={notice.tone} onClose={() => setNotice(null)} /> : null}

      <Panel
        tour="approvals"
        title="Phones waiting for approval"
        count={pending.length}
        icon={<Smartphone />}
        description="Each person links their phone once with Face ID, fingerprint or passcode. Approve it only when you know the phone belongs to them. Until then their check-ins work but are flagged."
        flush={pending.length === 0}
      >
        {pending.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No phones waiting"
            description="When someone sets up their phone at check-in, it appears here for you to approve."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((e) => (
              <li key={e.credentialId} className="flex flex-col rounded-md border border-hairline-soft bg-canvas">
                <div className="flex items-start gap-3 p-4">
                  <StaffAvatar name={e.staffName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-ink">{e.staffName}</p>
                    <p className="truncate text-sm text-muted">{e.staffRole || 'No role recorded'}</p>
                  </div>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-warning-50 px-2.5 text-xs font-semibold text-warning-800 ring-1 ring-inset ring-warning-200">
                    <Clock className="size-3.5" aria-hidden="true" />
                    Waiting
                  </span>
                </div>
                <dl className="mx-4 flex flex-col gap-2 border-t border-hairline-soft py-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <dt className="sr-only">Phone</dt>
                    <Smartphone className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <dd className="text-ink">
                      <span className="font-semibold">{phoneLabel(e)}</span>
                      {syncText(e) ? <span className="text-muted"> · {syncText(e)}</span> : null}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <dt className="sr-only">Set up</dt>
                    <Clock className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <dd className="text-body" title={formatDateTime(e.createdAt)}>
                      Set up {relativeTime(e.createdAt)} · {formatDateTime(e.createdAt)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <dt className="sr-only">Use</dt>
                    <History className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <dd className="text-body">{sessionsText(e.sessionsCount)}</dd>
                  </div>
                </dl>
                {e.otherApprovedCount > 0 || !e.staffActive ? (
                  <div className="mx-4 mb-3 flex flex-col gap-2">
                    {e.otherApprovedCount > 0 ? (
                      <p className="flex items-start gap-2 rounded-md bg-warning-50 px-3 py-2.5 text-sm text-warning-800">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          <strong className="font-semibold">Second phone — check with them.</strong> {e.staffName} already has{' '}
                          {e.otherApprovedCount === 1 ? 'an approved phone' : `${e.otherApprovedCount} approved phones`}.
                        </span>
                      </p>
                    ) : null}
                    {!e.staffActive ? (
                      <p className="flex items-start gap-2 rounded-md bg-surface-soft px-3 py-2.5 text-sm text-body">
                        <UserRoundX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>This profile is turned off, so the phone won’t work until it’s turned back on.</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-auto flex gap-2 border-t border-hairline-soft p-3">
                  <Button variant="secondary" onClick={() => reject(e)} className="flex-1">
                    <X className="size-4" aria-hidden="true" />
                    Reject
                  </Button>
                  <Button variant="success" onClick={() => setApproving(e)} className="flex-1">
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {recent.length > 0 ? (
        <Panel title="Recently reviewed" icon={<History />} flush>
          <ul className="divide-y divide-hairline-soft">
            {recent.map((e) => (
              <li key={e.credentialId} className="flex items-center gap-3 px-5 py-3">
                <StaffAvatar name={e.staffName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{e.staffName}</p>
                  <p className="truncate text-sm text-muted">
                    {phoneLabel(e)} · {relativeTime(e.reviewedAt)}
                  </p>
                </div>
                <PhoneStatus status={e.status} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <AdminDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        busy={busy}
        tone="success"
        icon={<ShieldCheck />}
        title={approving ? `Approve ${approving.staffName}'s ${phoneLabel(approving)}?` : ''}
        description="Approve only if you're sure the phone is theirs — for example, they showed it to you, or you set it up together."
        footer={
          <>
            <DialogCancel onClick={() => setApproving(null)} disabled={busy} />
            <Button variant="success" onClick={approve} loading={busy} className="sm:min-w-32">
              Approve phone
            </Button>
          </>
        }
      >
        {approving ? (
          <ul className="flex flex-col gap-2 text-sm text-body">
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-accessible" aria-hidden="true" />
              From now on, check-ins from this phone count as verified when the location check passes.
            </li>
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-accessible" aria-hidden="true" />
              Sessions already recorded keep their “awaiting approval” flag. Accept them on the dashboard if you’re happy.
            </li>
            {approving.otherApprovedCount > 0 ? (
              <li className="flex gap-2 font-semibold text-warning-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {approving.staffName} already has an approved phone. Check they really have two.
              </li>
            ) : null}
          </ul>
        ) : null}
      </AdminDialog>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

export function PhoneStatus({ status }: { status: EnrolmentRow['status'] }) {
  const meta = {
    pending: { label: 'Waiting', icon: Clock, className: 'bg-warning-50 text-warning-800 ring-warning-200' },
    approved: { label: 'Approved', icon: ShieldCheck, className: 'bg-success-50 text-success-800 ring-success-200' },
    rejected: { label: 'Rejected', icon: X, className: 'bg-surface-strong text-body ring-hairline' },
    revoked: { label: 'Revoked', icon: UserRoundX, className: 'bg-surface-strong text-body ring-hairline' },
  }[status]
  const Glyph = meta.icon
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset ${meta.className}`}>
      <Glyph className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

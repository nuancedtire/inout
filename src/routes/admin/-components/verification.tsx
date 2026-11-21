import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  CircleCheck,
  CircleDashed,
  ClockAlert,
  Fingerprint,
  Hourglass,
  LocateOff,
  MapPin,
  MapPinOff,
  MapPinX,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  UserCog,
  UserRound,
  type LucideProps,
} from 'lucide-react'
import { Button } from '#/components/Button'
import { cn } from '#/lib/utils'
import { formatDateTime, formatTime } from '#/utils/dateTime'
import { adminReviewSession } from '#/utils/staff.functions'
import {
  FLAG_REASON_LABEL,
  IDENTITY_LABEL,
  LOCATION_LABEL,
  type SessionFlagReason,
  type Identity,
  type LocationOutcome,
} from '#/utils/verification'
import { useAdminContext } from '#/routes/admin/-context'
import type { EvidenceSubject } from '#/routes/admin/-types'
import { AdminDialog, DialogCancel } from './AdminDialog'
import { errorText } from './kit'

type Icon = ComponentType<LucideProps>

export const REASON_ICON: Record<SessionFlagReason, Icon> = {
  identity_pending: Hourglass,
  identity_self_selected: UserRound,
  location_outside: MapPinOff,
  location_denied: MapPinX,
  location_unavailable: LocateOff,
  location_not_checked: CircleDashed,
  checkout_reported: ClockAlert,
  shared_phone: Smartphone,
}

export type VerificationState = 'verified' | 'flagged' | 'accepted' | 'admin'

export function verificationState(s: Pick<EvidenceSubject, 'verified' | 'accepted' | 'identityIn'>): VerificationState {
  if (s.accepted) return 'accepted'
  if (!s.verified) return 'flagged'
  if (s.identityIn === 'admin') return 'admin'
  return 'verified'
}

const CHIP: Record<VerificationState, { label: string; icon: Icon; className: string; hint: string }> = {
  verified: {
    label: 'Verified',
    icon: ShieldCheck,
    className: 'bg-success-50 text-success-800 ring-success-200',
    hint: 'Passkey and location check passed',
  },
  flagged: {
    label: 'Flagged',
    icon: TriangleAlert,
    className: 'bg-warning-50 text-warning-800 ring-warning-200',
    hint: 'Needs a coordinator to review',
  },
  accepted: {
    label: 'Accepted',
    icon: CircleCheck,
    className: 'bg-surface-strong text-body ring-hairline',
    hint: 'Flagged, then accepted by a coordinator',
  },
  admin: {
    label: 'Admin',
    icon: UserCog,
    className: 'bg-surface-strong text-body ring-hairline',
    hint: 'Recorded or corrected by an administrator',
  },
}

/**
 * Verified / Flagged / Accepted / Admin, always with an icon and a word (never colour alone).
 * With `onOpen` it becomes a button that opens the evidence detail.
 */
export function VerificationChip({ subject, onOpen, className }: { subject: EvidenceSubject; onOpen?: () => void; className?: string }) {
  const state = verificationState(subject)
  const meta = CHIP[state]
  const Glyph = meta.icon
  const body = (
    <>
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={2.25} />
      {meta.label}
    </>
  )
  const base = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-none whitespace-nowrap ring-1 ring-inset',
    meta.className,
    className,
  )
  if (!onOpen) return <span className={base} title={meta.hint}>{body}</span>
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${meta.hint}. Show evidence`}
      aria-label={`${meta.label}: ${meta.hint}. Show evidence for ${subject.name}`}
      className={cn(
        base,
        'ui-press relative cursor-pointer hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'after:absolute after:-inset-2 after:content-[""]',
      )}
    >
      {body}
    </button>
  )
}

/** Flag reasons as icon + words. */
export function ReasonList({ reasons, className, compact }: { reasons: SessionFlagReason[]; className?: string; compact?: boolean }) {
  if (reasons.length === 0) return null
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1', className)}>
      {reasons.map((r) => {
        const Glyph = REASON_ICON[r]
        return (
          <li key={r} className={cn('inline-flex items-center gap-1.5 text-body', compact ? 'text-xs' : 'text-sm')}>
            <Glyph className={cn('shrink-0 text-warning-700', compact ? 'size-3.5' : 'size-4')} aria-hidden="true" />
            {FLAG_REASON_LABEL[r]}
          </li>
        )
      })}
    </ul>
  )
}

// ─── Evidence detail + review ─────────────────────────────────────────

const IDENTITY_ICON: Record<Identity, Icon> = {
  passkey: Fingerprint,
  passkey_pending: Hourglass,
  self_selected: UserRound,
  admin: UserCog,
}

const LOCATION_ICON: Record<LocationOutcome, Icon> = {
  inside: MapPin,
  outside: MapPinOff,
  denied: MapPinX,
  unavailable: LocateOff,
  not_requested: CircleDashed,
}

function goodIdentity(i: Identity) {
  return i === 'passkey' || i === 'admin'
}

function EvidenceLine({ icon: Glyph, label, value, ok, detail }: { icon: Icon; label: string; value: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-success-50 text-success-800' : 'bg-warning-50 text-warning-800',
        )}
      >
        <Glyph className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="text-sm font-semibold text-ink">
          {value}
          {!ok ? <span className="sr-only"> (flagged)</span> : null}
        </p>
        {detail ? <p className="text-xs text-muted">{detail}</p> : null}
      </div>
    </div>
  )
}

function accuracyText(accuracyM: number | null) {
  return accuracyM === null ? undefined : `Phone reported accuracy of ±${accuracyM} m`
}

function EndEvidence({
  heading,
  at,
  identity,
  location,
  accuracyM,
}: {
  heading: string
  at: string
  identity: Identity
  location: LocationOutcome
  accuracyM: number | null
}) {
  const locationOk = identity === 'admin' || location === 'inside'
  return (
    <div className="rounded-control border border-hairline-soft px-4 py-2">
      <div className="flex items-baseline justify-between gap-3 border-b border-hairline-soft pb-2 pt-1">
        <p className="text-sm font-semibold text-ink">{heading}</p>
        <p className="text-sm tabular-nums text-muted" title={formatDateTime(at)}>{formatTime(at)}</p>
      </div>
      <div className="divide-y divide-hairline-soft">
        <EvidenceLine
          icon={IDENTITY_ICON[identity]}
          label="Who"
          value={identity === 'admin' ? 'Admin' : IDENTITY_LABEL[identity]}
          ok={goodIdentity(identity)}
          detail={
            identity === 'passkey'
              ? 'Approved phone, unlocked with Face ID, fingerprint or passcode'
              : identity === 'passkey_pending'
                ? 'Phone not yet approved by a coordinator'
                : identity === 'self_selected'
                  ? 'Chose their name without Face ID'
                  : 'Recorded or corrected by an administrator'
          }
        />
        <EvidenceLine
          icon={LOCATION_ICON[location]}
          label="Where"
          value={identity === 'admin' && location === 'not_requested' ? 'Not needed for admin entries' : LOCATION_LABEL[location]}
          ok={locationOk}
          detail={accuracyText(accuracyM)}
        />
      </div>
    </div>
  )
}

const SUGGESTIONS: Record<SessionFlagReason, string> = {
  location_unavailable: 'Poor signal — confirmed in person',
  location_denied: 'Location refused — confirmed in person',
  location_outside: 'Seen on shift — location reading was off',
  location_not_checked: 'Confirmed on shift in person',
  identity_pending: 'Phone since approved — it was them',
  identity_self_selected: 'Used name option — confirmed in person',
  checkout_reported: 'Leaving time checked with the rota',
  shared_phone: 'Phone lent to a colleague — both confirmed in person',
}

export function suggestionsFor(reasons: SessionFlagReason[]) {
  const list = reasons.map((r) => SUGGESTIONS[r])
  list.push('Seen on shift by the coordinator')
  return [...new Set(list)].slice(0, 4)
}

const NOTE_MAX = 500

/**
 * Evidence for one session, with acceptance of a flagged session in place. `mode` 'review'
 * opens straight on the note form (the dashboard's one-tap Accept).
 */
export function EvidenceDialog({
  subject,
  mode: initialMode = 'details',
  onClose,
  onAccepted,
}: {
  subject: EvidenceSubject | null
  mode?: 'details' | 'review'
  onClose: () => void
  onAccepted: (sessionId: number, note: string, reviewedAt: string) => void
}) {
  const { authToken } = useAdminContext()
  const [mode, setMode] = useState(initialMode)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sessionId = subject?.sessionId

  useEffect(() => {
    setMode(initialMode)
    setNote('')
    setError('')
  }, [sessionId, initialMode])

  const suggestions = useMemo(() => (subject ? suggestionsFor(subject.reasons) : []), [subject])
  if (!subject) return <AdminDialog open={false} onOpenChange={onClose} title="" />

  const state = verificationState(subject)
  const canAccept = state === 'flagged'
  const reviewing = mode === 'review' && canAccept
  const trimmed = note.trim()

  const accept = async () => {
    if (!trimmed) {
      setError('Add a short note so others know why this was accepted.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { reviewedAt } = await adminReviewSession({ data: { authToken, sessionId: subject.sessionId, note: trimmed } })
      onAccepted(subject.sessionId, trimmed, reviewedAt)
      onClose()
    } catch (e) {
      setError(errorText(e, 'Could not accept this session. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const description = (
    <span className="flex items-center gap-2">
      {subject.role ? <span>{subject.role}</span> : null}
      {subject.role ? <span aria-hidden="true">·</span> : null}
      <span>{subject.checkOutAt ? `${formatTime(subject.checkInAt)} – ${formatTime(subject.checkOutAt)}` : `In since ${formatTime(subject.checkInAt)}`}</span>
    </span>
  )

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={saving}
      size="lg"
      title={reviewing ? `Accept ${subject.name}'s session` : subject.name}
      description={description}
      icon={reviewing ? <CircleCheck /> : <StateGlyph state={state} />}
      tone={reviewing ? 'success' : state === 'flagged' ? 'warning' : state === 'verified' ? 'success' : 'neutral'}
      footer={
        reviewing ? (
          <>
            <DialogCancel onClick={() => (initialMode === 'review' ? onClose() : setMode('details'))} disabled={saving}>
              {initialMode === 'review' ? 'Cancel' : 'Back'}
            </DialogCancel>
            <Button variant="success" onClick={accept} loading={saving} className="sm:min-w-36">
              Accept session
            </Button>
          </>
        ) : canAccept ? (
          <>
            <DialogCancel onClick={onClose}>Close</DialogCancel>
            <Button variant="success" onClick={() => setMode('review')} className="sm:min-w-36">
              <CircleCheck className="size-4" aria-hidden="true" />
              Accept with a note
            </Button>
          </>
        ) : (
          <DialogCancel onClick={onClose}>Close</DialogCancel>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <StatusSummary subject={subject} />

        {reviewing ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-body">
              Accepting keeps the original evidence and records your note in the audit log. Pick a reason or write your own.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested notes">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setNote(s)
                    setError('')
                  }}
                  aria-pressed={note === s}
                  className={cn(
                    'ui-press min-h-9 rounded-full border px-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    note === s ? 'border-ink bg-ink text-white' : 'border-hairline bg-canvas text-ink hover:border-neutral-400',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <label htmlFor="review-note" className="text-sm font-semibold text-ink">
              Note
            </label>
            <textarea
              id="review-note"
              rows={3}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                setError('')
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby="review-note-help"
              placeholder="e.g. Poor signal — confirmed in person"
              className={cn(
                'block w-full resize-none rounded-control border bg-canvas px-3.5 py-3 text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none',
                error ? 'border-danger-600' : 'border-hairline hover:border-neutral-400 focus:border-ink focus:shadow-[0_0_0_1px_var(--color-ink)]',
              )}
            />
            <div id="review-note-help" aria-live="polite" className="flex items-start justify-between gap-3 text-xs">
              <span className={error ? 'text-danger-700' : 'text-muted'}>{error || 'Visible to coordinators and in the CSV export.'}</span>
              <span className="tabular-nums text-muted">{note.length}/{NOTE_MAX}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <EndEvidence
                heading="Check-in"
                at={subject.checkInAt}
                identity={subject.identityIn ?? 'self_selected'}
                location={subject.locationIn ?? 'not_requested'}
                accuracyM={subject.accuracyInM}
              />
              {subject.checkOutAt ? (
                <EndEvidence
                  heading="Checkout"
                  at={subject.checkOutAt}
                  identity={subject.identityOut ?? 'self_selected'}
                  location={subject.locationOut ?? 'not_requested'}
                  accuracyM={subject.accuracyOutM}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 rounded-control border border-dashed border-hairline px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-ink">Checkout</p>
                  <p className="text-sm text-muted">Still on shift. Checkout evidence appears when they check out.</p>
                </div>
              )}
            </div>
            {subject.samePhoneWith.length ? <SamePhoneNote names={subject.samePhoneWith} /> : null}
            {subject.accepted ? (
              <div className="rounded-control bg-surface-soft px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Accepted by a coordinator
                </p>
                {subject.reviewNote ? <p className="mt-1 text-sm text-body">“{subject.reviewNote}”</p> : null}
              </div>
            ) : null}
            <p className="text-xs leading-relaxed text-muted">
              A passed location check means the phone reported a position inside the department area. It is not proof of
              presence. Staff coordinates are never stored — only the outcome and the reported accuracy.
            </p>
          </>
        )}
        {error && !reviewing ? <p className="text-sm text-danger-700">{error}</p> : null}
      </div>
    </AdminDialog>
  )
}

/** Who else this phone checked in or out around this session. */
export function SamePhoneNote({ names }: { names: readonly string[] }) {
  return (
    <div className="flex items-start gap-3 rounded-control bg-warning-50 px-4 py-3">
      <Smartphone className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink">Same phone as {joinNames(names)}</p>
        <p className="mt-0.5 text-body">
          This phone was also used to check in or out within 12 hours of this session. It may be an honest lend, or one
          person checking in for another — worth a quick word.
        </p>
      </div>
    </div>
  )
}

export function joinNames(names: readonly string[]) {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function StateGlyph({ state }: { state: VerificationState }) {
  const Glyph = CHIP[state].icon
  return <Glyph />
}

function StatusSummary({ subject }: { subject: EvidenceSubject }) {
  const state = verificationState(subject)
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-control px-4 py-3',
        state === 'flagged' ? 'bg-warning-50' : state === 'verified' ? 'bg-success-50' : 'bg-surface-soft',
      )}
    >
      <div className="flex items-center gap-2">
        <VerificationChip subject={subject} className="bg-canvas" />
        <p className="text-sm text-body">{CHIP[state].hint}</p>
      </div>
      <ReasonList reasons={subject.reasons} />
    </div>
  )
}

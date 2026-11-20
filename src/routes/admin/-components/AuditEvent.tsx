import { useState, type ReactNode } from 'react'
import {
  CircleCheck,
  ClipboardList,
  Clock,
  Link2,
  LogIn,
  LogOut,
  MapPinned,
  Pencil,
  Power,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Undo2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate, formatDateTime, formatTime, relativeTime } from '#/utils/dateTime'
import { IDENTITY_LABEL, LOCATION_LABEL, readIdentity, readLocation } from '#/utils/verification'

export type AuditEventItem = {
  id: number
  event: string
  details: Record<string, unknown> | null
  actor: string | null
  created_at: string
}

export type AuditCategory = 'attendance' | 'phones' | 'admin'
type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand'

type Rendered = { icon: LucideIcon; tone: Tone; category: AuditCategory; text: ReactNode; meta?: string }

const TONE: Record<Tone, string> = {
  success: 'bg-success-50 text-success-800',
  warning: 'bg-warning-50 text-warning-800',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-surface-strong text-body',
  brand: 'bg-primary-50 text-accent-accessible',
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function Who({ d, fallback = 'Someone' }: { d: Record<string, unknown>; fallback?: string }) {
  return <strong className="font-semibold text-ink">{str(d.name) ?? fallback}</strong>
}

function evidenceMeta(d: Record<string, unknown>) {
  if (!d.identity && !d.location) return undefined
  const identity = readIdentity(str(d.identity))
  const location = readLocation(str(d.location))
  return identity === 'admin' ? 'Admin' : `${IDENTITY_LABEL[identity]} · ${LOCATION_LABEL[location]}`
}

/** Plain-English rendering of each audit event the backend writes. Unknown events fall back to their code. */
export function renderAuditEvent(e: AuditEventItem): Rendered {
  const d = e.details ?? {}
  const phone = str(d.label) ?? 'phone'
  switch (e.event) {
    case 'checked_in':
      return { icon: LogIn, tone: 'success', category: 'attendance', text: <><Who d={d} /> checked in</>, meta: evidenceMeta(d) }
    case 'checked_out':
      return { icon: LogOut, tone: 'neutral', category: 'attendance', text: <><Who d={d} /> checked out</>, meta: evidenceMeta(d) }
    case 'checkin_undone':
      return { icon: Undo2, tone: 'warning', category: 'attendance', text: <><Who d={d} /> undid their check-in</> }
    case 'checkout_undone':
      return { icon: Undo2, tone: 'warning', category: 'attendance', text: <><Who d={d} /> undid their checkout</> }
    case 'manual_checkin':
      return {
        icon: UserPlus,
        tone: 'success',
        category: 'attendance',
        text: <><Who d={d} /> added themselves{str(d.role) ? ` as ${str(d.role)}` : ''} and checked in</>,
        meta: evidenceMeta(d),
      }
    case 'admin_manual_checkin':
      return { icon: LogIn, tone: 'neutral', category: 'admin', text: <>Admin checked in <Who d={d} fallback="someone" /></> }
    case 'auto_checkout_run': {
      const n = num(d.closed) ?? 0
      return { icon: Clock, tone: 'neutral', category: 'admin', text: <>Auto-checkout closed {n} {n === 1 ? 'session' : 'sessions'}</> }
    }
    case 'rota_uploaded': {
      const count = num(d.staffCount)
      const linked = num(d.linked)
      return {
        icon: ClipboardList,
        tone: 'brand',
        category: 'admin',
        text: <>Rota uploaded for {str(d.date) ? formatDate(str(d.date)) : 'a date'}{count !== null ? ` — ${count} staff` : ''}</>,
        meta: linked !== null ? `${linked} linked to staff profiles${num(d.unlinked) ? `, ${num(d.unlinked)} not linked` : ''}` : undefined,
      }
    }
    case 'adhoc_staff_added':
      return { icon: UserPlus, tone: 'brand', category: 'admin', text: <><Who d={d} /> added to the rota{str(d.role) ? ` as ${str(d.role)}` : ''}</> }
    case 'roster_entry_updated':
      return { icon: Pencil, tone: 'neutral', category: 'admin', text: <>Roster entry edited</>, meta: changesMeta(d.changes) }
    case 'roster_entry_deleted':
      return { icon: Trash2, tone: 'danger', category: 'admin', text: <><Who d={d} /> removed from the rota</> }
    case 'roster_entry_linked':
      return { icon: Link2, tone: 'neutral', category: 'phones', text: <>Rota name linked to a staff profile</> }
    case 'roster_entry_unlinked':
      return { icon: Link2, tone: 'neutral', category: 'phones', text: <>Rota name unlinked from its staff profile</> }
    case 'admin_session_updated':
      return { icon: Pencil, tone: 'warning', category: 'admin', text: <>Session times corrected by admin</>, meta: sessionTimesMeta(d) }
    case 'admin_session_deleted':
      return { icon: Trash2, tone: 'danger', category: 'admin', text: <>Session deleted</> }
    case 'session_accepted':
      return {
        icon: CircleCheck,
        tone: 'success',
        category: 'admin',
        text: <>Flagged session accepted</>,
        meta: str(d.note) ? `“${str(d.note)}”` : undefined,
      }
    case 'passkey_enrolled':
      return { icon: Smartphone, tone: 'brand', category: 'phones', text: <><Who d={d} /> set up their {phone}</>, meta: 'Waiting for approval' }
    case 'passkey_approved':
      return { icon: ShieldCheck, tone: 'success', category: 'phones', text: <><Who d={d} />’s phone approved</> }
    case 'passkey_rejected':
      return { icon: X, tone: 'danger', category: 'phones', text: <><Who d={d} />’s phone rejected</> }
    case 'passkey_revoked':
      return { icon: ShieldAlert, tone: 'danger', category: 'phones', text: <><Who d={d} />’s phone revoked</>, meta: 'It no longer works for check-in' }
    case 'passkey_counter_regression':
      return {
        icon: ShieldAlert,
        tone: 'danger',
        category: 'phones',
        text: <>Passkey refused: possible copy of a phone’s passkey</>,
        meta: 'The signature counter went backwards. Check with the person and consider revoking the phone.',
      }
    case 'staff_deactivated':
      return { icon: Power, tone: 'warning', category: 'phones', text: <><Who d={d} />’s profile turned off</> }
    case 'staff_activated':
      return { icon: Power, tone: 'success', category: 'phones', text: <><Who d={d} />’s profile turned back on</> }
    case 'site_area_updated':
      return {
        icon: MapPinned,
        tone: 'brand',
        category: 'admin',
        text: <>Department area updated</>,
        meta: num(d.radiusM) !== null ? `Radius ${num(d.radiusM)} m · accuracy limit ${num(d.accuracyCeilingM)} m` : undefined,
      }
    case 'audit_pruned':
      return { icon: Trash2, tone: 'neutral', category: 'admin', text: <>Old audit entries removed ({num(d.pruned) ?? 0})</> }
    default:
      return { icon: ClipboardList, tone: 'neutral', category: 'admin', text: <>{e.event.replace(/_/g, ' ')}</> }
  }
}

function changesMeta(changes: unknown) {
  if (!changes || typeof changes !== 'object') return undefined
  const c = changes as Record<string, unknown>
  const parts = [str(c.name) && `name ${str(c.name)}`, c.role !== undefined && `role ${str(c.role) ?? 'cleared'}`, (str(c.shiftStart) || str(c.shiftEnd)) && `shift ${str(c.shiftStart) ?? '?'}–${str(c.shiftEnd) ?? '?'}`]
  const text = parts.filter(Boolean).join(' · ')
  return text || undefined
}

function sessionTimesMeta(d: Record<string, unknown>) {
  const inAt = str(d.checkInAt)
  const outAt = d.checkOutAt === '' ? 'reopened' : str(d.checkOutAt)
  const parts = [inAt && `in ${formatTime(inAt)}`, outAt && (outAt === 'reopened' ? 'checkout cleared' : `out ${formatTime(outAt)}`)]
  return parts.filter(Boolean).join(' · ') || undefined
}

const ACTOR: Record<string, string> = { admin: 'Coordinator', staff: 'Staff', system: 'System' }

// Identifiers that mean nothing to a coordinator. Coordinates are never written to the audit log.
const HIDDEN_KEYS = new Set(['credentialId', 'raw'])

export function AuditEvent({ event }: { event: AuditEventItem }) {
  const [open, setOpen] = useState(false)
  const r = renderAuditEvent(event)
  const details = Object.entries(event.details ?? {}).filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== undefined && v !== '')
  const Glyph = r.icon

  return (
    <li className="flex gap-3 px-5 py-3.5">
      <span aria-hidden="true" className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', TONE[r.tone])}>
        <Glyph className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <p className="min-w-0 flex-1 text-sm text-body">{r.text}</p>
          <p className="shrink-0 text-xs tabular-nums text-muted" title={formatDateTime(event.created_at)}>
            {formatTime(event.created_at)} · {relativeTime(event.created_at)}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {ACTOR[event.actor ?? 'system'] ?? event.actor}
          {r.meta ? <> · {r.meta}</> : null}
          {details.length ? (
            <>
              {' · '}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="relative font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus after:absolute after:-inset-3 after:content-['']"
              >
                {open ? 'Hide details' : 'Details'}
              </button>
            </>
          ) : null}
        </p>
        {open ? (
          <dl className="animate-reveal mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md bg-surface-soft px-3 py-2 text-xs">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{humanKey(k)}</dt>
                <dd className="break-words font-medium text-ink">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  )
}

function humanKey(k: string) {
  const words = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

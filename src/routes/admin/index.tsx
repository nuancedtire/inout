import { useState, type ComponentType } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CalendarDays, LogIn, Building2, ShieldCheck, Smartphone, type LucideProps } from 'lucide-react'
import { useAdminContext } from '#/routes/admin/-context'
import { DailySummary } from '#/routes/admin/-components/DailySummary'
import { WhoIsInSection } from '#/routes/admin/-components/WhoIsInSection'
import { NeedsReviewPanel } from '#/routes/admin/-components/NeedsReviewPanel'
import { EvidenceDialog } from '#/routes/admin/-components/verification'
import { acceptInDashboard, useDashboard } from '#/routes/admin/-components/useDashboard'
import { Bone, LoadError, Page, PanelSkeleton } from '#/routes/admin/-components/kit'
import { needsReview, subjectFromSession, type EvidenceSubject } from '#/routes/admin/-types'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function StatCard({
  icon: Icon,
  label,
  value,
  of,
  sub,
  tone = 'neutral',
  progress,
}: {
  icon: ComponentType<LucideProps>
  label: string
  value: number
  of?: number
  sub: string
  tone?: 'neutral' | 'success' | 'brand' | 'warning'
  progress?: number
}) {
  const toneClass = {
    neutral: 'bg-surface-strong text-body',
    success: 'bg-success-50 text-success-800',
    brand: 'bg-primary-50 text-accent-accessible',
    warning: 'bg-warning-50 text-warning-800',
  }[tone]
  const barClass = { neutral: 'bg-neutral-600', success: 'bg-success-accessible', brand: 'bg-primary-500', warning: 'bg-warning-600' }[tone]
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-hairline-soft bg-canvas p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('flex size-7 items-center justify-center rounded-full', toneClass)}>
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
        <p className="truncate text-sm font-medium text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold leading-none tracking-tight text-ink tabular-nums">
        {value}
        {of !== undefined ? <span className="text-lg font-medium text-muted"> / {of}</span> : null}
      </p>
      <p className="mt-1.5 text-sm text-muted">{sub}</p>
      {progress !== undefined ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden="true">
          <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', barClass)} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <Page>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-card border border-hairline-soft bg-canvas p-5 shadow-card">
            <Bone className="h-4 w-24" />
            <Bone className="h-8 w-16" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
      </div>
      <PanelSkeleton rows={2} />
      <PanelSkeleton rows={3} />
      <span className="sr-only" role="status">Loading dashboard…</span>
    </Page>
  )
}

function AdminDashboard() {
  const { viewDate, today } = useAdminContext()
  const { data, loading, error, retry, patch } = useDashboard()
  const [dialog, setDialog] = useState<{ subject: EvidenceSubject; mode: 'details' | 'review' } | null>(null)

  if (loading && !data) return <DashboardSkeleton />
  if (error && !data) {
    return (
      <Page>
        <LoadError title="Could not load the dashboard" message={error} onRetry={retry} />
      </Page>
    )
  }
  if (!data) return null

  const { entries, present, missingCheckIn, missingCheckOut, pendingEnrolments } = data
  const subjects = data.sessions.map(subjectFromSession)
  const flagged = subjects.filter(needsReview).length
  const verified = subjects.filter((s) => s.verified && !s.accepted).length
  const checkedInCount = entries.filter((e) => e.checkInAt).length
  const stillInCount = present.length
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  const isToday = viewDate === today

  return (
    <Page className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {pendingEnrolments > 0 ? (
        <Link
          to="/admin/staff"
          search={{ tab: 'approvals' }}
          className="ui-press group flex items-center gap-4 rounded-card border border-primary-100 bg-primary-50 px-4 py-3.5 text-ink hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-5"
        >
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-accent-accessible shadow-card">
            <Smartphone className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {pendingEnrolments === 1 ? '1 phone is' : `${pendingEnrolments} phones are`} waiting for approval
            </span>
            <span className="block text-sm text-body">New phones work straight away but stay flagged until you approve them.</span>
          </span>
          <span className="hidden items-center gap-1 text-sm font-semibold text-accent-accessible sm:inline-flex">
            Review
          </span>
          <ArrowRight className="size-5 shrink-0 text-accent-accessible transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-tour="stat-cards">
        <StatCard icon={CalendarDays} label="On rota" value={entries.length} sub={isToday ? 'scheduled today' : 'scheduled this day'} />
        <StatCard
          icon={LogIn}
          label="Checked in"
          value={checkedInCount}
          of={entries.length || undefined}
          sub={entries.length - checkedInCount > 0 ? `${entries.length - checkedInCount} not yet` : 'everyone so far'}
          tone="success"
          progress={pct(checkedInCount, entries.length)}
        />
        <StatCard
          icon={Building2}
          label="On site now"
          value={stillInCount}
          sub={`${Math.max(0, checkedInCount - stillInCount)} checked out`}
          tone="brand"
          progress={pct(stillInCount, entries.length)}
        />
        <StatCard
          icon={ShieldCheck}
          label="Verified"
          value={verified}
          of={subjects.length || undefined}
          sub={flagged ? `${flagged} to review` : subjects.length ? 'nothing to review' : 'no sessions yet'}
          tone={flagged ? 'warning' : 'success'}
          progress={pct(verified + subjects.filter((s) => s.accepted).length, subjects.length)}
        />
      </div>

      <NeedsReviewPanel
        subjects={subjects}
        onDetails={(subject) => setDialog({ subject, mode: 'details' })}
        onAccept={(subject) => setDialog({ subject, mode: 'review' })}
      />

      <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <WhoIsInSection present={present} onDetails={(subject) => setDialog({ subject, mode: 'details' })} />
        <DailySummary
          missingCheckIn={missingCheckIn}
          missingCheckOut={missingCheckOut}
          entries={entries}
          viewDate={viewDate}
          isToday={isToday}
        />
      </div>

      <EvidenceDialog
        subject={dialog?.subject ?? null}
        mode={dialog?.mode}
        onClose={() => setDialog(null)}
        onAccepted={(sessionId, note) => patch((d) => acceptInDashboard(d, sessionId, note))}
      />
    </Page>
  )
}

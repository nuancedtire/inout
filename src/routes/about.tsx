import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { Wordmark } from '#/components/brand/Wordmark'

export const Route = createFileRoute('/about')({
  component: About,
})

const STEPS = [
  'Admin uploads the daily staff rota (Excel or CSV).',
  'One permanent QR poster is printed for the department.',
  'Staff scan it once, set up Face ID, then slide to check in or out.',
  'Admin dashboard shows who is in, late, early, and weekly hours.',
]

function About() {
  return (
    <main className="min-h-svh bg-surface-soft px-4 py-10 pt-safe sm:py-16">
      <div className="mx-auto max-w-2xl">
        <header className="animate-reveal text-center">
          <Wordmark as="h1" size="lg" animate="run" />
          <p className="mx-auto mt-6 max-w-[52ch] text-lg leading-relaxed text-body text-pretty">
            A lightweight staff in/out system built for hospital wards. Staff scan a QR code on the
            notice board to check in and out. Admin uploads the daily rota, and the system tracks who is
            present, handles late arrivals, early departures, and generates weekly hour rollups.
          </p>
        </header>

        <section
          aria-labelledby="how-it-works"
          className="animate-reveal mt-12 rounded-card border border-hairline-soft bg-canvas p-6 shadow-card sm:p-8 [animation-delay:60ms]"
        >
          <h2 id="how-it-works" className="text-lg font-semibold text-ink">How it works</h2>
          <ol className="mt-5 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold tabular-nums text-accent-accessible ring-1 ring-inset ring-primary-100"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed text-body">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="stack"
          className="animate-reveal mt-4 rounded-card border border-hairline-soft bg-canvas p-6 shadow-card sm:p-8 [animation-delay:100ms]"
        >
          <h2 id="stack" className="text-lg font-semibold text-ink">Stack</h2>
          <p className="mt-3 leading-relaxed text-body">
            Built with TanStack Start, React 19, TypeScript, Tailwind CSS v4, Drizzle ORM. Deployed on
            Cloudflare Workers with D1 (SQLite).
          </p>
        </section>

        <footer className="mt-10 flex flex-col items-center gap-2 text-center">
          <a
            href="https://github.com/nuancedtire/inout"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium text-accent-accessible hover:bg-primary-50"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            github.com/nuancedtire/inout
          </a>
          <p className="text-sm text-muted">Maintained by Nous Research.</p>
        </footer>
      </div>
    </main>
  )
}

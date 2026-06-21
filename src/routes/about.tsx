import { createFileRoute } from '@tanstack/react-router'
import { QrCode, Github } from 'lucide-react'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8 space-y-8">
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
            <QrCode className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900">InOut</h1>
        </div>
        <p className="text-neutral-600 leading-relaxed">
          A lightweight staff in/out system built for hospital wards.
          Staff scan a daily QR code on the notice board to check in and out.
          Admin uploads the daily rota, and the system tracks who is present,
          handles late arrivals, early departures, and generates weekly hour rollups.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">How it works</h2>
        <ul className="space-y-2 text-neutral-600">
          <li className="flex gap-2">
            <span className="text-primary-500 font-bold shrink-0">1.</span>
            Admin uploads the daily staff rota (Excel or CSV).
          </li>
          <li className="flex gap-2">
            <span className="text-primary-500 font-bold shrink-0">2.</span>
            A single QR code is generated for the day and printed.
          </li>
          <li className="flex gap-2">
            <span className="text-primary-500 font-bold shrink-0">3.</span>
            Staff scan the QR and slide to check in or out.
          </li>
          <li className="flex gap-2">
            <span className="text-primary-500 font-bold shrink-0">4.</span>
            Admin dashboard shows who is in, late, early, and weekly hours.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Stack</h2>
        <p className="text-neutral-600">
          Built with TanStack Start, React 19, TypeScript, Tailwind CSS v4.
          Deployed on Cloudflare Workers with D1 (SQLite).
        </p>
      </section>

      <section className="pt-4 border-t border-neutral-200 space-y-3">
        <a
          href="https://github.com/nuancedtire/attendance-qr-cf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
        >
          <Github className="w-4 h-4" />
          github.com/nuancedtire/inout
        </a>
        <p className="text-sm text-neutral-400">
          Maintained by Nous Research.
        </p>
      </section>
    </main>
  )
}

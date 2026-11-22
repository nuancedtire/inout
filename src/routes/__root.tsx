import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'

import appCss from '../styles.css?url'
import { ErrorFallback } from '../components/ErrorFallback'
import { RunnerMark } from '../components/brand/RunnerMark'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'InOut' },
      { name: 'description', content: 'Staff check-in and check-out.' },
      { name: 'application-name', content: 'InOut' },
      // Matches the light app surface so the browser chrome and home-screen launch blend in.
      { name: 'theme-color', content: '#f7f7f7' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'InOut' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'format-detection', content: 'telephone=no' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico?v=3', sizes: '16x16 24x24 32x32 48x48 64x64' },
      { rel: 'icon', href: '/favicon.svg?v=3', type: 'image/svg+xml', sizes: 'any' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=3', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.json?v=3' },
    ],
  }),
  errorComponent: ErrorFallback,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <main className="min-h-svh flex items-center justify-center bg-surface-soft px-4 py-12 pt-safe">
      <div className="animate-reveal w-full max-w-sm text-center">
        <div className="relative mx-auto mb-6 w-fit">
          <RunnerMark size={96} animate="run" className="rm-decorative" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-accent-accessible">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink text-balance">This page has checked out</h1>
        <p className="mt-2 text-muted text-pretty">The page you are looking for does not exist or has moved.</p>
        <Link
          to="/"
          search={{ token: '' }}
          className="ui-press mt-8 inline-flex min-h-11 items-center justify-center rounded-control bg-accent-accessible px-6 text-sm font-semibold text-white hover:bg-accent-accessible-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface-soft text-ink antialiased">
        {children}
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: import.meta.env.PROD
              ? `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(console.error)`
              : `if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.filter(r=>(r.active||r.waiting||r.installing)?.scriptURL===location.origin+'/sw.js').map(r=>r.unregister()))).then(()=>caches.keys()).then(ks=>Promise.all(ks.filter(k=>k.startsWith('inout-qr-')).map(k=>caches.delete(k)))).catch(console.error)`,
          }}
        />
      </body>
    </html>
  )
}

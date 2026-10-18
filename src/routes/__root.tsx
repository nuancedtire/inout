import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'

import appCss from '../styles.css?url'
import { ErrorFallback } from '../components/ErrorFallback'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'InOut' },
      { name: 'theme-color', content: '#e00b41' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico?v=2', sizes: '16x16 24x24 32x32 48x48 64x64' },
      { rel: 'icon', href: '/favicon.svg?v=2', type: 'image/svg+xml', sizes: 'any' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=2', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.json?v=2' },
    ],
  }),
  errorComponent: ErrorFallback,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-surface-soft">
      <div className="max-w-md w-full bg-canvas rounded-xl shadow-md p-6 text-center">
        <h1 className="text-4xl font-bold text-muted-soft mb-2">404</h1>
        <p className="text-lg font-medium text-ink mb-2">Page not found</p>
        <p className="text-muted mb-6">The page you are looking for does not exist.</p>
        <Link
          to="/"
          search={{ token: '' }}
          className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
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
      <body className="bg-canvas text-ink">
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

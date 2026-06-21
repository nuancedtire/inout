import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'

import appCss from '../styles.css?url'
import { ErrorFallback } from '../components/ErrorFallback'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Attendance QR' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: ErrorFallback,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-6 text-center">
        <h1 className="text-4xl font-bold text-neutral-300 mb-2">404</h1>
        <p className="text-lg font-medium text-neutral-900 mb-2">Page not found</p>
        <p className="text-neutral-600 mb-6">The page you are looking for does not exist.</p>
        <Link
          to="/"
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
      <body className="bg-neutral-50 text-neutral-900">
        {children}
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `addEventListener('DOMContentLoaded',()=>{if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')})`,
          }}
        />
      </body>
    </html>
  )
}

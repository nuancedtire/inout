import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The daily public QR display was replaced by one permanent, admin-only check-in poster.
 * Old bookmarks land on the poster page (behind the admin PIN).
 */
export const Route = createFileRoute('/qr')({
  beforeLoad: () => {
    throw redirect({ to: '/print-qr', replace: true })
  },
})

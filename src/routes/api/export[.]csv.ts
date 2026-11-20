import { createFileRoute } from '@tanstack/react-router'
import { adminExportSessions } from '#/utils/sessions.functions'
import { buildAttendanceCsv } from '#/utils/exportCsv'

/**
 * Authenticated CSV export endpoint.
 * Requires an authToken query parameter (from admin login).
 * Example: /api/export.csv?start=2026-06-20&end=2026-06-20&token=<session-token>
 */
export const Route = createFileRoute('/api/export.csv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const startDate = url.searchParams.get('start') ?? new Date().toISOString().slice(0, 10)
        const endDate = url.searchParams.get('end') ?? startDate
        const authToken = url.searchParams.get('token')

        if (!authToken) {
          return new Response('Missing auth token', { status: 401 })
        }

        try {
          const { rows: sessionRows } = await adminExportSessions({
            data: { startDate, endDate, authToken },
          })

          const csv = buildAttendanceCsv(sessionRows)

          return new Response(csv, {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="inout-${startDate}.csv"`,
            },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Export failed'
          if (msg.includes('expired') || msg.includes('Invalid admin')) {
            return new Response('Session expired', { status: 401 })
          }
          if (msg === 'Invalid date') return new Response(msg, { status: 400 })
          return new Response('Export failed', { status: 500 })
        }
      },
    },
  },
})

/**
 * Worker entry: TanStack Start's request handler plus a Cron Trigger handler for shift-end
 * reminders (wrangler.jsonc `triggers.crons`). Start detects this file as its server entry.
 */
import handler from '@tanstack/react-start/server-entry'
import { getDb } from '#/db/client'
import { runShiftEndReminders } from '#/db/reminders'

export default {
  fetch: handler.fetch,

  /** Never throws: a failed run is logged and the next run (five minutes later) carries on. */
  async scheduled(controller: ScheduledController): Promise<void> {
    const started = Date.now()
    try {
      const result = await runShiftEndReminders(await getDb(), { now: new Date(controller.scheduledTime) })
      console.log(JSON.stringify({ event: 'checkout_reminders', cron: controller.cron, ...result, ms: Date.now() - started }))
    } catch (e) {
      console.error(JSON.stringify({
        event: 'checkout_reminders_failed',
        cron: controller.cron,
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  },
}

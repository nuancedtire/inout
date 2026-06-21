import { getDb } from '#/db/client'

export async function logAudit(event: string, details?: Record<string, unknown>, actor?: string) {
  const db = await getDb()
  await db
    .prepare('INSERT INTO audit_log (event, details, actor) VALUES (?, ?, ?)')
    .bind(event, details ? JSON.stringify(details) : null, actor ?? null)
    .run()
}



import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
  foreignKey,
} from 'drizzle-orm/sqlite-core'

export const rotas = sqliteTable('rotas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  token: text('token').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const rosterEntries = sqliteTable(
  'roster_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rotaId: integer('rota_id').notNull(),
    name: text('name').notNull(),
    role: text('role'),
    shiftStart: text('shift_start'),
    shiftEnd: text('shift_end'),
    source: text('source').notNull().default('rota'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    rotaFk: foreignKey({
      columns: [table.rotaId],
      foreignColumns: [rotas.id],
    }).onDelete('cascade'),
    rotaIdx: index('idx_roster_rota').on(table.rotaId),
    // Composite covers ORDER BY name after rota_id filter — avoids filesort
    rotaNameIdx: index('idx_roster_rota_name').on(table.rotaId, table.name),
  }),
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rosterEntryId: integer('roster_entry_id').notNull(),
    checkInAt: text('check_in_at').notNull(),
    checkOutAt: text('check_out_at'),
    qrTokenIn: text('qr_token_in'),
    qrTokenOut: text('qr_token_out'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    entryFk: foreignKey({
      columns: [table.rosterEntryId],
      foreignColumns: [rosterEntries.id],
    }),
    entryIdx: index('idx_sessions_entry').on(table.rosterEntryId),
    checkinIdx: index('idx_sessions_checkin').on(table.checkInAt),
    entryOutIdx: index('idx_sessions_entry_out').on(
      table.rosterEntryId,
      table.checkOutAt,
    ),
    // Covers getStaffHistory: WHERE roster_entry_id = ? ORDER BY check_in_at DESC
    entryCheckinIdx: index('idx_sessions_entry_checkin').on(table.rosterEntryId, table.checkInAt),
    oneOpenUnique: uniqueIndex('idx_sessions_one_open')
      .on(table.rosterEntryId)
      .where(sql`check_out_at IS NULL`),
  }),
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    event: text('event').notNull(),
    details: text('details'),
    actor: text('actor'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    createdIdx: index('idx_audit_created').on(table.createdAt),
  }),
)

export type Rota = typeof rotas.$inferSelect
export type NewRota = typeof rotas.$inferInsert
export type RosterEntry = typeof rosterEntries.$inferSelect
export type NewRosterEntry = typeof rosterEntries.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert

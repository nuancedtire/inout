import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  integer,
  real,
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

/** Stable staff record shared across daily rotas. Staff are deactivated, never deleted. */
export const staff = sqliteTable(
  'staff',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** Lowercased, trimmed, whitespace-collapsed, accents stripped — see utils/staffNames.ts. */
    normalizedName: text('normalized_name').notNull(),
    role: text('role'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    normalizedNameIdx: index('idx_staff_normalized_name').on(table.normalizedName),
  }),
)

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
    /** Nullable link to the stable staff record. Historical rows stay null. */
    staffId: integer('staff_id'),
  },
  (table) => ({
    rotaFk: foreignKey({
      columns: [table.rotaId],
      foreignColumns: [rotas.id],
    }).onDelete('cascade'),
    staffFk: foreignKey({
      columns: [table.staffId],
      foreignColumns: [staff.id],
    }),
    staffIdx: index('idx_roster_staff').on(table.staffId),
    // A staff record appears at most once on a given day's rota.
    rotaStaffUnique: uniqueIndex('idx_roster_rota_staff')
      .on(table.rotaId, table.staffId)
      .where(sql`staff_id IS NOT NULL`),
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
    // Evidence (all nullable; NULL reads as self_selected / not_requested). Coordinates are never stored.
    identityIn: text('identity_in', { enum: ['passkey', 'passkey_pending', 'self_selected', 'admin'] }),
    identityOut: text('identity_out', { enum: ['passkey', 'passkey_pending', 'self_selected', 'admin'] }),
    credentialIdIn: text('credential_id_in'),
    credentialIdOut: text('credential_id_out'),
    locationIn: text('location_in', { enum: ['inside', 'outside', 'denied', 'unavailable', 'not_requested'] }),
    locationOut: text('location_out', { enum: ['inside', 'outside', 'denied', 'unavailable', 'not_requested'] }),
    accuracyInM: integer('accuracy_in_m'),
    accuracyOutM: integer('accuracy_out_m'),
    reviewState: text('review_state', { enum: ['accepted'] }),
    reviewedAt: text('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    /** When the "Still at work?" push reminder was claimed for this session (at most one per session). */
    reminderSentAt: text('reminder_sent_at'),
    /** NULL = checked out normally; 'reported' = the staff member entered the time later (flagged). */
    checkoutSource: text('checkout_source', { enum: ['reported'] }),
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
    // Shift-end reminder scan: open sessions by check-in time.
    openCheckinIdx: index('idx_sessions_open_checkin')
      .on(table.checkInAt)
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

export const staffCredentials = sqliteTable(
  'staff_credentials',
  {
    /** Base64url WebAuthn credential ID. */
    id: text('id').primaryKey(),
    staffId: integer('staff_id').notNull(),
    /** Base64url COSE public key. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    /** JSON array of authenticator transports. */
    transports: text('transports'),
    deviceType: text('device_type', { enum: ['singleDevice', 'multiDevice'] }),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
    aaguid: text('aaguid'),
    label: text('label'),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'revoked'] }).notNull().default('pending'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
    reviewedAt: text('reviewed_at'),
    reviewedBy: text('reviewed_by'),
  },
  (table) => ({
    staffFk: foreignKey({
      columns: [table.staffId],
      foreignColumns: [staff.id],
    }),
    staffIdx: index('idx_credentials_staff').on(table.staffId),
    statusIdx: index('idx_credentials_status').on(table.status),
  }),
)

/** Single-use WebAuthn challenges. Workers are stateless, so challenges live in D1 with an expiry. */
export const webauthnChallenges = sqliteTable(
  'webauthn_challenges',
  {
    challenge: text('challenge').primaryKey(),
    purpose: text('purpose', { enum: ['register', 'authenticate'] }).notNull(),
    staffId: integer('staff_id'),
    rosterEntryId: integer('roster_entry_id'),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    expiresIdx: index('idx_challenges_expires').on(table.expiresAt),
  }),
)

/** Department area for the location check. One row (id = 1). Never holds staff coordinates. */
export const siteSettings = sqliteTable('site_settings', {
  id: integer('id').primaryKey(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  radiusM: integer('radius_m').notNull().default(150),
  accuracyCeilingM: integer('accuracy_ceiling_m').notNull().default(100),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  /** Permanent check-in QR code (12 base32 characters). Admin-only; replaceable. */
  qrToken: text('qr_token'),
})

/**
 * Web Push subscriptions for shift-end reminders, bound to a stable staff record. The endpoint
 * is a capability URL at a known push service; p256dh/auth are the browser's encryption keys.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    staffId: integer('staff_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** Coarse device label ("iPhone", "Android"), never the full User-Agent. */
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    lastSuccessAt: text('last_success_at'),
    /** Consecutive failed deliveries; reset on success. */
    failureCount: integer('failure_count').notNull().default(0),
  },
  (table) => ({
    staffFk: foreignKey({
      columns: [table.staffId],
      foreignColumns: [staff.id],
    }),
    staffIdx: index('idx_push_subscriptions_staff').on(table.staffId),
  }),
)

export type Rota = typeof rotas.$inferSelect
export type NewRota = typeof rotas.$inferInsert
export type RosterEntry = typeof rosterEntries.$inferSelect
export type NewRosterEntry = typeof rosterEntries.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Staff = typeof staff.$inferSelect
export type NewStaff = typeof staff.$inferInsert
export type StaffCredential = typeof staffCredentials.$inferSelect
export type NewStaffCredential = typeof staffCredentials.$inferInsert
export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect
export type SiteSettings = typeof siteSettings.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert

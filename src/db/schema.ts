export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rota_id INTEGER NOT NULL REFERENCES rotas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  shift_start TEXT,
  shift_end TEXT,
  source TEXT NOT NULL DEFAULT 'rota',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roster_entry_id INTEGER NOT NULL,
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  qr_token_in TEXT,
  qr_token_out TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (roster_entry_id) REFERENCES roster_entries(id)
);

-- Prevent duplicate open sessions (race-condition guard)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_open
  ON sessions(roster_entry_id) WHERE check_out_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  details TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roster_rota ON roster_entries(rota_id);
CREATE INDEX IF NOT EXISTS idx_sessions_entry ON sessions(roster_entry_id);
CREATE INDEX IF NOT EXISTS idx_sessions_checkin ON sessions(check_in_at);
-- Composite index for "who is in" / get-status queries
CREATE INDEX IF NOT EXISTS idx_sessions_entry_out
  ON sessions(roster_entry_id, check_out_at);
-- Index for audit log pruning and sorting
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`;

export interface Rota {
  id: number
  date: string
  token: string
  created_at: string
}

export interface RosterEntry {
  id: number
  rota_id: number
  name: string
  role: string | null
  shift_start: string | null
  shift_end: string | null
  source: 'rota' | 'manual'
  created_at: string
}

export interface Session {
  id: number
  roster_entry_id: number
  check_in_at: string
  check_out_at: string | null
  qr_token_in: string | null
  qr_token_out: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  event: string
  details: string | null
  actor: string | null
  created_at: string
}

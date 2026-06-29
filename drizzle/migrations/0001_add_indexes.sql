-- Composite index on roster_entries(rota_id, name)
-- Covers ORDER BY name after rota_id filter; avoids a filesort on the
-- most common dashboard query (getRosterWithStatusImpl).
CREATE INDEX `idx_roster_rota_name` ON `roster_entries` (`rota_id`,`name`);--> statement-breakpoint

-- Composite index on sessions(roster_entry_id, check_in_at)
-- Covers getStaffHistory: WHERE roster_entry_id = ? ORDER BY check_in_at DESC
-- without a separate sort step.
CREATE INDEX `idx_sessions_entry_checkin` ON `sessions` (`roster_entry_id`,`check_in_at`);

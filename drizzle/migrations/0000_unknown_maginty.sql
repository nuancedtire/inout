CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`details` text,
	`actor` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rota_id` integer NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`shift_start` text,
	`shift_end` text,
	`source` text DEFAULT 'rota' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rota_id`) REFERENCES `rotas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_roster_rota` ON `roster_entries` (`rota_id`);--> statement-breakpoint
CREATE INDEX `idx_roster_rota_name` ON `roster_entries` (`rota_id`,`name`);--> statement-breakpoint
CREATE TABLE `rotas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rotas_date_unique` ON `rotas` (`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roster_entry_id` integer NOT NULL,
	`check_in_at` text NOT NULL,
	`check_out_at` text,
	`qr_token_in` text,
	`qr_token_out` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`roster_entry_id`) REFERENCES `roster_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_entry` ON `sessions` (`roster_entry_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_checkin` ON `sessions` (`check_in_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_entry_out` ON `sessions` (`roster_entry_id`,`check_out_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_entry_checkin` ON `sessions` (`roster_entry_id`,`check_in_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_one_open` ON `sessions` (`roster_entry_id`) WHERE check_out_at IS NULL;